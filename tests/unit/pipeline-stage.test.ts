import { describe, expect, it, vi } from 'vitest';

import {
  RouterPipeline,
  type StageResult,
} from '../../src/domain/pipeline/router-pipeline.js';
import type {
  PipelineStage,
  RoutingContext,
} from '../../src/domain/pipeline/pipeline-stage.js';
import type {
  ModelProfile,
  RoutingDecision,
  RoutingRequest,
} from '../../src/domain/types/index.js';

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

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: '00000000-0000-0000-0000-000000000001',
    session_id: 'sess-1',
    prompt_text: 'Hello world',
    ...overrides,
  };
}

const fleet: ModelProfile[] = [
  makeModel({ id: 'local-llama', tier: 'zero-tier' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
];

/** Full RoutingContext fixture — every shared field initialized to its route-start value. */
function makeRoutingContext(overrides?: Partial<RoutingContext>): RoutingContext {
  return {
    request: makeRequest(),
    options: {},
    fleet,
    fullFleet: fleet,
    hardwareResult: 'disabled',
    triageResult: null,
    hydraResult: null,
    clusterMatch: null,
    tierHint: null,
    tierHintReasonCode: null,
    lowIntensityScore: null,
    pSuccessCheap: null,
    pSuccessRaw: null,
    pSuccessCalibrated: null,
    pSuccessAlpha: null,
    expectedCostByTier: null,
    localEligibleReason: null,
    contextFitRejected: [],
    contextFitViableCount: fleet.length,
    contextOverflowTriggered: false,
    contextOverflowPreferredProvider: null,
    breakevenReason: null,
    planningDelegate: null,
    localZeroGateSkipReasons: [],
    routePath: null,
    routePathConfidence: null,
    prewarmOutcome: null,
    ...overrides,
  };
}

describe('PipelineStage + RoutingContext contract (SP-272, #143)', () => {
  it('a deciding stage short-circuits with a decision', async () => {
    const decision: RoutingDecision = {
      request_id: '00000000-0000-0000-0000-000000000001',
      selected_model_id: 'claude-opus',
      tier: 'frontier-cloud',
      stage: 'triage',
      reason_code: 'test_decision',
      routing_latency_ms: 0,
      pin_reason: null,
    };

    const stage: PipelineStage = {
      name: 'triage',
      run: async (context) => ({
        decided: true,
        stage: 'triage',
        decision: { ...decision, request_id: context.request.request_id },
      }),
    };

    const result: StageResult = await stage.run(makeRoutingContext());

    expect(stage.name).toBe('triage');
    expect(result.decided).toBe(true);
    expect(result.decision?.selected_model_id).toBe('claude-opus');
  });

  it('a continuing stage shares its outputs with later stages via the context', async () => {
    const seen: (string | null)[] = [];

    const producer: PipelineStage = {
      name: 'low_intensity',
      run: async (context) => {
        context.tierHint = 'economical-cloud';
        context.lowIntensityScore = 0.9;
        return { decided: false, stage: 'low_intensity' };
      },
    };

    const consumer: PipelineStage = {
      name: 'local_zero',
      run: async (context) => {
        seen.push(context.tierHint);
        return { decided: false, stage: 'local_zero' };
      },
    };

    const context = makeRoutingContext();
    const producerResult = await producer.run(context);
    await consumer.run(context);

    expect(producerResult.decided).toBe(false);
    expect(seen).toEqual(['economical-cloud']);
    expect(context.lowIntensityScore).toBe(0.9);
  });

  it('context_fit stage semantics: fleet is narrowable while fullFleet stays intact', async () => {
    const context = makeRoutingContext();
    context.fleet = context.fleet.filter((model) => model.tier !== 'zero-tier');

    expect(context.fleet).toHaveLength(2);
    expect(context.fullFleet).toHaveLength(3);
  });
});

describe('RouterPipeline hardware_probe thin-wrap (SP-272)', () => {
  it('runs hardware_probe through the PipelineStage interface (provider invoked, routing unchanged)', async () => {
    const systemInfoProvider = vi.fn(async () => ({
      totalMemoryGb: 32,
      arch: 'arm64',
      platform: 'darwin' as const,
      batteryLevel: 100,
      isOnAcPower: true,
    }));

    const pipeline = new RouterPipeline(fleet, {
      hardwareConfig: {
        min_memory_gb_full: 16,
        min_memory_gb_classification: 8,
        battery_threshold_pct: 20,
      },
      systemInfoProvider,
    });

    const decision = await pipeline.route(makeRequest());

    expect(systemInfoProvider).toHaveBeenCalledOnce();
    // Routing completes through the wrapped stage without behavior change.
    expect(fleet.map((model) => model.id)).toContain(decision.selected_model_id);
  });

  it('degrades to safe default when the wrapped hardware_probe stage throws (zero-crash)', async () => {
    const pipeline = new RouterPipeline(fleet, {
      hardwareConfig: {
        min_memory_gb_full: 16,
        min_memory_gb_classification: 8,
        battery_threshold_pct: 20,
      },
      systemInfoProvider: async () => {
        throw new Error('probe unavailable');
      },
    });

    await expect(pipeline.route(makeRequest())).resolves.toMatchObject({
      stage: 'fallback',
      reason_code: 'safe_cloud_default',
    });
  });
});
