/**
 * SP-312 / #193 — mixed capability-source fairness within a tier.
 *
 * Raw ingest scores live on a compressed scale (~0.5–0.85) while pattern
 * defaults sit at 0.7–0.95, so a benchmark-grounded model used to rank below
 * every ungrounded same-tier model purely because of its capability source.
 * `withBenchmarkCapabilities` now rescales each grounded vector per dimension
 * as `score × max(1, familyDefault / familyCohortMax)`:
 *  - the cohort-best grounded model in a family ties the ungrounded family
 *    default (no systematic source penalty),
 *  - every other grounded model ranks below it in proportion to its measured
 *    distance from the best (remaining gaps are benchmark standing, not source),
 *  - the transform is strictly monotonic per dimension (grounded relative
 *    order preserved) and lift-only (grounded models never drop below their
 *    measured scores — e.g. UNKNOWN_DEFAULTS rows such as gpt-5.3-codex keep
 *    raw scores instead of regressing to 0.6/0.65/0.6).
 *
 * Exact values are pinned against a hand-written synthetic artifact so the
 * assertions stay independent of the mapper implementation and of refreshes
 * of the checked-in artifact; the checked-in artifact is covered by
 * relational invariants (ties, ordering, lift-only).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { parseBenchmarkProfilesArtifact } from '../../scripts/ingest-benchmark-profiles.js';
import {
  DEFAULT_BENCHMARK_PROFILES_PATH,
  getBenchmarkFamilyCohortMax,
  mapPiModelToProfile,
  resetBenchmarkProfilesCacheForTests,
  scaleBenchmarkCapabilitiesToFamily,
  setBenchmarkProfilesPathForTests,
  type PiModelInput,
} from '../../src/config/pi-model-mapper.js';

function makeInput(overrides: Partial<PiModelInput>): PiModelInput {
  return {
    provider: '',
    id: 'unknown',
    ...overrides,
  };
}

/** Hand-computed synthetic rows exercising two pattern families. */
const SYNTHETIC_ROWS = [
  // FRONTIER family (claude-opus / claude-sonnet rules, defaults 0.95)
  { id: 'claude-opus-4-5', caps: { reasoning: 0.8, code_gen: 0.6, tool_use: 0.5 } },
  { id: 'claude-sonnet-4-6', caps: { reasoning: 0.6, code_gen: 0.8, tool_use: 0.7 } },
  // ECONOMICAL family (haiku / flash rules, defaults 0.7 / 0.75 / 0.7)
  { id: 'claude-haiku-4-5', caps: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 } },
  { id: 'gemini-2.5-flash', caps: { reasoning: 0.4, code_gen: 0.45, tool_use: 0.3 } },
] as const;

const tempDirs: string[] = [];

function writeSyntheticArtifact(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sp312-capability-scale-'));
  tempDirs.push(dir);
  const artifact = {
    version: 1,
    provenance: {
      source_urls: { swebench_verified: 'https://www.swebench.com/' },
      scrape_date: '2026-11-01',
      catalog_freeze_date: '2026-11-01',
    },
    models: SYNTHETIC_ROWS.map((row) => ({
      model_id: row.id,
      capabilities: row.caps,
      benchmark_sources: {
        swebench_verified: { raw_score: 50, normalized: 0.5 },
      },
    })),
  };
  const filePath = join(dir, 'benchmark-profiles.json');
  writeFileSync(filePath, JSON.stringify(artifact));
  return filePath;
}

function readCheckedInArtifact() {
  return parseBenchmarkProfilesArtifact(
    JSON.parse(readFileSync(DEFAULT_BENCHMARK_PROFILES_PATH, 'utf8')),
  );
}

