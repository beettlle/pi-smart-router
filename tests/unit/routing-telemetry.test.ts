import { describe, expect, it, vi } from 'vitest';

import {
  CONTEXT_FIT_EXCEEDED,
  CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
  CONTEXT_OVERFLOW_NO_FIT,
} from '../../src/domain/routing/context-fit.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import {
  CONTEXT_FIT_PASS,
  CONTEXT_OVERFLOW_PIN_BREAK,
  RoutingTelemetryEmitter,
  buildContextFitObservability,
  buildRoutingDecisionLogPayload,
  enrichRoutingDecisionWithContextFit,
} from '../../src/infrastructure/telemetry/routing-telemetry.js';
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
          p_success_alpha: null,
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
          p_success_alpha: null,
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
        p_success_alpha: null,
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
        p_success_alpha: null,
      },
    });

    const enriched = enrichRoutingDecisionWithContextFit(request, decision, contextFleet);

    expect(enriched.selected_model_id).toBe('large-window');
    expect(enriched.features?.context_fit?.context_fit_reason_code).toBe(CONTEXT_FIT_PASS);
  });
});
