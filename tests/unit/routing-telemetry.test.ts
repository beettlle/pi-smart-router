import { describe, expect, it, vi } from 'vitest';

import {
  CONTEXT_FIT_EXCEEDED,
  CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
  CONTEXT_OVERFLOW_NO_FIT,
} from '../../src/domain/routing/context-fit.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import {
  BREAKEVEN_BLOCKED,
  CONTEXT_FIT_PASS,
  CONTEXT_OVERFLOW_PIN_BREAK,
  LOW_INTENSITY_STRUCTURAL,
  P_SUCCESS_CHEAP,
  P_SUCCESS_UNCERTAIN,
  SAAR_BUFFER_ACTIVE,
  SAAR_HARD_LOCK,
  PLANNING_DELEGATE,
  PLANNING_DIRECT_FRONTIER,
  PIN_ONLY_FALLBACK,
  RoutingTelemetryEmitter,
  buildBreakevenObservability,
  buildContextFitObservability,
  buildLocalZeroSkipReasons,
  buildPlanningDelegateObservability,
  buildRoutingDecisionLogPayload,
  buildSaarObservability,
  buildTierSelectionObservability,
  createPlanningDelegateObservability,
  enrichRoutingDecisionWithContextFit,
  enrichRoutingDecisionWithPinEconomics,
  enrichRoutingDecisionWithPlanningDelegate,
  enrichRoutingDecisionWithTierSelection,
  resolveTierSelectionReasonCode,
  resolvePinOnlyFallbackActive,
} from '../../src/infrastructure/telemetry/routing-telemetry.js';
import {
  computeQualityRetentionRegression,
  DEFAULT_QR_REGRESSION_THRESHOLD,
  evaluatePinOnlyFallbackFromHarness,
  evaluatePinOnlyFallbackTrigger,
} from '../../scripts/eval/quality-retention.js';
import { DEFAULT_PLANNING_DELEGATE_CONFIG, DEFAULT_SAAR_CONFIG } from '../../src/domain/types/schemas.js';
import { TELEMETRY_MAX_ENTRIES } from '../../src/infrastructure/telemetry/telemetry-limits.js';

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

const contextFleet: ModelProfile[] = [
  makeModel({
    id: 'small-window',
    tier: 'economical-cloud',
    limits: { max_input_tokens: 32_768 },
  }),
  makeModel({
    id: 'large-window',
    tier: 'frontier-cloud',
    limits: { max_input_tokens: 200_000 },
  }),
];

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-1',
    session_id: 'sess-1',
    prompt_text: 'hello',
    turn_type: 'main_loop',
    ...overrides,
  };
}

function makeDecision(overrides?: Partial<RoutingDecision>): RoutingDecision {
  return {
    request_id: 'req-1',
    selected_model_id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    routing_latency_ms: 3,
    pin_reason: null,
    ...overrides,
  };
}