afterEach(() => {
  resetBenchmarkProfilesCacheForTests();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('scaleBenchmarkCapabilitiesToFamily (pure transform)', () => {
  it('lifts the cohort-best grounded model exactly to the family default', () => {
    const scaled = scaleBenchmarkCapabilitiesToFamily(
      { reasoning: 0.8, code_gen: 0.8, tool_use: 0.8 },
      { reasoning: 0.95, code_gen: 0.95, tool_use: 0.95 },
      { reasoning: 0.8, code_gen: 0.8, tool_use: 0.8 },
    );
    expect(scaled.reasoning).toBeCloseTo(0.95, 10);
    expect(scaled.code_gen).toBeCloseTo(0.95, 10);
    expect(scaled.tool_use).toBeCloseTo(0.95, 10);
  });

  it('is strictly monotonic and preserves score ratios within a family', () => {
    const familyDefault = { reasoning: 0.95, code_gen: 0.95, tool_use: 0.95 };
    const cohortMax = { reasoning: 0.8, code_gen: 0.8, tool_use: 0.8 };
    const low = scaleBenchmarkCapabilitiesToFamily(
      { reasoning: 0.4, code_gen: 0.4, tool_use: 0.4 },
      familyDefault,
      cohortMax,
    );
    const high = scaleBenchmarkCapabilitiesToFamily(
      { reasoning: 0.6, code_gen: 0.6, tool_use: 0.6 },
      familyDefault,
      cohortMax,
    );
    expect(low.reasoning).toBeLessThan(high.reasoning);
    // Same-tier gap is explained by measured standing: scaled ratio == raw ratio
    expect(high.reasoning / low.reasoning).toBeCloseTo(0.6 / 0.4, 10);
  });

  it('is lift-only: never pushes a grounded model below its measured scores', () => {
    // Family default (0.6 UNKNOWN-style) sits below the measured cohort scale.
    const scaled = scaleBenchmarkCapabilitiesToFamily(
      { reasoning: 0.796, code_gen: 0.833, tool_use: 0.8215 },
      { reasoning: 0.6, code_gen: 0.65, tool_use: 0.6 },
      { reasoning: 0.796, code_gen: 0.833, tool_use: 0.8215 },
    );
    expect(scaled.reasoning).toBeCloseTo(0.796, 10);
    expect(scaled.code_gen).toBeCloseTo(0.833, 10);
    expect(scaled.tool_use).toBeCloseTo(0.8215, 10);
  });

  it('keeps the raw score for a degenerate cohort (max ≤ 0) instead of dividing by zero', () => {
    const scaled = scaleBenchmarkCapabilitiesToFamily(
      { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
      { reasoning: 0.95, code_gen: 0.95, tool_use: 0.95 },
      { reasoning: 0, code_gen: 0, tool_use: 0 },
    );
    expect(scaled).toEqual({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
  });
});

describe('fairness rescale against a synthetic artifact (hand-computed)', () => {
  it('rescales grounded rows to family default × score / cohort max', () => {
    setBenchmarkProfilesPathForTests(writeSyntheticArtifact());

    // Frontier cohort max: {0.8, 0.8, 0.7}; anchor 0.95
    const opus = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-opus-4-5' }));
    expect(opus.capability_source).toBe('benchmark');
    expect(opus.capabilities.reasoning).toBeCloseTo(0.95, 10); // cohort best
    expect(opus.capabilities.code_gen).toBeCloseTo(0.7125, 10); // 0.95 × 0.6/0.8
    expect(opus.capabilities.tool_use).toBeCloseTo((0.95 * 0.5) / 0.7, 10);

    const sonnet = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-sonnet-4-6' }));
    expect(sonnet.capabilities.reasoning).toBeCloseTo(0.7125, 10); // 0.95 × 0.6/0.8
    expect(sonnet.capabilities.code_gen).toBeCloseTo(0.95, 10); // cohort best
    expect(sonnet.capabilities.tool_use).toBeCloseTo(0.95, 10); // cohort best

    // Economical cohort max: {0.5, 0.5, 0.5}; anchor 0.7 / 0.75 / 0.7
    const haiku = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-haiku-4-5' }));
    expect(haiku.capability_source).toBe('benchmark');
    expect(haiku.capabilities.reasoning).toBeCloseTo(0.7, 10); // cohort best
    expect(haiku.capabilities.code_gen).toBeCloseTo(0.75, 10);
    expect(haiku.capabilities.tool_use).toBeCloseTo(0.7, 10);

    const flash = mapPiModelToProfile(makeInput({ provider: 'google', id: 'gemini-2.5-flash' }));
    expect(flash.capabilities.reasoning).toBeCloseTo(0.56, 10); // 0.7 × 0.4/0.5
    expect(flash.capabilities.code_gen).toBeCloseTo(0.675, 10); // 0.75 × 0.45/0.5
    expect(flash.capabilities.tool_use).toBeCloseTo(0.42, 10); // 0.7 × 0.3/0.5
  });

  it('grounded cohort best ties the ungrounded same-tier model — no source penalty', () => {
    setBenchmarkProfilesPathForTests(writeSyntheticArtifact());

    // Ungrounded frontier id → pure pattern default 0.95
    const fable = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-fable-5-1' }));
    expect(fable.capability_source).toBe('pattern_default');
    const opus = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-opus-4-5' }));
    expect(opus.capabilities.reasoning).toBeCloseTo(fable.capabilities.reasoning, 10);

    // Ungrounded economical id → pure pattern default 0.7 / 0.75 / 0.7
    const gpt51 = mapPiModelToProfile(makeInput({ provider: 'openai', id: 'gpt-5.1' }));
    expect(gpt51.capability_source).toBe('pattern_default');
    const haiku = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-haiku-4-5' }));
    expect(haiku.capabilities).toEqual(gpt51.capabilities);
  });

  it('remaining same-tier gaps equal measured standing ratios, not capability source', () => {
    setBenchmarkProfilesPathForTests(writeSyntheticArtifact());

    const sonnet = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-sonnet-4-6' }));
    const fable = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-fable-5-1' }));
    // Sonnet trails the (ungrounded) frontier default only by its measured
    // distance from the grounded cohort best: 0.7125/0.95 == 0.6/0.8.
    expect(sonnet.capabilities.reasoning / fable.capabilities.reasoning).toBeCloseTo(0.6 / 0.8, 10);
  });

  it('preserves grounded relative order within each family', () => {
    setBenchmarkProfilesPathForTests(writeSyntheticArtifact());

    const opus = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-opus-4-5' }));
    const sonnet = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-sonnet-4-6' }));
    // Raw order: opus.reasoning 0.8 > sonnet.reasoning 0.6, opus.code_gen 0.6 < sonnet 0.8
    expect(opus.capabilities.reasoning).toBeGreaterThan(sonnet.capabilities.reasoning);
    expect(opus.capabilities.code_gen).toBeLessThan(sonnet.capabilities.code_gen);

    const haiku = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-haiku-4-5' }));
    const flash = mapPiModelToProfile(makeInput({ provider: 'google', id: 'gemini-2.5-flash' }));
    expect(haiku.capabilities.reasoning).toBeGreaterThan(flash.capabilities.reasoning);
    expect(haiku.capabilities.code_gen).toBeGreaterThan(flash.capabilities.code_gen);
    expect(haiku.capabilities.tool_use).toBeGreaterThan(flash.capabilities.tool_use);
  });

  it('leaves tiers unchanged by grounding', () => {
    const ids = [
      { provider: 'anthropic', id: 'claude-opus-4-5' },
      { provider: 'anthropic', id: 'claude-sonnet-4-6' },
      { provider: 'anthropic', id: 'claude-haiku-4-5' },
      { provider: 'google', id: 'gemini-2.5-flash' },
      { provider: 'anthropic', id: 'claude-fable-5-1' },
    ];
    setBenchmarkProfilesPathForTests(null);
    const patternTiers = ids.map((input) => mapPiModelToProfile(makeInput(input)).tier);

    setBenchmarkProfilesPathForTests(writeSyntheticArtifact());
    const groundedTiers = ids.map((input) => mapPiModelToProfile(makeInput(input)).tier);

    expect(groundedTiers).toEqual(patternTiers);
  });
});

describe('checked-in artifact invariants (config/benchmark-profiles.json)', () => {
  it('preserves grounded relative order per dimension within each family cohort', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);
    const artifact = readCheckedInArtifact();

    // Group canonical rows by their family cohort max (shared per family).
    const groups = new Map<string, string[]>();
    for (const row of artifact.models) {
      const cohortMax = getBenchmarkFamilyCohortMax(row.model_id);
      expect(cohortMax, row.model_id).toBeDefined();
      const key = JSON.stringify(cohortMax);
      groups.set(key, [...(groups.get(key) ?? []), row.model_id]);
    }

    const dimensions = ['reasoning', 'code_gen', 'tool_use'] as const;
    for (const ids of groups.values()) {
      const rawByModel = new Map(
        artifact.models.map((row) => [row.model_id, row.capabilities] as const),
      );
      const scaledByModel = new Map(
        ids.map(
          (id) =>
            [id, mapPiModelToProfile(makeInput({ provider: '', id })).capabilities] as const,
        ),
      );
      for (const dimension of dimensions) {
        for (const a of ids) {
          for (const b of ids) {
            const rawA = rawByModel.get(a)?.[dimension];
            const rawB = rawByModel.get(b)?.[dimension];
            const scaledA = scaledByModel.get(a)?.[dimension];
            const scaledB = scaledByModel.get(b)?.[dimension];
            if (rawA === undefined || rawB === undefined || scaledA === undefined || scaledB === undefined) {
              throw new Error('missing capabilities in order-preservation check');
            }
            expect(Math.sign(scaledA - scaledB), `${a} vs ${b} (${dimension})`).toBe(
              Math.sign(rawA - rawB),
            );
          }
        }
      }
    }
  });

  it('grounded cohort best ties the ungrounded same-tier default in every measured family', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

    // Frontier family: ungrounded reference claude-fable-5-1 (pattern default)
    const fable = mapPiModelToProfile(makeInput({ provider: 'anthropic', id: 'claude-fable-5-1' }));
    expect(fable.capability_source).toBe('pattern_default');
    const frontierGrounded = ['claude-opus-4-5', 'claude-sonnet-4-6', 'gemini-3-pro-preview'].map(
      (id) => mapPiModelToProfile(makeInput({ provider: '', id })),
    );
    for (const profile of frontierGrounded) {
      expect(profile.capability_source).toBe('benchmark');
    }
    const dimensions = ['reasoning', 'code_gen', 'tool_use'] as const;
    for (const dimension of dimensions) {
      const best = Math.max(...frontierGrounded.map((profile) => profile.capabilities[dimension]));
      expect(best, `frontier ${dimension} ties ungrounded default`).toBeCloseTo(
        fable.capabilities[dimension],
        10,
      );
    }

    // Economical family: ungrounded reference gpt-5.1 (pattern default)
    const gpt51 = mapPiModelToProfile(makeInput({ provider: 'openai', id: 'gpt-5.1' }));
    expect(gpt51.capability_source).toBe('pattern_default');
    const economicalGrounded = ['claude-haiku-4-5', 'claude-3.5-haiku', 'gemini-2.5-flash'].map(
      (id) => mapPiModelToProfile(makeInput({ provider: '', id })),
    );
    for (const dimension of dimensions) {
      const best = Math.max(...economicalGrounded.map((profile) => profile.capabilities[dimension]));
      expect(best, `economical ${dimension} ties ungrounded default`).toBeCloseTo(
        gpt51.capabilities[dimension],
        10,
      );
    }
  });

  it('is lift-only for every grounded row (never below measured scores)', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);
    const artifact = readCheckedInArtifact();

    const dimensions = ['reasoning', 'code_gen', 'tool_use'] as const;
    for (const row of artifact.models) {
      const profile = mapPiModelToProfile(makeInput({ provider: '', id: row.model_id }));
      expect(profile.capability_source, row.model_id).toBe('benchmark');
      for (const dimension of dimensions) {
        expect(
          profile.capabilities[dimension],
          `${row.model_id}.${dimension} must not drop below the measured score`,
        ).toBeGreaterThanOrEqual(row.capabilities[dimension]);
      }
    }
  });

  it('keeps raw scores for UNKNOWN-family rows whose default sits below the measured scale', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);
    const artifact = readCheckedInArtifact();
    const row = artifact.models.find((model) => model.model_id === 'gpt-5.3-codex');
    if (row === undefined) {
      throw new Error('missing benchmark row for gpt-5.3-codex');
    }

    // gpt-5.3-codex matches no pattern rule → UNKNOWN_DEFAULTS (0.6/0.65/0.6),
    // below its measured scores — the rescale must not regress it.
    const profile = mapPiModelToProfile(makeInput({ provider: 'openai', id: 'gpt-5.3-codex' }));
    expect(profile.capability_source).toBe('benchmark');
    expect(profile.capabilities.reasoning).toBeCloseTo(row.capabilities.reasoning, 10);
    expect(profile.capabilities.code_gen).toBeCloseTo(row.capabilities.code_gen, 10);
    expect(profile.capabilities.tool_use).toBeCloseTo(row.capabilities.tool_use, 10);
  });

  it('leaves tiers and pricing unchanged by grounding', () => {
    const ids = [
      { provider: 'anthropic', id: 'claude-opus-4-5' },
      { provider: 'anthropic', id: 'claude-sonnet-4-6' },
      { provider: 'anthropic', id: 'claude-haiku-4-5' },
      { provider: 'anthropic', id: 'claude-3.5-haiku' },
      { provider: 'google', id: 'gemini-2.5-flash' },
      { provider: 'google', id: 'gemini-3-pro-preview' },
      { provider: 'openai', id: 'gpt-5.3-codex' },
      { provider: 'anthropic', id: 'claude-fable-5-1' },
      { provider: 'google', id: 'gemini-4-argon' },
    ];
    setBenchmarkProfilesPathForTests(null);
    const patternProfiles = ids.map((input) => mapPiModelToProfile(makeInput(input)));

    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);
    const groundedProfiles = ids.map((input) => mapPiModelToProfile(makeInput(input)));

    expect(groundedProfiles.map((profile) => profile.tier)).toEqual(
      patternProfiles.map((profile) => profile.tier),
    );
    expect(groundedProfiles.map((profile) => profile.pricing)).toEqual(
      patternProfiles.map((profile) => profile.pricing),
    );
  });
});

