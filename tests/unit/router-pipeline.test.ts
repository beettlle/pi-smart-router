import { describe, expect, it, vi } from 'vitest';

import type { ClusterMatcher, ClusterMatchResult } from '../../src/domain/matching/cluster-matcher.js';
import {
  HydraMatcher,
  type EmbeddingProvider,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import { RouterPipeline, PIPELINE_STAGE_ORDER, resolveLocalEligible, estimateCheapToolUseRequirement, resolveLocalZeroToolUseCeiling } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import { extractToolFailureSignature } from '../../src/domain/pinning/loop-escalation.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import { CONTEXT_FIT_EXCEEDED } from '../../src/domain/routing/context-fit.js';
import type { HttpFetchPort } from '../../src/infrastructure/local/local-zero-tier.js';
import type { SystemInfo } from '../../src/infrastructure/hardware/hardware-probe.js';
import type { ThroughputMeter } from '../../src/infrastructure/hardware/throughput-meter.js';
import { THROUGHPUT_BELOW_THRESHOLD } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import type { ModelProfile, PriceCatalog, RoutingRequest } from '../../src/domain/types/index.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import { DEFAULT_SAAR_CONFIG } from '../../src/domain/types/schemas.js';
import {
  P_SUCCESS_FEATURE_NAMES,
  createDefaultPSuccessWeights,
  type PSuccessWeights,
} from '../../src/domain/routing/p-success-classifier.js';
import type { IsotonicCalibratorArtifact } from '../../src/domain/routing/isotonic-calibrator.js';

/** Pre-SP-175 structural tests: ignore shipped dogfood weights. */
const UNTRAINED_P_SUCCESS_WEIGHTS = createDefaultPSuccessWeights();

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

const HARDWARE_CONFIG = {
  min_memory_gb_full: 16,
  min_memory_gb_classification: 8,
  battery_threshold_pct: 20,
} as const;

describe('RouterPipeline', () => {
  describe('pipeline stage order (SP-119)', () => {
    it('registers stages in documented integration order', () => {
      const pipeline = new RouterPipeline(fleet);
      const registered = (pipeline as unknown as { stages: { name: string }[] }).stages.map(
        (stage) => stage.name,
      );

      expect(registered).toEqual([...PIPELINE_STAGE_ORDER]);
    });
  });

  describe('stage chain with placeholders', () => {
    it('runs through all placeholder stages and returns safe default', async () => {
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.pin_reason).toBeNull();
      expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('preserves request_id in the fallback decision', async () => {
      const pipeline = new RouterPipeline(fleet);
      const request = makeRequest({ request_id: '11111111-1111-1111-1111-111111111111' });
      const decision = await pipeline.route(request);

      expect(decision.request_id).toBe('11111111-1111-1111-1111-111111111111');
    });
  });

  describe('safe default fallback on failure', () => {
    it('returns safe default when fleet has only frontier models', async () => {
      const frontierOnly = [makeModel({ id: 'opus', tier: 'frontier-cloud' })];
      const pipeline = new RouterPipeline(frontierOnly);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('opus');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.stage).toBe('fallback');
    });

    it('returns unknown model when fleet is empty', async () => {
      const pipeline = new RouterPipeline([]);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('unknown');
      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
    });

    it('never throws even with empty fleet', async () => {
      const pipeline = new RouterPipeline([]);
      await expect(pipeline.route(makeRequest())).resolves.toBeDefined();
    });

    it('skips unhealthy economical models and falls back to frontier', async () => {
      const mixedFleet = [
        makeModel({ id: 'econ-down', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'frontier-up', tier: 'frontier-cloud' }),
      ];
      const pipeline = new RouterPipeline(mixedFleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('frontier-up');
      expect(decision.tier).toBe('frontier-cloud');
    });
  });

  describe('StageResult type contract', () => {
    it('fallback decision satisfies RoutingDecision shape', async () => {
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision).toHaveProperty('request_id');
      expect(decision).toHaveProperty('selected_model_id');
      expect(decision).toHaveProperty('tier');
      expect(decision).toHaveProperty('stage');
      expect(decision).toHaveProperty('reason_code');
      expect(decision).toHaveProperty('routing_latency_ms');
      expect(decision).toHaveProperty('pin_reason');
    });
  });

  describe('session pin integration (FR-006, FR-007, FR-008)', () => {
    const pinFleet: ModelProfile[] = [
      makeModel({
        id: 'econ-a',
        tier: 'economical-cloud',
        provider: 'anthropic',
        pricing: { fallback_cost_per_1m: 1.0 },
      }),
      makeModel({
        id: 'frontier-a',
        tier: 'frontier-cloud',
        provider: 'anthropic',
        pricing: { fallback_cost_per_1m: 15.0 },
      }),
      makeModel({ id: 'econ-o', tier: 'economical-cloud', provider: 'openai' }),
    ];

    it('pin decision is returned before triage when pin exists', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(makeRequest());

      expect(decision.stage).toBe('session_pin');
      expect(decision.reason_code).toBe('session_pinned');
      expect(decision.selected_model_id).toBe('frontier-a');
      expect(decision.pin_reason).toBe('initial');
    });

    it('persistPinIfNeeded records a pin after fallback routing', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });

      const decision = await pipeline.route(makeRequest());

      expect(decision.stage).toBe('fallback');
      const pin = pinner.getPin('sess-1');
      expect(pin).not.toBeNull();
      expect(pin!.pinned_model_id).toBe(decision.selected_model_id);
      expect(pin!.pin_reason).toBe('initial');
    });

    it('sub-route decisions do not re-persist the pin when breakeven passes', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(
        makeRequest({
          turn_type: 'tool_result',
          estimated_input_tokens: 50,
        }),
      );

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('turn_tool_result');
      expect(decision.selected_model_id).toBe('econ-a');
      const pin = pinner.getPin('sess-1');
      expect(pin!.pinned_model_id).toBe('frontier-a');
    });

    it('turn_envelope downgrade blocked by breakeven does not re-persist the pin (SP-125)', async () => {
      const warmPinFleet: ModelProfile[] = [
        makeModel({
          id: 'econ-a',
          tier: 'economical-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 30.0 },
        }),
        makeModel({
          id: 'frontier-a',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 30.0 },
        }),
      ];
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(warmPinFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(
        makeRequest({
          turn_type: 'tool_result',
          estimated_input_tokens: 100_000,
        }),
      );

      expect(decision.stage).toBe('session_pin');
      expect(decision.reason_code).toBe('session_pinned');
      expect(decision.selected_model_id).toBe('frontier-a');
      const pin = pinner.getPin('sess-1');
      expect(pin!.pinned_model_id).toBe('frontier-a');
    });

    it('planning turn emits planning_delegate when warm economical pin active (SP-143)', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'econ-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(makeRequest({ turn_type: 'planning' }));

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('planning_delegate');
      expect(decision.selected_model_id).toBe('econ-a');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.features?.planning_delegate).toMatchObject({
        path: 'delegate',
        primary_model_id: 'econ-a',
        delegate_model_id: 'frontier-a',
        planning_delegate_reason_code: 'planning_delegate',
      });
      expect(pinner.getPin('sess-1')!.pinned_model_id).toBe('econ-a');
    });

    it('planning delegate disabled falls back to direct frontier inside SAAR buffer (SP-143)', async () => {
      const pricedPinFleet: ModelProfile[] = [
        makeModel({
          id: 'econ-a',
          tier: 'economical-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 0.8 },
        }),
        makeModel({
          id: 'frontier-a',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
      ];
      const saarConfig = { ...DEFAULT_SAAR_CONFIG, planning_turn_buffer: 2 };
      const pinner = new SessionPinner({ saarConfig });
      const pipeline = new RouterPipeline(pricedPinFleet, {
        sessionPinner: pinner,
        saarConfig,
        planningDelegateConfig: {
          enabled: false,
          compressed_context: DEFAULT_OPERATOR_CONFIG.planning_delegate.compressed_context,
        },
      });

      await pipeline.route(makeRequest({ request_id: 'warmup', turn_type: 'main_loop' }));
      const decision = await pipeline.route(
        makeRequest({ request_id: 'planning-direct', turn_type: 'planning' }),
      );

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('planning_direct_frontier');
      expect(decision.selected_model_id).toBe('frontier-a');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.features?.planning_delegate).toMatchObject({
        path: 'direct',
        delegate_model_id: 'frontier-a',
        planning_delegate_reason_code: 'planning_direct_frontier',
        fallback_reason: 'planning_delegate_disabled',
      });
    });

    it('planning delegate disabled blocked by breakeven stays on economical pin (SP-143)', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'econ-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, {
        sessionPinner: pinner,
        planningDelegateConfig: {
          enabled: false,
          compressed_context: DEFAULT_OPERATOR_CONFIG.planning_delegate.compressed_context,
        },
      });
      const decision = await pipeline.route(makeRequest({ turn_type: 'planning' }));

      expect(decision.stage).toBe('session_pin');
      expect(decision.reason_code).toBe('session_pinned');
      expect(decision.selected_model_id).toBe('econ-a');
      expect(pinner.getPin('sess-1')!.pinned_model_id).toBe('econ-a');
    });

    it('tool_result turn with frontier pin routes economical when breakeven passes (SP-064/125)', async () => {
      const pricedPinFleet: ModelProfile[] = [
        makeModel({
          id: 'econ-a',
          tier: 'economical-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 0.8 },
        }),
        makeModel({
          id: 'frontier-a',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
      ];
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(pricedPinFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
      );

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('turn_tool_result');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.selected_model_id).toBe('econ-a');
      expect(pinner.getPin('sess-1')!.pinned_model_id).toBe('frontier-a');
    });

    it('already-pinned decisions do not re-persist the pin', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'user_forced');

      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });
      await pipeline.route(makeRequest({ turn_type: 'main_loop' }));

      const pin = pinner.getPin('sess-1');
      expect(pin!.pin_reason).toBe('user_forced');
    });

    it('second request reuses established pin', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });

      const first = await pipeline.route(makeRequest());
      const second = await pipeline.route(makeRequest({ request_id: 'req-002' }));

      expect(second.stage).toBe('session_pin');
      expect(second.reason_code).toBe('session_pinned');
      expect(second.selected_model_id).toBe(first.selected_model_id);
    });

    it('compaction break allows fresh re-route', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(
        makeRequest({ compaction_flag: true }),
      );

      expect(decision.stage).not.toBe('session_pin');
      const pin = pinner.getPin('sess-1');
      expect(pin).not.toBeNull();
      expect(pin!.pin_reason).toBe('initial');
    });

    it('pipeline without sessionPinner skips pin stage', async () => {
      const pipeline = new RouterPipeline(pinFleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.stage).toBe('fallback');
    });

    it('pin_only_fallback on warm session skips planning delegate (SP-161)', async () => {
      const pinner = new SessionPinner({ pinOnlyFallback: true });
      const pipeline = new RouterPipeline(pinFleet, {
        sessionPinner: pinner,
        pinOnlyFallback: true,
      });

      const first = await pipeline.route(makeRequest({ request_id: 'turn-0' }));
      expect(first.stage).not.toBe('session_pin');

      const planning = await pipeline.route(
        makeRequest({ request_id: 'turn-1', turn_type: 'planning' }),
      );

      expect(planning.stage).toBe('session_pin');
      expect(planning.reason_code).toBe('pin_only_fallback');
      expect(planning.selected_model_id).toBe(first.selected_model_id);
    });

    it('pin_only_fallback off preserves planning delegate on warm economical pin (SP-161)', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'econ-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, {
        sessionPinner: pinner,
        pinOnlyFallback: false,
      });
      const decision = await pipeline.route(makeRequest({ turn_type: 'planning' }));

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('planning_delegate');
    });

    it('pin_only_fallback disables tool_result sub-routing on warm sessions (SP-161)', async () => {
      const pinner = new SessionPinner({ pinOnlyFallback: true });
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, {
        sessionPinner: pinner,
        pinOnlyFallback: true,
      });
      const decision = await pipeline.route(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
      );

      expect(decision.stage).toBe('session_pin');
      expect(decision.reason_code).toBe('pin_only_fallback');
      expect(decision.selected_model_id).toBe('frontier-a');
    });
  });

  describe('pipeline error telemetry (SP-053)', () => {
    it('emits pipeline_error telemetry and returns safe default when a stage throws', async () => {
      const onRecord = vi.fn();
      const telemetryEmitter = new RoutingTelemetryEmitter({ onRecord });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const secretPrompt = 'super-secret-prompt-content';
      const pipeline = new RouterPipeline(fleet, {
        telemetryEmitter,
        hardwareConfig: HARDWARE_CONFIG,
        systemInfoProvider: async () => {
          throw new Error(`probe failed for prompt: ${secretPrompt}`);
        },
      });

      const decision = await pipeline.route(makeRequest({ prompt_text: secretPrompt }));

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');

      expect(onRecord).toHaveBeenCalledOnce();
      expect(onRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          reason_code: 'pipeline_error',
          stage: 'hardware_probe',
          selected_model_id: 'gpt-4o-mini',
        }),
      );

      expect(warnSpy).toHaveBeenCalledOnce();
      const warnPayload = warnSpy.mock.calls[0]?.[1] as { error?: string };
      expect(warnPayload.error).toContain('[REDACTED]');
      expect(warnPayload.error).not.toContain(secretPrompt);

      warnSpy.mockRestore();
    });

    it('never propagates stage exceptions to the caller', async () => {
      const pipeline = new RouterPipeline(fleet, {
        hardwareConfig: HARDWARE_CONFIG,
        systemInfoProvider: async () => {
          throw new Error('hardware probe unavailable');
        },
      });

      await expect(pipeline.route(makeRequest())).resolves.toMatchObject({
        stage: 'fallback',
        reason_code: 'safe_cloud_default',
      });
    });

    it('reports triage_cloud_fallback (not triage) when cloud fallback stage throws (SP-071)', async () => {
      const onRecord = vi.fn();
      const telemetryEmitter = new RoutingTelemetryEmitter({ onRecord });

      const cloudFallbackSpy = vi
        .spyOn(
          RouterPipeline.prototype as unknown as {
            triageCloudFallback: (request: RoutingRequest) => Promise<unknown>;
          },
          'triageCloudFallback',
        )
        .mockRejectedValue(new Error('cloud fallback failed'));

      const pipeline = new RouterPipeline(fleet, { telemetryEmitter });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Fix the typo in the README' }),
      );

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');

      expect(onRecord).toHaveBeenCalledOnce();
      expect(onRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          reason_code: 'pipeline_error',
          stage: 'triage_cloud_fallback',
        }),
      );

      cloudFallbackSpy.mockRestore();
    });
  });

  describe('loop escalation integration (FR-014, Step 3b)', () => {
    // Use different providers so FR-024 sub-routing does not interfere
    // with escalation verification (sub-routing requires same provider).
    const escalationFleet: ModelProfile[] = [
      makeModel({
        id: 'econ-a',
        tier: 'economical-cloud',
        provider: 'openai',
        pricing: { fallback_cost_per_1m: 1.0 },
      }),
      makeModel({
        id: 'frontier-a',
        tier: 'frontier-cloud',
        provider: 'anthropic',
        pricing: { fallback_cost_per_1m: 15.0 },
      }),
    ];

    const failureContent = 'Error: ENOENT file not found';
    const failureSig = extractToolFailureSignature(
      makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
    )!;

    it('escalates session pin after N identical tool failures', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'econ-a', 'initial');

      const pipeline = new RouterPipeline(escalationFleet, {
        sessionPinner: pinner,
        loopEscalationConfig: { threshold: 3 },
      });

      const failureRequest = makeRequest({
        turn_type: 'tool_result',
        messages: [{ role: 'tool', content: failureContent }],
      });

      await pipeline.route(failureRequest);
      await pipeline.route(failureRequest);

      const pin2 = pinner.getPin('sess-1');
      expect(pin2!.pinned_model_id).toBe('econ-a');
      expect(pin2!.consecutive_tool_failures).toBe(2);

      const decision = await pipeline.route(failureRequest);

      expect(decision.selected_model_id).toBe('econ-a');
      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('turn_tool_result');

      const pin3 = pinner.getPin('sess-1');
      expect(pin3!.pinned_model_id).toBe('frontier-a');
      expect(pin3!.pin_reason).toBe('loop_escalation');
    });

    it('pipeline without loopEscalationConfig is a no-op', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'econ-a', 'initial');

      const pipeline = new RouterPipeline(escalationFleet, {
        sessionPinner: pinner,
      });

      const failureRequest = makeRequest({
        turn_type: 'tool_result',
        messages: [{ role: 'tool', content: failureContent }],
      });

      for (let i = 0; i < 5; i++) {
        await pipeline.route(failureRequest);
      }

      const pin = pinner.getPin('sess-1');
      expect(pin!.pinned_model_id).toBe('econ-a');
      expect(pin!.pin_reason).toBe('initial');
    });

    it('escalation fires once — subsequent failures do not re-escalate', async () => {
      const pinner = new SessionPinner();
      pinner.loadPin({
        session_id: 'sess-1',
        pinned_model_id: 'econ-a',
        pin_reason: 'initial',
        has_ever_switched: false,
        consecutive_upstream_errors: 0,
        consecutive_tool_failures: 2,
        last_tool_failure_signature: failureSig,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      });

      const pipeline = new RouterPipeline(escalationFleet, {
        sessionPinner: pinner,
        loopEscalationConfig: { threshold: 3 },
      });

      const failureRequest = makeRequest({
        turn_type: 'tool_result',
        messages: [{ role: 'tool', content: failureContent }],
      });

      const decision1 = await pipeline.route(failureRequest);
      expect(decision1.selected_model_id).toBe('econ-a');
      expect(decision1.stage).toBe('turn_envelope');
      expect(decision1.reason_code).toBe('turn_tool_result');

      const pin = pinner.getPin('sess-1');
      expect(pin!.pin_reason).toBe('loop_escalation');

      // Subsequent planning turns use frontier via turn_envelope
      for (let i = 0; i < 3; i++) {
        const decision = await pipeline.route(makeRequest({
          request_id: `req-post-${i}`,
          turn_type: 'planning',
        }));
        expect(decision.selected_model_id).toBe('frontier-a');
        expect(decision.stage).toBe('turn_envelope');
        expect(decision.reason_code).toBe('turn_planning');
      }

      const finalPin = pinner.getPin('sess-1');
      expect(finalPin!.pin_reason).toBe('loop_escalation');
      expect(finalPin!.pinned_model_id).toBe('frontier-a');
    });

    it('loop escalation stage runs before turn envelope and session pin', async () => {
      const pinner = new SessionPinner();
      pinner.loadPin({
        session_id: 'sess-1',
        pinned_model_id: 'econ-a',
        pin_reason: 'initial',
        has_ever_switched: false,
        consecutive_upstream_errors: 0,
        consecutive_tool_failures: 2,
        last_tool_failure_signature: failureSig,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      });

      const pipeline = new RouterPipeline(escalationFleet, {
        sessionPinner: pinner,
        loopEscalationConfig: { threshold: 3 },
      });

      const decision = await pipeline.route(makeRequest({
        turn_type: 'tool_result',
        messages: [{ role: 'tool', content: failureContent }],
      }));

      expect(decision.selected_model_id).toBe('econ-a');
      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('turn_tool_result');
      expect(pinner.getPin('sess-1')!.pin_reason).toBe('loop_escalation');
    });
  });

  describe('dataset feature sidecar (SP-057)', () => {
    function makeMockHydraProvider(requirements: RequirementVector): EmbeddingProvider {
      return {
        extractRequirements: vi.fn(async () => requirements),
        dispose: vi.fn(async () => {}),
      };
    }

    it('attaches triage summary on fallback decisions', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Fix the typo in the README' }),
      );

      expect(decision.features).toBeDefined();
      expect(decision.features!.triage).toMatchObject({
        verdict: 'trivial',
        reason_code: expect.any(String),
        cyclomatic_score: expect.any(Number),
      });
      expect(decision.features!.requirements).toBeNull();
      expect(decision.features!.candidates).toBeNull();
      expect(JSON.stringify(decision.features)).not.toContain('Fix the typo');
    });

    it('includes triage summary when triage stage decides', async () => {
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Architect a distributed caching system' }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.features!.triage).toMatchObject({
        verdict: 'complex',
        reason_code: 'keyword_frontier',
      });
    });

    it('retains HyDRA requirements and candidates when hydra_match runs', async () => {
      const requirements: RequirementVector = {
        reasoning: 0.5,
        code_gen: 0.5,
        tool_use: 0.5,
      };
      const hydraMatcher = new HydraMatcher(makeMockHydraProvider(requirements), {
        artifactCachePath: '.pi-smart-router/models/',
      });
      const pipeline = new RouterPipeline(fleet, {
        hydraMatcher,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.stage).toBe('hydra_match');
      expect(decision.features!.requirements).toEqual(requirements);
      expect(decision.features!.candidates).toEqual(decision.candidates ?? null);
      expect(decision.features!.triage).toMatchObject({ verdict: 'ambiguous' });
    });

    it('omits triage summary when session pin exits before triage', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });
      const decision = await pipeline.route(makeRequest());

      expect(decision.stage).toBe('session_pin');
      expect(decision.features!.triage).toBeNull();
    });
  });

  describe('gemini deprioritization (SP-080, narrowed SP-129)', () => {
    const geminiFirstFleet: ModelProfile[] = [
      makeModel({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
      makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
      makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
    ];

    const toolHistoryMessages = [
      {
        role: 'assistant' as const,
        content: 'calling tool',
        tool_blocks: [{ id: 'call-1', name: 'read', arguments: '{}' }],
      },
      { role: 'user' as const, content: 'continue' },
    ];

    it('does not deprioritize gemini for routing messages without Google-origin metadata', async () => {
      const pipeline = new RouterPipeline(geminiFirstFleet);
      const decision = await pipeline.route(
        makeRequest({ messages: toolHistoryMessages }),
      );

      expect(decision.selected_model_id).toBe('gemini-flash');
      expect(decision.stage).toBe('fallback');
    });

    it('still selects gemini when it is the only economical option', async () => {
      const geminiOnlyEconomical = [
        makeModel({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
        makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
      ];
      const pipeline = new RouterPipeline(geminiOnlyEconomical);
      const decision = await pipeline.route(
        makeRequest({
          prompt_text: 'Fix the typo in the README',
          messages: toolHistoryMessages,
        }),
      );

      expect(decision.selected_model_id).toBe('gemini-flash');
      expect(decision.stage).toBe('triage');
    });

    it('does not reorder fleet without tool history', async () => {
      const pipeline = new RouterPipeline(geminiFirstFleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('gemini-flash');
    });

    it('skips deprioritization when force_model_id is set', async () => {
      const pipeline = new RouterPipeline(geminiFirstFleet);
      const decision = await pipeline.route(
        makeRequest({
          force_model_id: 'gemini-flash',
          messages: toolHistoryMessages,
        }),
      );

      expect(decision.selected_model_id).toBe('gemini-flash');
    });
  });

  describe('cost-aware turn envelope selection (SP-085)', () => {
    it('selects cheapest economical model for tool_result', async () => {
      const costFleet: ModelProfile[] = [
        makeModel({
          id: 'gemini-pro',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 3.0 },
        }),
        makeModel({
          id: 'gemini-flash-lite',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 0.1 },
        }),
        makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
      ];

      const pipeline = new RouterPipeline(costFleet);
      const decision = await pipeline.route(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
      );

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.selected_model_id).toBe('gemini-flash-lite');
    });

    it('selects cheapest frontier model for planning', async () => {
      const frontierCostFleet: ModelProfile[] = [
        makeModel({
          id: 'opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
        makeModel({
          id: 'sonnet',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 5.0 },
        }),
        makeModel({
          id: 'flash',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 0.1 },
        }),
      ];

      const pipeline = new RouterPipeline(frontierCostFleet);
      const decision = await pipeline.route(makeRequest({ turn_type: 'planning' }));

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.selected_model_id).toBe('sonnet');
    });
  });

  describe('estimated_cost_usd telemetry (SP-085)', () => {
    const pricingFleet: ModelProfile[] = [
      makeModel({
        id: 'flash',
        tier: 'economical-cloud',
        pricing: { fallback_cost_per_1m: 0.6 },
      }),
    ];

    const emptyCatalog: PriceCatalog = {
      registry_snapshot: {},
      user_overrides: {},
      last_updated: '2026-07-05T00:00:00.000Z',
      source: 'yaml_fallback',
    };

    it('populates estimated_cost_usd on turn_envelope decisions', async () => {
      const pipeline = new RouterPipeline(pricingFleet, { priceCatalog: emptyCatalog });
      const decision = await pipeline.route(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 1_000_000 }),
      );

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.estimated_cost_usd).toBeCloseTo(0.6, 5);
    });

    it('populates estimated_cost_usd on session_pin decisions', async () => {
      const pinFleet: ModelProfile[] = [
        makeModel({
          id: 'frontier-a',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
      ];
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, {
        sessionPinner: pinner,
        priceCatalog: emptyCatalog,
      });
      const decision = await pipeline.route(
        makeRequest({ turn_type: 'main_loop', estimated_input_tokens: 2_000_000 }),
      );

      expect(decision.stage).toBe('session_pin');
      expect(decision.estimated_cost_usd).toBeCloseTo(30.0, 5);
    });

    it('populates estimated_cost_usd on hydra_match decisions', async () => {
      const hydraFleet: ModelProfile[] = [
        makeModel({
          id: 'gpt-4o-mini',
          tier: 'economical-cloud',
          pricing: { fallback_cost_per_1m: 0.6 },
        }),
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
      ];

      const requirements = { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 };
      const hydraMatcher = new HydraMatcher(
        {
          extractRequirements: vi.fn(async () => requirements),
          dispose: vi.fn(async () => {}),
        },
        { artifactCachePath: '.pi-smart-router/models/' },
      );

      const pipeline = new RouterPipeline(hydraFleet, {
        hydraMatcher,
        priceCatalog: emptyCatalog,
      });
      const decision = await pipeline.route(
        makeRequest({
          prompt_text: 'Hello, how are you today?',
          estimated_input_tokens: 500_000,
        }),
      );

      expect(decision.stage).toBe('hydra_match');
      expect(decision.estimated_cost_usd).toBeGreaterThan(0);
    });

    it('emits non-zero estimated_cost_usd in telemetry when pricing is available', async () => {
      const onRecord = vi.fn();
      const telemetryEmitter = new RoutingTelemetryEmitter({ onRecord });
      const pipeline = new RouterPipeline(pricingFleet, {
        telemetryEmitter,
        priceCatalog: emptyCatalog,
      });

      await pipeline.route(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 1_000_000 }),
      );

      expect(onRecord).toHaveBeenCalledOnce();
      expect(onRecord.mock.calls[0]?.[0]?.estimated_cost_usd).toBeCloseTo(0.6, 5);
    });
  });

  describe('context-fit gate (SP-093)', () => {
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

    it('excludes undersized models when estimated tokens exceed a 32K window', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'small-window', 'initial');

      const pipeline = new RouterPipeline(contextFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 34_000 }),
      );

      expect(decision.selected_model_id).not.toBe('small-window');
      expect(decision.features?.candidates?.some(
        (c) => c.model_id === 'small-window' && c.rejected_reason === CONTEXT_FIT_EXCEEDED,
      )).toBe(true);
    });

    it('leaves short-prompt routing unchanged when all models fit', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 50 }),
      );

      expect(decision.stage).toBe('fallback');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.features?.candidates ?? []).toEqual([]);
    });

    it('records rejected candidates in decision features', async () => {
      const pipeline = new RouterPipeline(contextFleet);
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 34_000 }),
      );

      const rejected = decision.features?.candidates?.filter(
        (c) => c.rejected_reason === CONTEXT_FIT_EXCEEDED,
      );
      expect(rejected).toHaveLength(1);
      expect(rejected?.[0]?.model_id).toBe('small-window');
      expect(decision.selected_model_id).toBe('large-window');
    });

    it('honors contextFitConfig safety margin from pipeline options', async () => {
      const narrowFleet = [
        makeModel({
          id: 'mid-window',
          tier: 'economical-cloud',
          limits: { max_input_tokens: 20_000 },
        }),
        makeModel({
          id: 'wide-window',
          tier: 'frontier-cloud',
          limits: { max_input_tokens: 200_000 },
        }),
      ];

      const pipeline = new RouterPipeline(narrowFleet, {
        contextFitConfig: { safetyMargin: 0.95 },
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 18_000 }),
      );

      expect(decision.features?.candidates ?? []).toEqual([]);
      expect(decision.selected_model_id).toBe('mid-window');
    });
  });

  describe('context overflow fallback (SP-095)', () => {
    const overflowFleet: ModelProfile[] = [
      makeModel({
        id: 'gemini-flash-lite',
        tier: 'economical-cloud',
        provider: 'google',
        limits: { max_input_tokens: 32_768 },
        pricing: { fallback_cost_per_1m: 0.1 },
      }),
      makeModel({
        id: 'gpt-4o',
        tier: 'frontier-cloud',
        provider: 'openai',
        limits: { max_input_tokens: 128_000 },
        pricing: { fallback_cost_per_1m: 5.0 },
      }),
      makeModel({
        id: 'gemini-1.5-pro',
        tier: 'frontier-cloud',
        provider: 'google',
        limits: { max_input_tokens: 2_000_000 },
        pricing: { fallback_cost_per_1m: 3.0 },
      }),
    ];

    it('routes 1M token estimate to largest-window frontier model, not flash-lite', async () => {
      const pipeline = new RouterPipeline(overflowFleet);
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 1_000_000 }),
      );

      expect(decision.selected_model_id).toBe('gemini-1.5-pro');
      expect(decision.selected_model_id).not.toBe('gemini-flash-lite');
      expect(decision.reason_code).toBe('context_overflow_frontier_fallback');
      expect(decision.features?.candidates?.some(
        (candidate) =>
          candidate.model_id === 'gemini-flash-lite' &&
          candidate.rejected_reason === CONTEXT_FIT_EXCEEDED,
      )).toBe(true);
    });

    it('prefers same-provider largest-fit when pinned Gemini overflows', async () => {
      const geminiFleet: ModelProfile[] = [
        makeModel({
          id: 'gemini-flash',
          tier: 'economical-cloud',
          provider: 'google',
          limits: { max_input_tokens: 128_000 },
          pricing: { fallback_cost_per_1m: 0.5 },
        }),
        makeModel({
          id: 'gemini-pro',
          tier: 'economical-cloud',
          provider: 'google',
          limits: { max_input_tokens: 1_000_000 },
          pricing: { fallback_cost_per_1m: 1.0 },
        }),
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          limits: { max_input_tokens: 200_000 },
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
      ];
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'gemini-flash', 'initial');

      const pipeline = new RouterPipeline(geminiFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 500_000 }),
      );

      expect(decision.reason_code).toBe('context_overflow_same_provider_fallback');
      expect(decision.selected_model_id).toBe('gemini-pro');
    });

    it('returns context_overflow_no_fit instead of delegating undersized models', async () => {
      const tinyFleet: ModelProfile[] = [
        makeModel({
          id: 'small-econ',
          tier: 'economical-cloud',
          limits: { max_input_tokens: 32_768 },
        }),
        makeModel({
          id: 'small-frontier',
          tier: 'frontier-cloud',
          limits: { max_input_tokens: 128_000 },
        }),
      ];
      const pipeline = new RouterPipeline(tinyFleet);
      const decision = await pipeline.route(
        makeRequest({ estimated_input_tokens: 1_000_000 }),
      );

      expect(decision.reason_code).toBe('context_overflow_no_fit');
      expect(decision.selected_model_id).toBe('unknown');
      expect(decision.selected_model_id).not.toBe('small-econ');
      expect(decision.selected_model_id).not.toBe('small-frontier');
      expect(decision.features?.candidates?.length).toBeGreaterThan(0);
    });
  });

  describe('low_intensity tier gate (SP-103)', () => {
    const HARDWARE_CONFIG = {
      min_memory_gb_full: 16,
      min_memory_gb_classification: 8,
      battery_threshold_pct: 20,
    } as const;

    const LOCAL_TEST_CONFIG = {
      lmStudioBaseUrl: 'http://127.0.0.1:1234',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      pingTimeoutMs: 500,
    } as const;

    const READY_FETCH: HttpFetchPort = {
      fetch: vi.fn(async (url: string) => {
        if (url.includes('/v1/models')) {
          return { ok: true, json: async () => ({ data: [{ id: 'local-model' }] }) };
        }
        if (url.includes('/api/tags')) {
          return { ok: true, json: async () => ({ models: [] }) };
        }
        throw new Error('ECONNREFUSED');
      }),
    };

    function makeSystemInfo(overrides?: Partial<SystemInfo>): SystemInfo {
      return {
        totalMemoryGb: 16,
        arch: 'arm64',
        platform: 'darwin',
        batteryLevel: 80,
        isOnAcPower: true,
        ...overrides,
      };
    }

    function makeClusterMatcher(
      result: ClusterMatchResult,
    ): ClusterMatcher {
      return {
        match: vi.fn(async () => result),
      } as unknown as ClusterMatcher;
    }

    it('sets zero-tier hint for high-confidence low_stakes cluster with full_local hardware', async () => {
      const lowStakesFleet: ModelProfile[] = [
        makeModel({ id: 'local-llama', tier: 'zero-tier' }),
        makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
        makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
      ];

      const clusterMatcher = makeClusterMatcher({
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.92,
        margin: 0.12,
        confidence: 'high',
        elapsedMs: 2,
      });

      const pipeline = new RouterPipeline(lowStakesFleet, {
        clusterMatcher,
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: LOCAL_TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
        httpFetchPort: READY_FETCH,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Fix the typo in the README' }),
      );

      expect(decision.features?.tier_hint).toBe('zero-tier');
      expect(decision.features?.tier_hint_reason_code).toBe('cluster_low_stakes_general');
      expect(decision.features?.low_intensity_score).toBeGreaterThanOrEqual(0.65);
      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
    });

    it('leaves tier_hint null for ambiguous prompts in the defer band', async () => {
      const pipeline = new RouterPipeline(fleet, {
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.9,
          low_threshold: 0.1,
        },
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.tier_hint).toBeNull();
      expect(decision.features?.tier_hint_reason_code).toBeNull();
      expect(decision.features?.low_intensity_score).not.toBeNull();
      expect(decision.stage).toBe('fallback');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
    });

    it('attaches tier_hint fields on every routing decision', async () => {
      const clusterMatcher = makeClusterMatcher({
        clusterId: 'architecture',
        tierBias: 'frontier-cloud',
        similarity: 0.9,
        margin: 0.1,
        confidence: 'high',
        elapsedMs: 1,
      });

      const pipeline = new RouterPipeline(fleet, {
        clusterMatcher,
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          low_threshold: 0.55,
        },
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({
          prompt_text: 'Plan the architecture for a distributed payment service with migration strategy',
          turn_type: 'main_loop',
        }),
      );

      expect(decision.features).toMatchObject({
        tier_hint: 'frontier-cloud',
        tier_hint_reason_code: 'cluster_architecture',
        low_intensity_score: expect.any(Number),
      });
      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('frontier-cloud');
    });

    it('constrains HyDRA fleet to economical tier when local is not ready', async () => {
      const requirements: RequirementVector = {
        reasoning: 0.2,
        code_gen: 0.2,
        tool_use: 0.2,
      };
      const hydraMatcher = new HydraMatcher(
        {
          extractRequirements: vi.fn(async () => requirements),
          dispose: vi.fn(async () => {}),
        },
        { artifactCachePath: '.pi-smart-router/models/' },
      );

      const clusterMatcher = makeClusterMatcher({
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.92,
        margin: 0.12,
        confidence: 'high',
        elapsedMs: 1,
      });

      const pipeline = new RouterPipeline(fleet, {
        hydraMatcher,
        clusterMatcher,
        lowIntensityConfig: DEFAULT_OPERATOR_CONFIG.low_intensity,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'what is 2+2 ?' }),
      );

      expect(decision.features?.tier_hint).toBe('economical-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('cluster_low_stakes_general');
      expect(decision.stage).toBe('hydra_match');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
    });

    it('uses structural reason code when cluster confidence is low', async () => {
      const clusterMatcher = makeClusterMatcher({
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.5,
        margin: 0.01,
        confidence: 'none',
        elapsedMs: 1,
      });

      const pipeline = new RouterPipeline(fleet, {
        clusterMatcher,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'what is 2+2 ?' }),
      );

      expect(decision.features?.tier_hint).toBe('economical-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('low_intensity_structural');
    });

    it('routes ambiguous low-stakes Q&A to local_zero when cluster and hardware are ready (SP-111)', async () => {
      const lowStakesFleet: ModelProfile[] = [
        makeModel({ id: 'local-llama', tier: 'zero-tier' }),
        makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
      ];

      const clusterMatcher = makeClusterMatcher({
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.92,
        margin: 0.12,
        confidence: 'high',
        elapsedMs: 2,
      });

      const pipeline = new RouterPipeline(lowStakesFleet, {
        clusterMatcher,
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: LOCAL_TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'what is 2+2 ?' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.features?.local_eligible_reason).toBe('cluster_low_stakes_general');
    });

    it('emits triage_trivial local_eligible_reason for trivial keyword prompts (SP-111)', async () => {
      const lowStakesFleet: ModelProfile[] = [
        makeModel({ id: 'local-llama', tier: 'zero-tier' }),
        makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
      ];

      const pipeline = new RouterPipeline(lowStakesFleet, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: LOCAL_TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.features?.local_eligible_reason).toBe('triage_trivial');
    });

    it('does not route complex prompts to local even when phrasing is short (SP-111)', async () => {
      const pipeline = new RouterPipeline(fleet, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: LOCAL_TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'refactor auth layer' }),
      );

      expect(decision.stage).not.toBe('local_zero');
      expect(decision.tier).not.toBe('zero-tier');
      expect(decision.features?.local_eligible_reason).toBeNull();
    });
  });

  describe('local_zero throughput gate (SP-164)', () => {
    const HARDWARE_CONFIG = {
      min_memory_gb_full: 16,
      min_memory_gb_classification: 8,
      battery_threshold_pct: 20,
    } as const;

    const LOCAL_TEST_CONFIG = {
      lmStudioBaseUrl: 'http://127.0.0.1:1234',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      pingTimeoutMs: 500,
    } as const;

    const READY_FETCH: HttpFetchPort = {
      fetch: vi.fn(async (url: string) => {
        if (url.includes('/v1/models')) {
          return { ok: true, json: async () => ({ data: [{ id: 'local-model' }] }) };
        }
        if (url.includes('/api/tags')) {
          return { ok: true, json: async () => ({ models: [] }) };
        }
        throw new Error('ECONNREFUSED');
      }),
    };

    function makeSystemInfo(overrides?: Partial<SystemInfo>): SystemInfo {
      return {
        totalMemoryGb: 16,
        arch: 'arm64',
        platform: 'darwin',
        batteryLevel: 80,
        isOnAcPower: true,
        ...overrides,
      };
    }

    function makeThroughputMeter(aboveThreshold: boolean): ThroughputMeter {
      return {
        recordSample: vi.fn(),
        getMedianTps: vi.fn(() => (aboveThreshold ? 30 : 10)),
        isAboveThreshold: vi.fn(() => aboveThreshold),
        getSampleCount: vi.fn(() => 1),
        clear: vi.fn(),
      };
    }

    const localReadyFleet: ModelProfile[] = [
      makeModel({ id: 'local-llama', tier: 'zero-tier' }),
      makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
    ];

    const localReadyOptions = {
      hardwareConfig: HARDWARE_CONFIG,
      localConfig: LOCAL_TEST_CONFIG,
      systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
      httpFetchPort: READY_FETCH,
    };

    it('dispatches local_zero when throughput meter is above threshold', async () => {
      const pipeline = new RouterPipeline(localReadyFleet, {
        ...localReadyOptions,
        throughputMeter: makeThroughputMeter(true),
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.reason_code).toBe('local_model_ready');
    });

    it('falls through to economical cloud when throughput is below threshold', async () => {
      const pipeline = new RouterPipeline(localReadyFleet, {
        ...localReadyOptions,
        throughputMeter: makeThroughputMeter(false),
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.reason_code).toBe(THROUGHPUT_BELOW_THRESHOLD);
      expect(decision.features?.local_eligible_reason).toBe('triage_trivial');
      expect(decision.features?.tier_selection?.local_zero_skip_reasons).toContain(
        THROUGHPUT_BELOW_THRESHOLD,
      );
    });

    it('preserves local_zero routing when throughput meter is not configured', async () => {
      const pipeline = new RouterPipeline(localReadyFleet, localReadyOptions);

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
    });
  });

  describe('resolveLocalEligible (SP-111)', () => {
    const highThreshold = DEFAULT_OPERATOR_CONFIG.low_intensity.high_threshold;

    it('prefers triage_trivial over cluster and low-intensity signals', () => {
      const result = resolveLocalEligible({
        triageVerdict: 'trivial',
        tierHint: 'zero-tier',
        lowIntensityScore: 0.9,
        highThreshold,
        clusterMatch: {
          clusterId: 'low_stakes_general',
          tierBias: 'zero-tier',
          similarity: 0.9,
          margin: 0.1,
          confidence: 'high',
          elapsedMs: 1,
        },
      });

      expect(result).toEqual({ eligible: true, reason: 'triage_trivial' });
    });

    it('uses cluster reason when high-confidence zero-tier cluster matches', () => {
      const result = resolveLocalEligible({
        triageVerdict: 'ambiguous',
        tierHint: 'zero-tier',
        lowIntensityScore: 0.7,
        highThreshold,
        clusterMatch: {
          clusterId: 'mechanical_edit',
          tierBias: 'zero-tier',
          similarity: 0.9,
          margin: 0.1,
          confidence: 'high',
          elapsedMs: 1,
        },
      });

      expect(result).toEqual({ eligible: true, reason: 'cluster_mechanical_edit' });
    });

    it('uses low_intensity_structural when only structural gate qualifies', () => {
      const result = resolveLocalEligible({
        triageVerdict: 'ambiguous',
        tierHint: 'zero-tier',
        lowIntensityScore: 0.7,
        highThreshold,
        clusterMatch: null,
      });

      expect(result).toEqual({ eligible: true, reason: 'low_intensity_structural' });
    });

    it('rejects when no eligibility signal is present', () => {
      const result = resolveLocalEligible({
        triageVerdict: 'complex',
        tierHint: 'frontier-cloud',
        lowIntensityScore: 0.2,
        highThreshold,
        clusterMatch: null,
      });

      expect(result).toEqual({ eligible: false, reason: null });
    });
  });

  describe('estimateCheapToolUseRequirement (SP-177)', () => {
    it('returns 0 for true trivial format/lint prompts', () => {
      expect(estimateCheapToolUseRequirement('Format this JSON file')).toBe(0);
      expect(estimateCheapToolUseRequirement('Lint the source file')).toBe(0);
    });

    it('scores agentic git/bash/edit/explore/delete/repo cues above local ceiling', () => {
      const predicted = estimateCheapToolUseRequirement(
        'run git status then explore the repo with bash and delete the bad files',
      );
      expect(predicted).toBeGreaterThan(0.25);
      expect(
        resolveLocalZeroToolUseCeiling(0.1, 0.25),
      ).toBe(0.1);
      expect(predicted).toBeGreaterThan(resolveLocalZeroToolUseCeiling(0.1, 0.25));
    });
  });

  describe('P(success) online inference (SP-105)', () => {
    function makeClusterMatcher(
      result: ClusterMatchResult,
    ): ClusterMatcher {
      return {
        match: vi.fn(async () => result),
      } as unknown as ClusterMatcher;
    }

    function makeHighPWeights(): PSuccessWeights {
      return {
        version: 1,
        min_training_samples: 30,
        feature_names: P_SUCCESS_FEATURE_NAMES,
        intercept: 6,
        coefficients: P_SUCCESS_FEATURE_NAMES.map(() => 0),
        trained_sample_count: 50,
      };
    }

    function makeLowPWeights(): PSuccessWeights {
      return {
        version: 1,
        min_training_samples: 30,
        feature_names: P_SUCCESS_FEATURE_NAMES,
        intercept: -6,
        coefficients: P_SUCCESS_FEATURE_NAMES.map(() => 0),
        trained_sample_count: 50,
      };
    }

    it('records P_success when trained weights are available', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: makeHighPWeights(),
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.9,
          low_threshold: 0.1,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_cheap).toBeGreaterThanOrEqual(0.5);
      expect(decision.features?.p_success_alpha).toBe(0.5);
      expect(decision.features?.tier_hint_reason_code).toMatch(/^expected_cost_/);
    });

    it('routes frontier when P_success is below alpha and structural score is low', async () => {
      const clusterMatcher = makeClusterMatcher({
        clusterId: 'architecture',
        tierBias: 'frontier-cloud',
        similarity: 0.9,
        margin: 0.1,
        confidence: 'high',
        elapsedMs: 1,
      });

      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: makeLowPWeights(),
        clusterMatcher,
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          low_threshold: 0.55,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({
          prompt_text:
            'Plan the architecture for a distributed payment service with migration strategy',
          turn_type: 'main_loop',
        }),
      );

      expect(decision.features?.p_success_cheap).toBeLessThan(0.5);
      expect(decision.features?.tier_hint).toBe('frontier-cloud');
      expect(decision.stage).toBe('triage');
    });

    it('biases frontier when P_success is low and expected cost favors frontier', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: makeLowPWeights(),
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.1,
          low_threshold: 0.05,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_cheap).toBeLessThan(0.5);
      expect(decision.features?.tier_hint).toBe('frontier-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('expected_cost_frontier_cloud');
    });

    it('falls back to structural scoring when weights artifact is untrained', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeightsPath: '/nonexistent/p-success-weights.json',
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.9,
          low_threshold: 0.1,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_cheap).toBe(0.5);
      expect(decision.features?.tier_hint).toBeNull();
      expect(decision.features?.tier_hint_reason_code).toBeNull();
    });

    it('loads shipped dogfood weights and exposes raw vs used P(success) (SP-175)', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeightsPath: 'config/p-success-weights.json',
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.9,
          low_threshold: 0.1,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_raw).not.toBeNull();
      expect(decision.features?.p_success_calibrated).not.toBeNull();
      expect(decision.features?.p_success_cheap).not.toBeNull();
      expect(decision.features?.p_success_cheap).not.toBe(0.5);
      expect(decision.features?.p_success_cheap).toBe(decision.features?.p_success_calibrated);
      expect(decision.features?.p_success_raw).toBe(decision.features?.p_success_calibrated);
      expect(decision.features?.tier_hint_reason_code).toMatch(/^expected_cost_/);
    });
  });

  describe('isotonic P(success) calibration (SP-133)', () => {
    const pricedFleet: ModelProfile[] = [
      makeModel({
        id: 'econ-priced',
        tier: 'economical-cloud',
        pricing: { fallback_cost_per_1m: 0.5 },
      }),
      makeModel({
        id: 'frontier-priced',
        tier: 'frontier-cloud',
        pricing: { fallback_cost_per_1m: 3.0 },
      }),
    ];

    function makeLowPWeights(): PSuccessWeights {
      return {
        version: 1,
        min_training_samples: 30,
        feature_names: P_SUCCESS_FEATURE_NAMES,
        intercept: -6,
        coefficients: P_SUCCESS_FEATURE_NAMES.map(() => 0),
        trained_sample_count: 50,
      };
    }

    function makeBoostingCalibrator(): IsotonicCalibratorArtifact {
      return {
        version: 1,
        min_training_samples: 30,
        x_knots: [0, 0.5, 1],
        y_knots: [0.99, 0.99, 0.99],
        trained_sample_count: 40,
        holdout_ece_raw: 0.1,
        holdout_ece_calibrated: 0.05,
      };
    }

    it('uses calibrated score for gate thresholding and exposes raw + calibrated telemetry', async () => {
      const pipeline = new RouterPipeline(pricedFleet, {
        pSuccessWeights: makeLowPWeights(),
        isotonicCalibrator: makeBoostingCalibrator(),
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.1,
          low_threshold: 0.05,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_raw).toBeLessThan(0.5);
      expect(decision.features?.p_success_calibrated).toBeGreaterThanOrEqual(0.5);
      expect(decision.features?.p_success_cheap).toBe(decision.features?.p_success_calibrated);
      expect(decision.features?.tier_hint).toBe('economical-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('expected_cost_economical_cloud');
    });

    it('falls back to raw logistic when calibrator artifact is missing', async () => {
      const pipeline = new RouterPipeline(pricedFleet, {
        pSuccessWeights: makeLowPWeights(),
        isotonicCalibrator: null,
        routingCalibrationPath: '/nonexistent/routing-calibration.json',
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.1,
          low_threshold: 0.05,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_raw).toBeLessThan(0.5);
      expect(decision.features?.p_success_calibrated).toBe(decision.features?.p_success_raw);
      expect(decision.features?.p_success_cheap).toBe(decision.features?.p_success_raw);
      expect(decision.features?.tier_hint).toBe('frontier-cloud');
    });
  });

  describe('expected-cost tier selection (SP-106)', () => {
    const pricedFleet: ModelProfile[] = [
      makeModel({
        id: 'econ-priced',
        tier: 'economical-cloud',
        pricing: { fallback_cost_per_1m: 0.5 },
      }),
      makeModel({
        id: 'frontier-priced',
        tier: 'frontier-cloud',
        pricing: { fallback_cost_per_1m: 3.0 },
      }),
    ];

    function makeHighPWeights(): PSuccessWeights {
      return {
        version: 1,
        min_training_samples: 30,
        feature_names: P_SUCCESS_FEATURE_NAMES,
        intercept: 6,
        coefficients: P_SUCCESS_FEATURE_NAMES.map(() => 0),
        trained_sample_count: 50,
      };
    }

    function makeLowPWeights(): PSuccessWeights {
      return {
        version: 1,
        min_training_samples: 30,
        feature_names: P_SUCCESS_FEATURE_NAMES,
        intercept: -6,
        coefficients: P_SUCCESS_FEATURE_NAMES.map(() => 0),
        trained_sample_count: 50,
      };
    }

    it('selects economical tier when P is high and price delta is significant', async () => {
      const pipeline = new RouterPipeline(pricedFleet, {
        pSuccessWeights: makeHighPWeights(),
        lowIntensityConfig: DEFAULT_OPERATOR_CONFIG.low_intensity,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.tier_hint).toBe('economical-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('expected_cost_economical_cloud');
      expect(
        decision.features?.candidates?.some(
          (candidate) => candidate.model_id === '__expected_cost_economical-cloud__',
        ),
      ).toBe(true);
    });

    it('selects frontier when P is low even if economical per-token cost is lower', async () => {
      const pipeline = new RouterPipeline(pricedFleet, {
        pSuccessWeights: makeLowPWeights(),
        lowIntensityConfig: DEFAULT_OPERATOR_CONFIG.low_intensity,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.tier_hint).toBe('frontier-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('expected_cost_frontier_cloud');
    });
  });
});