describe('RoutingTelemetryEmitter', () => {
  it('calls onRecord with the emitted telemetry row', () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({
      clock: () => '2026-07-04T12:00:00.000Z',
      onRecord,
    });

    const record = emitter.emit(makeRequest(), makeDecision());

    expect(onRecord).toHaveBeenCalledOnce();
    expect(onRecord).toHaveBeenCalledWith(record);
    expect(record).toMatchObject({
      timestamp: '2026-07-04T12:00:00.000Z',
      session_id: 'sess-1',
      selected_model_id: 'gpt-4o-mini',
      stage: 'fallback',
      turn_type: 'main_loop',
      estimated_input_tokens: null,
      context_fit_viable_count: null,
      context_fit_rejected_json: null,
      context_overflow_pin_break: false,
      selected_model_max_input_tokens: null,
      context_fit_reason_code: null,
      cluster_id: null,
      cluster_similarity: null,
      cluster_margin: null,
      low_intensity_score: null,
      tier_hint: null,
      p_success_cheap: null,
      local_eligible_reason: null,
      tier_selection_reason_code: null,
      marginal_savings: null,
      future_cache_value: null,
      cache_reprime_cost: null,
      breakeven_decision: null,
      breakeven_reason_code: null,
      saar_buffer_active: false,
      saar_hard_lock: false,
      turn_index_in_session: null,
      saar_reason_code: null,
    });
  });

  it('evicts oldest entries beyond maxEntries', () => {
    const baseTime = Date.now();
    const emitter = new RoutingTelemetryEmitter({
      maxEntries: 2,
      windowMs: 60_000,
      clock: () => new Date(baseTime).toISOString(),
    });

    emitter.emit(makeRequest({ request_id: 'req-1' }), makeDecision({ request_id: 'req-1' }));
    emitter.emit(makeRequest({ request_id: 'req-2' }), makeDecision({ request_id: 'req-2' }));
    emitter.emit(makeRequest({ request_id: 'req-3' }), makeDecision({ request_id: 'req-3' }));

    const snapshot = emitter.snapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((entry) => entry.request_id)).toEqual(['req-2', 'req-3']);
  });

  it('uses default max entries constant', () => {
    expect(TELEMETRY_MAX_ENTRIES).toBe(1111);
  });

  it('emits context-fit metadata when gate rejects models', async () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({
      fleet: contextFleet,
      onRecord,
    });
    const pipeline = new RouterPipeline(contextFleet, { telemetryEmitter: emitter });
    await pipeline.route(makeRequest({ estimated_input_tokens: 34_000 }));

    expect(onRecord).toHaveBeenCalledOnce();
    const record = onRecord.mock.calls[0]?.[0];
    expect(record?.estimated_input_tokens).toBe(34_000);
    expect(record?.context_fit_viable_count).toBe(1);
    expect(record?.context_fit_reason_code).toBe(CONTEXT_OVERFLOW_FRONTIER_FALLBACK);
    expect(record?.context_overflow_pin_break).toBe(true);
    expect(record?.selected_model_max_input_tokens).toBe(200_000);
    expect(record?.context_fit_rejected_json).toContain('small-window');
    expect(record?.context_fit_rejected_json).toContain('32768');
  });

  it('emits context_fit_pass when all models fit', async () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({
      fleet: contextFleet,
      onRecord,
    });
    const pipeline = new RouterPipeline(contextFleet, { telemetryEmitter: emitter });
    await pipeline.route(makeRequest({ estimated_input_tokens: 1_000 }));

    expect(onRecord).toHaveBeenCalledOnce();
    const record = onRecord.mock.calls[0]?.[0];
    expect(record?.context_fit_reason_code).toBe(CONTEXT_FIT_PASS);
    expect(record?.context_fit_rejected_json).toBeNull();
    expect(record?.context_overflow_pin_break).toBe(false);
  });
});

describe('buildContextFitObservability', () => {
  it('returns null when force_model_id skips the gate', () => {
    const result = buildContextFitObservability({
      request: makeRequest({ force_model_id: 'locked-model', estimated_input_tokens: 99_000 }),
      decision: makeDecision(),
      fleet: contextFleet,
    });

    expect(result).toBeNull();
  });

  it('marks overflow pin break and frontier fallback reason codes', () => {
    const result = buildContextFitObservability({
      request: makeRequest({ estimated_input_tokens: 1_000_000 }),
      decision: makeDecision({
        selected_model_id: 'large-window',
        reason_code: CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
        pin_reason: 'context_overflow',
        features: {
          triage: null,
          requirements: null,
          candidates: [
            {
              model_id: 'small-window',
              score: 0,
              shortfall: 900_000,
              rejected_reason: CONTEXT_FIT_EXCEEDED,
            },
          ],
          tier_hint: null,
          tier_hint_reason_code: null,
          low_intensity_score: null,
          p_success_cheap: null,
      p_success_raw: null,
      p_success_calibrated: null,
          p_success_alpha: null,
          local_eligible_reason: null,
        },
      }),
      fleet: contextFleet,
    });

    expect(result).toMatchObject({
      estimated_input_tokens: 1_000_000,
      context_overflow_pin_break: true,
      context_fit_reason_code: CONTEXT_OVERFLOW_PIN_BREAK,
      selected_model_max_input_tokens: 200_000,
    });
  });

  it('reports rejected-all when no model can serve the request', () => {
    const result = buildContextFitObservability({
      request: makeRequest({ estimated_input_tokens: 500_000 }),
      decision: makeDecision({
        selected_model_id: 'unknown',
        reason_code: CONTEXT_OVERFLOW_NO_FIT,
        features: {
          triage: null,
          requirements: null,
          candidates: [
            {
              model_id: 'small-window',
              score: 0,
              shortfall: 400_000,
              rejected_reason: CONTEXT_FIT_EXCEEDED,
            },
            {
              model_id: 'large-window',
              score: 0,
              shortfall: 100_000,
              rejected_reason: CONTEXT_FIT_EXCEEDED,
            },
          ],
          tier_hint: null,
          tier_hint_reason_code: null,
          low_intensity_score: null,
          p_success_cheap: null,
      p_success_raw: null,
      p_success_calibrated: null,
          p_success_alpha: null,
          local_eligible_reason: null,
        },
      }),
      fleet: contextFleet,
    });

    expect(result?.context_fit_viable_count).toBe(0);
    expect(result?.context_fit_reason_code).toBe(CONTEXT_OVERFLOW_NO_FIT);
  });
});

