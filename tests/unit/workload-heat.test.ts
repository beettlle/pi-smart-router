/**
 * Workload heat map + soft fleet affinity tests (SP-215, #115).
 *
 * Covers: privacy-safe heat records (no prompt text), persistence with
 * provenance, soft first-turn bias via expected-cost on fixture fleets, and
 * hard-gate preservation (price delta, pin cache economics). Hysteresis /
 * live-affinity coverage lands with pinning/heat-affinity.ts (Step 2).
 */

import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  selectTierByExpectedCost,
  MAX_HEAT_BIAS_STRENGTH,
} from '../../src/domain/routing/expected-cost.js';
import {
  isValidHeatKey,
  WorkloadHeatMap,
  WORKLOAD_HEAT_ARTIFACT_VERSION,
  type WorkloadHeatKey,
} from '../../src/domain/routing/workload-heat.js';
import {
  clearWorkloadHeatFile,
  getWorkloadHeatPath,
  loadWorkloadHeatMap,
  saveWorkloadHeatMap,
} from '../../src/infrastructure/telemetry/workload-heat-store.js';
import {
  DEFAULT_WORKLOAD_HEAT_CONFIG,
  type WorkloadHeatConfig,
} from '../../src/domain/types/schemas.js';
import type { ModelProfile, PriceCatalog, SessionPin } from '../../src/domain/types/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'test',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeCatalog(): PriceCatalog {
  return {
    registry_snapshot: {},
    user_overrides: {},
    last_updated: '2026-01-01T00:00:00.000Z',
    source: 'yaml_fallback',
  };
}

