/**
 * SP-212 / #119 — Degraded neural failover sandwich tests.
 *
 * Covers: learned map (privacy-safe keys, poisoning guards), operator pattern
 * pack (deny-by-default, fail-closed regex), sandwich resolver ordering, and
 * pipeline failure injection (encoder error / budget overrun → sandwich with
 * route_path reason codes; host never crashes).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  DEGRADED_REASON_LEARNED,
  DEGRADED_REASON_SAFE_DEFAULT,
  InMemoryLearnedRouteStore,
  compilePatternPack,
  degradedPatternReasonCode,
  matchPatternPack,
  parsePatternPackJson,
  requirementFingerprint,
  resolveDegradedRoute,
  type DegradedRouteConfig,
} from '../../src/domain/routing/degraded-route-sandwich.js';
import { DEFAULT_DEGRADED_ROUTE_CONFIG } from '../../src/domain/types/schemas.js';
import {
  HydraMatcher,
  type EmbeddingProvider,
  type MatchResult,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import type { ClusterMatcher } from '../../src/domain/matching/cluster-matcher.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import { createDefaultPSuccessWeights } from '../../src/domain/routing/p-success-classifier.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

const UNTRAINED_P_SUCCESS_WEIGHTS = createDefaultPSuccessWeights();

const CONFIG: DegradedRouteConfig = { ...DEFAULT_DEGRADED_ROUTE_CONFIG };

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

const fleet: ModelProfile[] = [
  makeModel({ id: 'local-llama', tier: 'zero-tier' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
];

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: '00000000-0000-0000-0000-000000000001',
    session_id: 'sess-1',
    prompt_text: 'Hello, how are you today?',
    ...overrides,
  };
}

function makeThrowingHydraMatcher(): HydraMatcher {
  const provider: EmbeddingProvider = {
    extractRequirements: vi.fn(async () => {
      throw new Error('onnx runtime unavailable');
    }),
    dispose: vi.fn(async () => {}),
  };
  return new HydraMatcher(provider, { artifactCachePath: '.pi-smart-router/models/' });
}

function silenceWarn(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

// ─── requirementFingerprint ──────────────────────────────────────────────────

describe('requirementFingerprint', () => {
  it('is deterministic and 16 hex chars', () => {
    const req: RequirementVector = { reasoning: 0.5, code_gen: 0.25, tool_use: 0.75 };
    const a = requirementFingerprint(req);
    const b = requirementFingerprint({ ...req });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('rounds to 2 decimals so near-identical vectors share a key', () => {
    const a = requirementFingerprint({ reasoning: 0.501, code_gen: 0.5, tool_use: 0.5 });
    const b = requirementFingerprint({ reasoning: 0.504, code_gen: 0.5, tool_use: 0.5 });
    expect(a).toBe(b);
  });

  it('clamps non-finite and out-of-range values instead of throwing', () => {
    const fp = requirementFingerprint({
      reasoning: Number.NaN,
      code_gen: 2,
      tool_use: -1,
    });
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ─── InMemoryLearnedRouteStore ───────────────────────────────────────────────

describe('InMemoryLearnedRouteStore', () => {
  it('records and looks up by cluster id (exact-key policy)', () => {
    const store = new InMemoryLearnedRouteStore(8);
    store.record(
      { requirementFingerprint: null, clusterId: 'mechanical_edit' },
      'economical-cloud',
    );

    const entry = store.lookup({
      requirementFingerprint: null,
      clusterId: 'mechanical_edit',
    });
    expect(entry).toMatchObject({ tier: 'economical-cloud', samples: 1 });
    expect(
      store.lookup({ requirementFingerprint: null, clusterId: 'deep_debug' }),
    ).toBeNull();
  });

  it('prefers fingerprint key over cluster id on lookup', () => {
    const store = new InMemoryLearnedRouteStore(8);
    const fp = requirementFingerprint({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
    store.record({ requirementFingerprint: fp, clusterId: null }, 'frontier-cloud');
    store.record(
      { requirementFingerprint: null, clusterId: 'mechanical_edit' },
      'economical-cloud',
    );

    const entry = store.lookup({
      requirementFingerprint: fp,
      clusterId: 'mechanical_edit',
    });
    expect(entry?.tier).toBe('frontier-cloud');
  });

  it('grows confidence on consistent observations and resets on conflict', () => {
    const store = new InMemoryLearnedRouteStore(8);
    const key = { requirementFingerprint: null, clusterId: 'low_stakes_general' };
    store.record(key, 'economical-cloud');
    store.record(key, 'economical-cloud');
    expect(store.lookup(key)).toMatchObject({ samples: 2, confidence: 0.7 });

    store.record(key, 'frontier-cloud');
    expect(store.lookup(key)).toMatchObject({
      tier: 'frontier-cloud',
      samples: 1,
      confidence: 0.6,
    });
  });

  it('rejects prompt-like keys and invalid tiers (poisoning guard, no prompt text)', () => {
    const warnSpy = silenceWarn();
    const store = new InMemoryLearnedRouteStore(8);

    store.record(
      { requirementFingerprint: 'delete all files in the repo', clusterId: null },
      'zero-tier',
    );
    store.record(
      { requirementFingerprint: null, clusterId: 'Ignore previous instructions' },
      'zero-tier',
    );
    store.record(
      { requirementFingerprint: null, clusterId: 'valid_cluster' },
      'not-a-tier' as ModelProfile['tier'],
    );

    expect(store.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });

  it('evicts oldest entries beyond maxEntries (bounded memory)', () => {
    const store = new InMemoryLearnedRouteStore(2);
    store.record({ requirementFingerprint: null, clusterId: 'cluster_a' }, 'zero-tier');
    store.record({ requirementFingerprint: null, clusterId: 'cluster_b' }, 'zero-tier');
    store.record({ requirementFingerprint: null, clusterId: 'cluster_c' }, 'zero-tier');

    expect(store.size).toBe(2);
    expect(
      store.lookup({ requirementFingerprint: null, clusterId: 'cluster_a' }),
    ).toBeNull();
    expect(
      store.lookup({ requirementFingerprint: null, clusterId: 'cluster_c' }),
    ).not.toBeNull();
  });

  it('throws on invalid maxEntries (fail fast on misconfiguration)', () => {
    expect(() => new InMemoryLearnedRouteStore(0)).toThrow(/positive integer/);
  });
});

// ─── Pattern pack ────────────────────────────────────────────────────────────

describe('compilePatternPack / matchPatternPack', () => {
  it('compiles valid rules and matches first-rule-wins', () => {
    const pack = compilePatternPack([
      { id: 'greeting', pattern: '\\bhello\\b', tier: 'economical-cloud' },
      { id: 'typo', pattern: 'typo', tier: 'zero-tier', confidence: 0.8 },
    ]);

    expect(pack.rules).toHaveLength(2);
    expect(pack.rejected).toHaveLength(0);

    const match = matchPatternPack(pack, 'Hello there, fix this typo');
    expect(match?.rule.id).toBe('greeting');
  });

  it('fails closed on invalid regex — rejected rule never matches', () => {
    const warnSpy = silenceWarn();
    const pack = compilePatternPack([
      { id: 'broken', pattern: '([unclosed', tier: 'zero-tier' },
      { id: 'greeting', pattern: '\\bhello\\b', tier: 'economical-cloud' },
    ]);

    expect(pack.rules.map((rule) => rule.id)).toEqual(['greeting']);
    expect(pack.rejected).toEqual([{ id: 'broken', reason: 'invalid_regex' }]);
    expect(matchPatternPack(pack, '([unclosed bracket only')).toBeNull();
    expect(matchPatternPack(pack, 'well hello')).not.toBeNull();
    warnSpy.mockRestore();
  });

  it('rejects invalid rule schema and non-array packs (deny-by-default)', () => {
    const warnSpy = silenceWarn();

    const badRule = compilePatternPack([{ id: 'Bad Id!', pattern: 'x', tier: 'zero-tier' }]);
    expect(badRule.rules).toHaveLength(0);

    const notArray = compilePatternPack('router_rules');
    expect(notArray.rules).toHaveLength(0);
    expect(matchPatternPack(notArray, 'anything')).toBeNull();
    warnSpy.mockRestore();
  });

  it('parsePatternPackJson fails closed on invalid JSON', () => {
    const warnSpy = silenceWarn();
    const pack = parsePatternPackJson('{not json');
    expect(pack.rules).toHaveLength(0);
    expect(pack.rejected[0]?.reason).toBe('invalid_json');
    warnSpy.mockRestore();
  });

  it('parsePatternPackJson accepts a router_rules-style rules wrapper', () => {
    const pack = parsePatternPackJson(
      JSON.stringify({ rules: [{ id: 'lint', pattern: '\\blint\\b', tier: 'zero-tier' }] }),
    );
    expect(matchPatternPack(pack, 'lint the package')?.rule.id).toBe('lint');
  });
});

// ─── resolveDegradedRoute ordering + guards ──────────────────────────────────

describe('resolveDegradedRoute', () => {
  const baseInput = {
    failure: 'neural_error' as const,
    fleet,
    toolUseEstimate: 0,
    clusterId: null,
    safeDefaultModel: fleet[1],
    config: CONFIG,
    promptText: 'Hello, how are you today?',
  };

  it('falls to safe default when no learned entry or pattern matches', () => {
    const resolution = resolveDegradedRoute(baseInput);
    expect(resolution.routePath).toBe('safe_default');
    expect(resolution.reasonCode).toBe(DEGRADED_REASON_SAFE_DEFAULT);
    expect(resolution.model?.id).toBe('gpt-4o-mini');
    expect(resolution.confidence).toBe(0);
  });

  it('honors a confident learned entry before patterns', () => {
    const store = new InMemoryLearnedRouteStore(8);
    store.record(
      { requirementFingerprint: null, clusterId: 'mechanical_edit' },
      'frontier-cloud',
    );

    const resolution = resolveDegradedRoute({
      ...baseInput,
      clusterId: 'mechanical_edit',
      learnedStore: store,
      patternPack: compilePatternPack([
        { id: 'greeting', pattern: 'hello', tier: 'economical-cloud' },
      ]),
    });

    expect(resolution.routePath).toBe('learned');
    expect(resolution.reasonCode).toBe(DEGRADED_REASON_LEARNED);
    expect(resolution.model?.id).toBe('claude-opus');
    expect(resolution.confidence).toBeGreaterThanOrEqual(CONFIG.learned_min_confidence);
  });

  it('skips learned entries below the confidence floor', () => {
    const store = new InMemoryLearnedRouteStore(8);
    store.record(
      { requirementFingerprint: null, clusterId: 'mechanical_edit' },
      'economical-cloud',
    );

    const resolution = resolveDegradedRoute({
      ...baseInput,
      clusterId: 'mechanical_edit',
      learnedStore: store,
      config: { ...CONFIG, learned_min_confidence: 0.95 },
    });

    expect(resolution.routePath).toBe('safe_default');
  });

  it('blocks cheaper-tier learned suggestions when tool-use cues predict shortfall', () => {
    const store = new InMemoryLearnedRouteStore(8);
    store.record(
      { requirementFingerprint: null, clusterId: 'mechanical_edit' },
      'zero-tier',
    );

    const resolution = resolveDegradedRoute({
      ...baseInput,
      clusterId: 'mechanical_edit',
      learnedStore: store,
      toolUseEstimate: 0.9,
    });

    expect(resolution.routePath).toBe('safe_default');
  });

  it('always allows frontier upgrades regardless of tool-use estimate', () => {
    const store = new InMemoryLearnedRouteStore(8);
    store.record(
      { requirementFingerprint: null, clusterId: 'deep_debug' },
      'frontier-cloud',
    );

    const resolution = resolveDegradedRoute({
      ...baseInput,
      clusterId: 'deep_debug',
      learnedStore: store,
      toolUseEstimate: 0.9,
    });

    expect(resolution.routePath).toBe('learned');
    expect(resolution.model?.tier).toBe('frontier-cloud');
  });

  it('routes via pattern pack with rule reason code (heuristic path)', () => {
    const resolution = resolveDegradedRoute({
      ...baseInput,
      patternPack: compilePatternPack([
        { id: 'greeting', pattern: '\\bhello\\b', tier: 'economical-cloud' },
      ]),
    });

    expect(resolution.routePath).toBe('heuristic');
    expect(resolution.reasonCode).toBe(degradedPatternReasonCode('greeting'));
    expect(resolution.patternRuleId).toBe('greeting');
    expect(resolution.model?.id).toBe('gpt-4o-mini');
  });

  it('pattern pack never alone overrides a capability shortfall', () => {
    const resolution = resolveDegradedRoute({
      ...baseInput,
      toolUseEstimate: 0.9,
      patternPack: compilePatternPack([
        { id: 'greeting', pattern: '\\bhello\\b', tier: 'zero-tier' },
      ]),
    });

    expect(resolution.routePath).toBe('safe_default');
  });

  it('skips pattern tier when no healthy model exists in that tier', () => {
    const unhealthyFleet = fleet.map((model) =>
      model.tier === 'zero-tier' ? { ...model, healthy: false } : model,
    );

    const resolution = resolveDegradedRoute({
      ...baseInput,
      fleet: unhealthyFleet,
      patternPack: compilePatternPack([
        { id: 'greeting', pattern: '\\bhello\\b', tier: 'zero-tier' },
      ]),
    });

    expect(resolution.routePath).toBe('safe_default');
  });

  it('returns no model when the safe default is unavailable', () => {
    const resolution = resolveDegradedRoute({
      ...baseInput,
      safeDefaultModel: undefined,
    });

    expect(resolution.routePath).toBe('safe_default');
    expect(resolution.model).toBeUndefined();
  });
});

// ─── Pipeline failure injection (SP-212 wiring) ─────────────────────────────

describe('RouterPipeline degraded sandwich wiring (SP-212, #119)', () => {
  it('encoder error → safe default sandwich decision with reason code; host never crashes', async () => {
    const warnSpy = silenceWarn();
    const pipeline = new RouterPipeline(fleet, {
      hydraMatcher: makeThrowingHydraMatcher(),
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    const decision = await pipeline.route(makeRequest());

    expect(decision.stage).toBe('fallback');
    expect(decision.reason_code).toBe(DEGRADED_REASON_SAFE_DEFAULT);
    expect(decision.selected_model_id).toBe('gpt-4o-mini');
    expect(decision.features?.route_path).toBe('safe_default');
    warnSpy.mockRestore();
  });

  it('encoder error → learned path when cluster-id memory exists', async () => {
    const warnSpy = silenceWarn();
    const learnedRouteStore = new InMemoryLearnedRouteStore(8);
    learnedRouteStore.record(
      { requirementFingerprint: null, clusterId: 'mechanical_edit' },
      'economical-cloud',
    );

    const clusterMatcher = {
      match: vi.fn(async () => ({
        clusterId: 'mechanical_edit',
        tierBias: 'economical-cloud' as const,
        similarity: 0.5,
        margin: 0.1,
        confidence: 'low' as const,
        elapsedMs: 1,
      })),
    } as unknown as ClusterMatcher;

    const pipeline = new RouterPipeline(fleet, {
      hydraMatcher: makeThrowingHydraMatcher(),
      clusterMatcher,
      learnedRouteStore,
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    const decision = await pipeline.route(makeRequest());

    expect(decision.stage).toBe('hydra_match');
    expect(decision.reason_code).toBe(DEGRADED_REASON_LEARNED);
    expect(decision.selected_model_id).toBe('gpt-4o-mini');
    expect(decision.features?.route_path).toBe('learned');
    warnSpy.mockRestore();
  });

  it('encoder error → operator pattern pack overlay (heuristic path)', async () => {
    const warnSpy = silenceWarn();
    const pipeline = new RouterPipeline(fleet, {
      hydraMatcher: makeThrowingHydraMatcher(),
      patternPack: compilePatternPack([
        { id: 'greeting', pattern: '\\bhello\\b', tier: 'economical-cloud' },
      ]),
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    const decision = await pipeline.route(makeRequest());

    expect(decision.stage).toBe('hydra_match');
    expect(decision.reason_code).toBe('degraded_pattern_greeting');
    expect(decision.features?.route_path).toBe('heuristic');
    expect(decision.features?.route_path_confidence).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });

  it('neural budget overrun with no selection → degraded sandwich', async () => {
    const warnSpy = silenceWarn();
    const budgetBustResult: MatchResult = {
      selected: null,
      candidates: [],
      requirements: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
      elapsedMs: 150,
      budgetExceeded: true,
    };
    const matcher = {
      match: vi.fn(async () => budgetBustResult),
    } as unknown as HydraMatcher;

    const pipeline = new RouterPipeline(fleet, {
      hydraMatcher: matcher,
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    const decision = await pipeline.route(makeRequest());

    expect(decision.reason_code).toBe(DEGRADED_REASON_SAFE_DEFAULT);
    expect(decision.selected_model_id).toBe('gpt-4o-mini');
    warnSpy.mockRestore();
  });

  it('sandwich disabled → legacy safe_default pass-through preserved', async () => {
    const warnSpy = silenceWarn();
    const pipeline = new RouterPipeline(fleet, {
      hydraMatcher: makeThrowingHydraMatcher(),
      degradedRouteConfig: { ...CONFIG, enabled: false },
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    const decision = await pipeline.route(makeRequest());

    expect(decision.stage).toBe('fallback');
    expect(decision.reason_code).toBe('safe_cloud_default');
    warnSpy.mockRestore();
  });

  it('neural success records privacy-safe learned entry (fingerprint only, no prompt text)', async () => {
    const requirements: RequirementVector = {
      reasoning: 0.5,
      code_gen: 0.5,
      tool_use: 0.5,
    };
    const provider: EmbeddingProvider = {
      extractRequirements: vi.fn(async () => requirements),
      dispose: vi.fn(async () => {}),
    };
    const hydraMatcher = new HydraMatcher(provider, {
      artifactCachePath: '.pi-smart-router/models/',
    });
    const learnedRouteStore = new InMemoryLearnedRouteStore(8);

    const pipeline = new RouterPipeline(fleet, {
      hydraMatcher,
      learnedRouteStore,
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    const decision = await pipeline.route(makeRequest());

    expect(decision.stage).toBe('hydra_match');
    expect(decision.reason_code).toBe('hydra_embedding_match');
    expect(decision.features?.route_path).toBe('neural');

    const fp = requirementFingerprint(requirements);
    const entry = learnedRouteStore.lookup({
      requirementFingerprint: fp,
      clusterId: null,
    });
    expect(entry).not.toBeNull();
    const selected = fleet.find((model) => model.id === decision.selected_model_id);
    expect(entry?.tier).toBe(selected?.tier);
  });

  it('emits route_path telemetry on degraded decisions', async () => {
    const warnSpy = silenceWarn();
    const onRecord = vi.fn();
    const telemetryEmitter = new RoutingTelemetryEmitter({ onRecord });

    const pipeline = new RouterPipeline(fleet, {
      hydraMatcher: makeThrowingHydraMatcher(),
      telemetryEmitter,
      patternPack: compilePatternPack([
        { id: 'greeting', pattern: '\\bhello\\b', tier: 'economical-cloud' },
      ]),
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    await pipeline.route(makeRequest());

    expect(onRecord).toHaveBeenCalledOnce();
    expect(onRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        route_path: 'heuristic',
        route_path_confidence: expect.any(Number),
        reason_code: 'degraded_pattern_greeting',
      }),
    );
    warnSpy.mockRestore();
  });

  it('emits route_path telemetry on healthy-stage decisions', async () => {
    const onRecord = vi.fn();
    const telemetryEmitter = new RoutingTelemetryEmitter({ onRecord });

    const pipeline = new RouterPipeline(fleet, {
      telemetryEmitter,
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    await pipeline.route(makeRequest({ prompt_text: 'Fix the typo in the README' }));

    expect(onRecord).toHaveBeenCalledOnce();
    const record = onRecord.mock.calls[0]?.[0] as { route_path?: string | null };
    expect(['neural', 'learned', 'heuristic', 'safe_default']).toContain(
      record.route_path,
    );
  });

  it('never propagates encoder exceptions to the caller', async () => {
    const warnSpy = silenceWarn();
    const pipeline = new RouterPipeline(fleet, {
      hydraMatcher: makeThrowingHydraMatcher(),
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });

    await expect(pipeline.route(makeRequest())).resolves.toMatchObject({
      reason_code: DEGRADED_REASON_SAFE_DEFAULT,
    });
    warnSpy.mockRestore();
  });
});