describe('buildRoutingDecisionLogPayload', () => {
  it('includes context_fit summary in features for routing logs', () => {
    const request = makeRequest({ estimated_input_tokens: 34_000 });
    const decision = makeDecision({
      selected_model_id: 'large-window',
      features: {
        triage: null,
        requirements: null,
        candidates: [
          {
            model_id: 'small-window',
            score: 0,
            shortfall: 1_000,
            rejected_reason: CONTEXT_FIT_EXCEEDED,
          },
        ],
        tier_hint: null,
        tier_hint_reason_code: null,
        low_intensity_score: null,
        p_success_cheap: null,
      p_success_raw: null,
      p_success_calibrated: null,
        p_success_alpha: null,
        local_eligible_reason: null,
      },
    });

    const payload = buildRoutingDecisionLogPayload(
      request,
      decision,
      { provider: 'test', modelId: 'large-window', api: 'openai-responses' },
      contextFleet,
    );

    const features = payload.features as { context_fit?: Record<string, unknown> };
    expect(features.context_fit).toMatchObject({
      estimated_input_tokens: 34_000,
      context_fit_reason_code: CONTEXT_FIT_PASS,
      context_overflow_pin_break: false,
    });
    expect(features.context_fit?.context_fit_rejected_json).toContain('small-window');
  });
});

describe('enrichRoutingDecisionWithContextFit', () => {
  it('attaches context_fit to decision features without mutating routing fields', () => {
    const request = makeRequest({ estimated_input_tokens: 34_000 });
    const decision = makeDecision({
      selected_model_id: 'large-window',
      features: {
        triage: null,
        requirements: null,
        candidates: [
          {
            model_id: 'small-window',
            score: 0,
            shortfall: 1_000,
            rejected_reason: CONTEXT_FIT_EXCEEDED,
          },
        ],
        tier_hint: null,
        tier_hint_reason_code: null,
        low_intensity_score: null,
        p_success_cheap: null,
      p_success_raw: null,
      p_success_calibrated: null,
        p_success_alpha: null,
        local_eligible_reason: null,
      },
    });

    const enriched = enrichRoutingDecisionWithContextFit(request, decision, contextFleet);

    expect(enriched.selected_model_id).toBe('large-window');
    expect(enriched.features?.context_fit?.context_fit_reason_code).toBe(CONTEXT_FIT_PASS);
  });
});