function makePin(overrides: Partial<SessionPin> = {}): SessionPin {
  return {
    session_id: 'sess-1',
    pinned_model_id: 'frontier-a',
    pin_reason: 'initial',
    has_ever_switched: false,
    consecutive_upstream_errors: 0,
    consecutive_tool_failures: 0,
    last_tool_failure_signature: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const FP_A = '0123456789abcdef';
const FP_B = 'fedcba9876543210';

function fpKey(fingerprint: string = FP_A): WorkloadHeatKey {
  return { requirementFingerprint: fingerprint, clusterId: null };
}

function heatConfig(overrides: Partial<WorkloadHeatConfig> = {}): WorkloadHeatConfig {
  return { ...DEFAULT_WORKLOAD_HEAT_CONFIG, ...overrides };
}

/** Fleet where frontier barely beats economical on expected cost. */
const biasFleet: ModelProfile[] = [
  makeModel({
    id: 'econ-a',
    tier: 'economical-cloud',
    provider: 'openai',
    pricing: { fallback_cost_per_1m: 0.5 },
  }),
  makeModel({
    id: 'frontier-a',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    pricing: { fallback_cost_per_1m: 3.0 },
  }),
];

// ─── Heat record schema (privacy-safe) ──────────────────────────────────────

describe('workload heat record schema (SP-215)', () => {
  it('accepts fingerprint and cluster-id keys only', () => {
    expect(isValidHeatKey(fpKey())).toBe(true);
    expect(isValidHeatKey({ requirementFingerprint: null, clusterId: 'code_edit' })).toBe(true);
    expect(
      isValidHeatKey({ requirementFingerprint: FP_A, clusterId: 'code_edit' }),
    ).toBe(true);
  });

  it('rejects keys that could carry prompt text', () => {
    expect(isValidHeatKey({ requirementFingerprint: null, clusterId: null })).toBe(false);
    // Free-form strings (e.g. raw prompt text) fail the digest/cluster patterns.
    expect(
      isValidHeatKey({ requirementFingerprint: 'refactor the auth module', clusterId: null }),
    ).toBe(false);
    expect(
      isValidHeatKey({ requirementFingerprint: null, clusterId: 'Fix the login bug NOW' }),
    ).toBe(false);
  });

  it('rejects invalid keys/tiers/model ids loudly without storing', () => {
    const map = new WorkloadHeatMap();
    map.recordOutcome({ requirementFingerprint: 'not-a-digest', clusterId: null }, 'economical-cloud', 'econ-a', true);
    map.recordOutcome(fpKey(), 'economical-cloud', 'bad model id with spaces', true);
    expect(map.size).toBe(0);
  });

  it('records tier + model success counts per key', () => {
    const map = new WorkloadHeatMap();
    map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
    map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
    map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', false);
    map.recordOutcome(fpKey(), 'frontier-cloud', 'frontier-a', true);

    const summaries = map.summarize(fpKey());
    expect(summaries).not.toBeNull();
    const econ = summaries!.find((s) => s.tier === 'economical-cloud')!;
    expect(econ.attempts).toBe(3);
    expect(econ.successes).toBe(2);
    expect(econ.successRate).toBeCloseTo(2 / 3, 5);

    const cell = map.getCell('fingerprint', FP_A)!;
    expect(cell.tiers.get('frontier-cloud')).toEqual({ attempts: 1, successes: 1 });
  });

  it('merges fingerprint and cluster key spaces on summarize', () => {
    const map = new WorkloadHeatMap();
    map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
    map.recordOutcome(
      { requirementFingerprint: null, clusterId: 'code_edit' },
      'economical-cloud',
      'econ-a',
      true,
    );

    const merged = map.summarize({ requirementFingerprint: FP_A, clusterId: 'code_edit' });
    expect(merged!.find((s) => s.tier === 'economical-cloud')!.attempts).toBe(2);
  });

  it('evicts oldest cells past maxEntries (poisoning bound)', () => {
    const map = new WorkloadHeatMap({ maxEntries: 2 });
    map.recordOutcome(fpKey('aaaaaaaaaaaaaaaa'), 'economical-cloud', 'econ-a', true);
    map.recordOutcome(fpKey('bbbbbbbbbbbbbbbb'), 'economical-cloud', 'econ-a', true);
    map.recordOutcome(fpKey('cccccccccccccccc'), 'economical-cloud', 'econ-a', true);

    expect(map.getCell('fingerprint', 'aaaaaaaaaaaaaaaa')).toBeNull();
    expect(map.getCell('fingerprint', 'cccccccccccccccc')).not.toBeNull();
  });

  it('decays counts and drops cold cells', () => {
    const map = new WorkloadHeatMap();
    map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
    map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
    map.recordOutcome(fpKey(FP_B), 'frontier-cloud', 'frontier-a', true);

    map.decay(0.5);
    expect(map.getCell('fingerprint', FP_A)!.tiers.get('economical-cloud')).toEqual({
      attempts: 1,
      successes: 1,
    });
    // Single-count cell decays to zero and is dropped.
    expect(map.getCell('fingerprint', FP_B)).toBeNull();
  });
});

// ─── Affinity resolution ─────────────────────────────────────────────────────

describe('resolveAffinity', () => {
  it('returns null until min_samples is reached', () => {
    const map = new WorkloadHeatMap();
    map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
    map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);

    expect(map.resolveAffinity(fpKey(), heatConfig({ min_samples: 3 }))).toBeNull();
  });

  it('returns null when the success margin is below threshold', () => {
    const map = new WorkloadHeatMap();
    for (let i = 0; i < 4; i += 1) {
      map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
      map.recordOutcome(fpKey(), 'frontier-cloud', 'frontier-a', true);
    }

    expect(map.resolveAffinity(fpKey(), heatConfig({ min_success_margin: 0.15 }))).toBeNull();
  });

  it('resolves a capped-strength affinity for a proven hot tier', () => {
    const map = new WorkloadHeatMap();
    for (let i = 0; i < 5; i += 1) {
      map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
    }
    for (let i = 0; i < 5; i += 1) {
      map.recordOutcome(fpKey(), 'frontier-cloud', 'frontier-a', i < 1);
    }

    const affinity = map.resolveAffinity(fpKey(), heatConfig({ bias_strength: 0.9 }))!;
    expect(affinity.tier).toBe('economical-cloud');
    expect(affinity.strength).toBe(MAX_HEAT_BIAS_STRENGTH); // config value capped
    expect(affinity.samples).toBe(5);
  });

  it('returns null when heat is disabled', () => {
    const map = new WorkloadHeatMap();
    for (let i = 0; i < 5; i += 1) {
      map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', true);
    }

    expect(map.resolveAffinity(fpKey(), heatConfig({ enabled: false }))).toBeNull();
  });
});

// ─── Persistence with provenance ─────────────────────────────────────────────

describe('workload heat persistence (SP-215)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workload-heat-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips the histogram under .pi-smart-router/ with provenance', () => {
    const map = new WorkloadHeatMap();
    for (let i = 0; i < 3; i += 1) {
      map.recordOutcome(fpKey(), 'economical-cloud', 'econ-a', i !== 2);
    }

    const artifact = saveWorkloadHeatMap(map, dir, { note: 'sp-215 test' });
    expect(artifact.version).toBe(WORKLOAD_HEAT_ARTIFACT_VERSION);
    expect(artifact.provenance.source).toBe('operator-local');
    expect(artifact.provenance.created_at).toBeTruthy();
    expect(existsSync(getWorkloadHeatPath(dir))).toBe(true);

    const loaded = loadWorkloadHeatMap(dir);
    const cell = loaded.getCell('fingerprint', FP_A)!;
    expect(cell.tiers.get('economical-cloud')).toEqual({ attempts: 3, successes: 2 });
  });

  it('persisted artifact contains no prompt text — only fingerprints, tiers, model ids, counts', () => {
    const map = new WorkloadHeatMap();
    map.recordOutcome(
      { requirementFingerprint: FP_A, clusterId: 'code_edit' },
      'economical-cloud',
      'econ-a',
      true,
    );
    saveWorkloadHeatMap(map, dir);

    const raw = readFileSync(getWorkloadHeatPath(dir), 'utf8');
    const parsed = JSON.parse(raw) as { cells: Array<{ key: string }> };
    for (const cell of parsed.cells) {
      expect(cell.key).toMatch(/^([0-9a-f]{16}|[a-z][a-z0-9_]*)$/);
    }
    // No free-text fields beyond bounded provenance note/source.
    expect(raw).not.toMatch(/prompt/i);
  });

  it('loads cold (empty map) when the file is missing or malformed', () => {
    expect(loadWorkloadHeatMap(dir).size).toBe(0);

    saveWorkloadHeatMap(new WorkloadHeatMap(), dir);
    rmSync(getWorkloadHeatPath(dir));
    expect(loadWorkloadHeatMap(dir).size).toBe(0);
  });

  it('clear path removes the persisted artifact (router-reset analog)', () => {
    saveWorkloadHeatMap(new WorkloadHeatMap(), dir);
    expect(clearWorkloadHeatFile(dir)).toBe(true);
    expect(existsSync(getWorkloadHeatPath(dir))).toBe(false);
    expect(clearWorkloadHeatFile(dir)).toBe(false);
  });

  it('importArtifact throws on invalid artifacts (fail loud)', () => {
    expect(() => WorkloadHeatMap.importArtifact({ version: 99 })).toThrow(
      /Invalid workload heat artifact/,
    );
  });
});