describe('getBenchmarkFamilyCohortMax', () => {
  it('returns the per-dimension max across the row’s pattern-family cohort', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);
    const artifact = readCheckedInArtifact();

    // Recompute the frontier cohort max independently from the artifact rows.
    const frontierIds = ['claude-opus-4-5', 'claude-sonnet-4-6', 'gemini-3-pro-preview'];
    const rows = artifact.models.filter((model) => frontierIds.includes(model.model_id));
    const expected = {
      reasoning: Math.max(...rows.map((row) => row.capabilities.reasoning)),
      code_gen: Math.max(...rows.map((row) => row.capabilities.code_gen)),
      tool_use: Math.max(...rows.map((row) => row.capabilities.tool_use)),
    };

    const direct = getBenchmarkFamilyCohortMax('claude-opus-4-5');
    expect(direct).toEqual(expected);
    // Alias resolution lands on the same canonical row → same cohort max.
    expect(getBenchmarkFamilyCohortMax('claude-opus-4')).toEqual(expected);
  });

  it('returns undefined for ungrounded ids and when grounding is disabled', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);
    expect(getBenchmarkFamilyCohortMax('mystery-model-v9')).toBeUndefined();

    setBenchmarkProfilesPathForTests(null);
    expect(getBenchmarkFamilyCohortMax('claude-opus-4-5')).toBeUndefined();
  });
});