describe('tier-selection observability (SP-113)', () => {
  function makeTierFeatures(overrides?: Partial<NonNullable<RoutingDecision['features']>>) {
    return {
      triage: {
        verdict: 'ambiguous' as const,
        reason_code: 'mixed_signals',
        cyclomatic_score: 2,
      },
      requirements: { reasoning: 0.4, code_gen: 0.3, tool_use: 0.1 },
      candidates: [
        {
          model_id: '__expected_cost_economical-cloud__',
          score: 0.0002,
          shortfall: 0.00025,
          rejected_reason: 'p_success=0.8200',
        },
        {
          model_id: '__expected_cost_frontier-cloud__',
          score: 0.0012,
          shortfall: 0.0012,
          rejected_reason: 'p_success=0.8200',
        },
      ],
      tier_hint: 'economical-cloud' as const,
      tier_hint_reason_code: 'expected_cost_economical_cloud',
      low_intensity_score: 0.72,
      p_success_cheap: 0.82,
      p_success_raw: 0.82,
      p_success_calibrated: 0.82,
      p_success_alpha: 0.5,
      local_eligible_reason: 'cluster_low_stakes_general',
      ...overrides,
    };
  }

  it('normalizes expected-cost economical hints to p_success_cheap', () => {
    const reason = resolveTierSelectionReasonCode(makeTierFeatures());
    expect(reason).toBe(P_SUCCESS_CHEAP);
  });

  it('maps deferred expected-cost selection to p_success_uncertain', () => {
    const reason = resolveTierSelectionReasonCode(
      makeTierFeatures({
        tier_hint: null,
        tier_hint_reason_code: 'expected_cost_price_delta_insufficient',
      }),
    );
    expect(reason).toBe(P_SUCCESS_UNCERTAIN);
  });

  it('preserves cluster and structural reason codes', () => {
    expect(
      resolveTierSelectionReasonCode(
        makeTierFeatures({ tier_hint_reason_code: 'cluster_architecture' }),
      ),
    ).toBe('cluster_architecture');
    expect(
      resolveTierSelectionReasonCode(
        makeTierFeatures({
          tier_hint: 'economical-cloud',
          tier_hint_reason_code: LOW_INTENSITY_STRUCTURAL,
        }),
      ),
    ).toBe(LOW_INTENSITY_STRUCTURAL);
  });

  it('builds tier_selection observability with cluster table and skip reasons', () => {
    const decision = makeDecision({
      stage: 'hydra_match',
      features: makeTierFeatures(),
    });
    const table = [
      {
        cluster_id: 'low_stakes_general',
        tier_bias: 'economical-cloud' as const,
        similarity: 0.91,
        margin: 0.08,
        confidence: 'high' as const,
        selected: true,
      },
      {
        cluster_id: 'architecture',
        tier_bias: 'frontier-cloud' as const,
        similarity: 0.42,
        margin: null,
        confidence: 'none' as const,
        selected: false,
      },
    ];

    const observability = buildTierSelectionObservability({
      decision,
      clusterMatchTable: table,
    });

    expect(observability).toMatchObject({
      cluster_id: 'low_stakes_general',
      cluster_similarity: 0.91,
      cluster_margin: 0.08,
      low_intensity_score: 0.72,
      tier_hint: 'economical-cloud',
      p_success_cheap: 0.82,
      local_eligible_reason: 'cluster_low_stakes_general',
      tier_selection_reason_code: P_SUCCESS_CHEAP,
    });
    expect(observability?.low_intensity_breakdown?.p_success_raw).toBe(0.82);
    expect(observability?.low_intensity_breakdown?.p_success_calibrated).toBe(0.82);
    expect(observability?.cluster_match_table).toHaveLength(2);
    expect(observability?.low_intensity_breakdown?.rejected_tiers).toHaveLength(2);
    expect(buildLocalZeroSkipReasons(decision, decision.features)).toContain(
      'hardware_or_local_unavailable',
    );
  });

  it('emits tier-selection telemetry fields when decision includes features', async () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({ onRecord });
    const pipeline = new RouterPipeline(contextFleet, { telemetryEmitter: emitter });
    const decision = await pipeline.route(
      makeRequest({ prompt_text: 'Hello, how are you today?' }),
    );

    emitter.emit(makeRequest({ prompt_text: 'Hello, how are you today?' }), decision);

    const record = onRecord.mock.calls.at(-1)?.[0];
    expect(record?.low_intensity_score).not.toBeNull();
    expect(record?.tier_selection_reason_code).not.toBeNull();
  });

  it('includes cluster_summary in routing log payload', () => {
    const decision = makeDecision({
      features: makeTierFeatures(),
    });
    const payload = buildRoutingDecisionLogPayload(makeRequest(), decision, undefined, contextFleet);

    expect(payload.cluster_summary).toMatchObject({
      cluster_id: 'low_stakes_general',
      tier_hint: 'economical-cloud',
      tier_selection_reason_code: P_SUCCESS_CHEAP,
      low_intensity_score: 0.72,
    });
  });

  it('attaches tier_selection to decision features for explain', () => {
    const decision = makeDecision({ features: makeTierFeatures() });
    const enriched = enrichRoutingDecisionWithTierSelection(decision);

    expect(enriched.features?.tier_selection?.tier_feature_summary?.triage_verdict).toBe(
      'ambiguous',
    );
    expect(enriched.features?.tier_selection?.local_zero_skip_reasons).toContain(
      'hardware_or_local_unavailable',
    );
  });
});