// ─── Soft first-turn bias via expected-cost ──────────────────────────────────

describe('soft heat bias in selectTierByExpectedCost (SP-215)', () => {
  // pSuccess 0.1: econ E = 0.1*0.5 + 0.9*(0.5+3.0) = 3.2 > frontier 3.0 → frontier wins cold.
  const coldInput = {
    fleet: biasFleet,
    priceCatalog: makeCatalog(),
    estTokens: 1_000_000,
    pSuccessCheap: 0.1,
    alpha: 1,
    localZeroReady: false,
  } as const;

  it('frontier wins cold-start without heat', () => {
    const result = selectTierByExpectedCost(coldInput);
    expect(result.tierHint).toBe('frontier-cloud');
    expect(result.heatBiasApplied).toBe(false);
  });

  it('soft bias flips the first-turn pick toward the heat-preferred tier', () => {
    const result = selectTierByExpectedCost({
      ...coldInput,
      heatBias: { tier: 'economical-cloud', strength: 0.1 },
    });

    // 3.2 * 0.9 = 2.88 < 3.0 → heat-preferred economical wins.
    expect(result.tierHint).toBe('economical-cloud');
    expect(result.heatBiasApplied).toBe(true);
    expect(result.rationale).toContain('heat affinity soft bias');
  });

  it('bias strength is capped at MAX_HEAT_BIAS_STRENGTH', () => {
    const result = selectTierByExpectedCost({
      ...coldInput,
      heatBias: { tier: 'economical-cloud', strength: 5 },
    });
    const econ = result.tierCosts.find((c) => c.tier === 'economical-cloud')!;
    expect(econ.adjustedExpectedCostUsd).toBeCloseTo(3.2 * (1 - MAX_HEAT_BIAS_STRENGTH), 6);
    expect(econ.heatBiasApplied).toBe(true);
  });

  it('bias toward a non-competing tier leaves the pick unchanged', () => {
    const result = selectTierByExpectedCost({
      ...coldInput,
      heatBias: { tier: 'zero-tier', strength: 0.25 },
    });
    expect(result.tierHint).toBe('frontier-cloud');
  });

  it('never overrides the hard price-delta gate', () => {
    // delta 3.0 - 2.9 = 0.1 < MIN_PRICE_DELTA_PER_1M → no hint even with bias.
    const tightFleet: ModelProfile[] = [
      makeModel({
        id: 'econ-a',
        tier: 'economical-cloud',
        pricing: { fallback_cost_per_1m: 2.9 },
      }),
      makeModel({
        id: 'frontier-a',
        tier: 'frontier-cloud',
        pricing: { fallback_cost_per_1m: 3.0 },
      }),
    ];

    const result = selectTierByExpectedCost({
      fleet: tightFleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      pSuccessCheap: 0.95,
      alpha: 1,
      localZeroReady: false,
      heatBias: { tier: 'economical-cloud', strength: MAX_HEAT_BIAS_STRENGTH },
    });

    expect(result.tierHint).toBeNull();
    expect(result.reasonCode).toBe('expected_cost_price_delta_insufficient');
  });

  it('never overrides pin cache economics (FR-008)', () => {
    const pinnedModel = makeModel({
      id: 'frontier-a',
      tier: 'frontier-cloud',
      provider: 'anthropic',
      pricing: { fallback_cost_per_1m: 3.0 },
    });
    const economicalCandidate = makeModel({
      id: 'econ-a',
      tier: 'economical-cloud',
      provider: 'openai',
      pricing: { fallback_cost_per_1m: 0.5 },
    });

    const result = selectTierByExpectedCost({
      fleet: [economicalCandidate, pinnedModel],
      priceCatalog: makeCatalog(),
      estTokens: 5_000,
      pSuccessCheap: 0.95,
      alpha: 1,
      localZeroReady: false,
      pinnedModel,
      sessionPin: makePin({ pinned_model_id: pinnedModel.id }),
      heatBias: { tier: 'economical-cloud', strength: MAX_HEAT_BIAS_STRENGTH },
    });

    expect(result.blockedByPinEconomics).toBe(true);
    expect(result.tierHint).toBe('frontier-cloud');
    expect(result.reasonCode).toBe('expected_cost_pin_cache_economics');
  });
});