describe('pin economics observability (SP-126)', () => {
  const warmBreakevenFleet: ModelProfile[] = [
    makeModel({
      id: 'warm-frontier',
      tier: 'frontier-cloud',
      provider: 'anthropic',
      pricing: { fallback_cost_per_1m: 30.0 },
    }),
    makeModel({
      id: 'warm-econ',
      tier: 'economical-cloud',
      provider: 'anthropic',
      pricing: { fallback_cost_per_1m: 30.0 },
    }),
  ];

  it('emits breakeven_blocked telemetry when warm prefix blocks tool_result downgrade', async () => {
    const saarConfig = DEFAULT_SAAR_CONFIG;
    const pinner = new SessionPinner({ saarConfig });
    pinner.recordPin('sess-1', 'warm-frontier', 'initial');
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({
      fleet: warmBreakevenFleet,
      sessionPinner: pinner,
      saarConfig,
      onRecord,
    });
    const pipeline = new RouterPipeline(warmBreakevenFleet, {
      sessionPinner: pinner,
      saarConfig,
      telemetryEmitter: emitter,
    });

    await pipeline.route(
      makeRequest({
        turn_type: 'tool_result',
        estimated_input_tokens: 100_000,
      }),
    );

    const record = onRecord.mock.calls[0]?.[0];
    expect(record?.breakeven_reason_code).toBe(BREAKEVEN_BLOCKED);
    expect(record?.breakeven_decision).toBe('blocked');
    expect(record?.cache_reprime_cost).toBeGreaterThan(0);
    expect(record?.future_cache_value).toBeGreaterThan(0);
  });

  it('builds SAAR observability for buffer and hard-lock reason codes', () => {
    const saarConfig = DEFAULT_SAAR_CONFIG;
    const pinner = new SessionPinner({ saarConfig });
    pinner.recordPin('sess-1', 'warm-frontier', 'initial');
    pinner.recordSaarTurn('sess-1');

    const buffer = buildSaarObservability({
      request: makeRequest({ turn_type: 'planning' }),
      decision: makeDecision({ reason_code: SAAR_BUFFER_ACTIVE, stage: 'session_pin' }),
      sessionPinner: pinner,
      saarConfig,
    });
    expect(buffer?.buffer_active).toBe(true);
    expect(buffer?.saar_reason_code).toBe(SAAR_BUFFER_ACTIVE);
    expect(buffer?.planning_turn_buffer).toBe(2);

    pinner.recordSaarTurn('sess-1');
    const hardLock = buildSaarObservability({
      request: makeRequest({ turn_type: 'main_loop' }),
      decision: makeDecision({ reason_code: SAAR_HARD_LOCK, stage: 'session_pin' }),
      sessionPinner: pinner,
      saarConfig,
    });
    expect(hardLock?.hard_lock).toBe(true);
    expect(hardLock?.saar_reason_code).toBe(SAAR_HARD_LOCK);
  });

  it('enriches explain features with breakeven breakdown', () => {
    const saarConfig = DEFAULT_SAAR_CONFIG;
    const pinner = new SessionPinner({ saarConfig });
    pinner.recordPin('sess-1', 'warm-frontier', 'initial');

    const enriched = enrichRoutingDecisionWithPinEconomics(
      makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 100_000 }),
      makeDecision({
        stage: 'session_pin',
        reason_code: 'session_pinned',
        selected_model_id: 'warm-frontier',
      }),
      { fleet: warmBreakevenFleet, sessionPinner: pinner, saarConfig },
    );

    expect(enriched.features?.breakeven?.breakeven_reason_code).toBe(BREAKEVEN_BLOCKED);
    expect(enriched.features?.breakeven?.decision).toBe('blocked');
    expect(enriched.features?.breakeven?.marginal_savings).toBe(0);
  });

  it('includes breakeven_summary and saar_summary in routing log payload', () => {
    const saarConfig = DEFAULT_SAAR_CONFIG;
    const pinner = new SessionPinner({ saarConfig });
    pinner.recordPin('sess-1', 'warm-frontier', 'initial');

    const payload = buildRoutingDecisionLogPayload(
      makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 100_000 }),
      makeDecision({
        stage: 'session_pin',
        reason_code: 'session_pinned',
        selected_model_id: 'warm-frontier',
      }),
      undefined,
      warmBreakevenFleet,
      undefined,
      { sessionPinner: pinner, saarConfig },
    );

    expect(payload.breakeven_summary).toMatchObject({
      breakeven_reason_code: BREAKEVEN_BLOCKED,
      decision: 'blocked',
    });
    expect(payload.saar_summary).toMatchObject({
      buffer_active: true,
      planning_turn_buffer: 2,
      idle_timeout_seconds: 300,
    });
  });

  it('records quota premium and cache credit separately in breakeven observability (SP-149)', () => {
    const saarConfig = DEFAULT_SAAR_CONFIG;
    const pinner = new SessionPinner({ saarConfig });
    pinner.recordPin('sess-1', 'warm-frontier', 'initial');

    const observability = buildBreakevenObservability({
      request: makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 100_000 }),
      decision: makeDecision({
        stage: 'session_pin',
        reason_code: 'session_pinned',
        selected_model_id: 'warm-frontier',
      }),
      fleet: warmBreakevenFleet,
      sessionPinner: pinner,
      saarConfig,
      quotaWindowPosition: { remaining_window_fraction: 0.05 },
    });

    expect(observability?.quota_premium_usd).not.toBeNull();
    expect(observability?.kv_cache_credit_usd).toBeGreaterThan(0);
    expect(observability?.quota_premium_usd).toBeGreaterThan(0);
  });

  it('returns null breakeven observability without session pinner', () => {
    expect(
      buildBreakevenObservability({
        request: makeRequest({ turn_type: 'tool_result' }),
        decision: makeDecision(),
        fleet: warmBreakevenFleet,
      }),
    ).toBeNull();
  });
});

describe('planning delegate observability (SP-142)', () => {
  const compressedContext = DEFAULT_PLANNING_DELEGATE_CONFIG.compressed_context;

  function makeDelegateFeatures() {
    return createPlanningDelegateObservability({
      path: 'delegate',
      primary_model_id: 'warm-econ',
      delegate_model_id: 'warm-frontier',
      compressed_context: compressedContext,
      planning_delegate_reason_code: PLANNING_DELEGATE,
    });
  }

  it('serializes delegate path telemetry from decision features', () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({ onRecord });
    const decision = enrichRoutingDecisionWithPlanningDelegate(
      makeDecision({
        stage: 'turn_envelope',
        reason_code: PLANNING_DELEGATE,
        selected_model_id: 'warm-econ',
        tier: 'economical-cloud',
      }),
      makeDelegateFeatures(),
    );

    emitter.emit(makeRequest({ turn_type: 'planning' }), decision);

    expect(onRecord.mock.calls[0]?.[0]).toMatchObject({
      turn_type: 'planning',
      planning_delegate_path: 'delegate',
      planning_delegate_primary_model_id: 'warm-econ',
      planning_delegate_model_id: 'warm-frontier',
      planning_delegate_reason_code: PLANNING_DELEGATE,
      planning_delegate_max_messages: 12,
      planning_delegate_max_tokens: 16_384,
      planning_delegate_exclude_execution_history: true,
    });
  });

  it('serializes direct frontier fallback telemetry', () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({ onRecord });
    const decision = enrichRoutingDecisionWithPlanningDelegate(
      makeDecision({
        stage: 'turn_envelope',
        reason_code: PLANNING_DIRECT_FRONTIER,
        selected_model_id: 'warm-frontier',
        tier: 'frontier-cloud',
      }),
      createPlanningDelegateObservability({
        path: 'direct',
        delegate_model_id: 'warm-frontier',
        planning_delegate_reason_code: PLANNING_DIRECT_FRONTIER,
        fallback_reason: 'planning_delegate_disabled',
      }),
    );

    emitter.emit(makeRequest({ turn_type: 'planning' }), decision);

    expect(onRecord.mock.calls[0]?.[0]).toMatchObject({
      planning_delegate_path: 'direct',
      planning_delegate_model_id: 'warm-frontier',
      planning_delegate_reason_code: PLANNING_DIRECT_FRONTIER,
      planning_delegate_fallback_reason: 'planning_delegate_disabled',
      planning_delegate_max_messages: null,
    });
  });

  it('includes planning_delegate_summary in routing log payload', () => {
    const decision = enrichRoutingDecisionWithPlanningDelegate(
      makeDecision({
        stage: 'turn_envelope',
        reason_code: PLANNING_DELEGATE,
        selected_model_id: 'warm-econ',
      }),
      makeDelegateFeatures(),
    );

    const payload = buildRoutingDecisionLogPayload(
      makeRequest({ turn_type: 'planning' }),
      decision,
    );

    expect(payload.planning_delegate_summary).toMatchObject({
      path: 'delegate',
      primary_model_id: 'warm-econ',
      delegate_model_id: 'warm-frontier',
      planning_delegate_reason_code: PLANNING_DELEGATE,
      compressed_context: compressedContext,
    });
  });

  it('reads planning delegate observability from decision features', () => {
    const decision = enrichRoutingDecisionWithPlanningDelegate(
      makeDecision(),
      makeDelegateFeatures(),
    );

    expect(buildPlanningDelegateObservability(decision)).toMatchObject({
      path: 'delegate',
      primary_model_id: 'warm-econ',
    });
  });

  it('sets pin_only_fallback_active when reason_code is pin_only_fallback', () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({ onRecord });
    const decision = makeDecision({
      stage: 'session_pin',
      reason_code: PIN_ONLY_FALLBACK,
      pin_reason: 'session_pinned',
    });

    emitter.emit(makeRequest(), decision);

    expect(onRecord.mock.calls[0]?.[0]).toMatchObject({
      reason_code: PIN_ONLY_FALLBACK,
      pin_only_fallback_active: true,
    });
  });

  it('defaults pin_only_fallback_active to false for normal routing', () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({ onRecord });

    emitter.emit(makeRequest(), makeDecision({ reason_code: 'session_pinned' }));

    expect(onRecord.mock.calls[0]?.[0]).toMatchObject({
      pin_only_fallback_active: false,
    });
  });

  it('includes pin_only_fallback_active in routing log payload', () => {
    const payload = buildRoutingDecisionLogPayload(
      makeRequest(),
      makeDecision({ reason_code: PIN_ONLY_FALLBACK, stage: 'session_pin' }),
    );

    expect(payload.pin_only_fallback_active).toBe(true);
    expect(resolvePinOnlyFallbackActive(makeDecision({ reason_code: PIN_ONLY_FALLBACK }))).toBe(
      true,
    );
  });
});

describe('quality retention pin-only trigger (SP-162)', () => {
  it('detects regression when shadow QR drops more than threshold', () => {
    const result = computeQualityRetentionRegression({
      shadowQualityRetention: 0.89,
      baselineQualityRetention: 0.95,
    });

    expect(result.regression_delta).toBeCloseTo(0.06);
    expect(result.quality_regressed).toBe(true);
    expect(result.regression_threshold).toBe(DEFAULT_QR_REGRESSION_THRESHOLD);
  });

  it('does not regress when shadow QR is within threshold', () => {
    const result = computeQualityRetentionRegression({
      shadowQualityRetention: 0.92,
      baselineQualityRetention: 0.95,
    });

    expect(result.regression_delta).toBeCloseTo(0.03);
    expect(result.quality_regressed).toBe(false);
  });

  it('auto-enables pin_only_fallback on eval regression', () => {
    const result = evaluatePinOnlyFallbackTrigger({
      shadowQualityRetention: 0.88,
      baselineQualityRetention: 0.95,
    });

    expect(result.pin_only_fallback).toBe(true);
    expect(result.trigger_source).toBe('eval_regression');
  });

  it('honors manual operator override over auto trigger', () => {
    const enabled = evaluatePinOnlyFallbackTrigger({
      shadowQualityRetention: 0.99,
      baselineQualityRetention: 0.95,
      manualOverride: true,
    });
    expect(enabled.pin_only_fallback).toBe(true);
    expect(enabled.trigger_source).toBe('manual');

    const disabled = evaluatePinOnlyFallbackTrigger({
      shadowQualityRetention: 0.8,
      baselineQualityRetention: 0.95,
      manualOverride: false,
    });
    expect(disabled.pin_only_fallback).toBe(false);
    expect(disabled.trigger_source).toBe('none');
  });

  it('evaluates harness aggregate metrics', () => {
    const result = evaluatePinOnlyFallbackFromHarness(
      { mean_quality_retention: 0.84 },
      { mean_quality_retention: 0.9 },
    );

    expect(result.pin_only_fallback).toBe(true);
    expect(result.quality_check.quality_regressed).toBe(true);
  });
});
