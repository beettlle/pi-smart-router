import { describe, expect, it, vi } from 'vitest';

import {
  HydraMatcher,
  type EmbeddingProvider,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import { extractToolFailureSignature } from '../../src/domain/pinning/loop-escalation.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

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
      makeModel({ id: 'econ-a', tier: 'economical-cloud', provider: 'anthropic' }),
      makeModel({ id: 'frontier-a', tier: 'frontier-cloud', provider: 'anthropic' }),
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

    it('sub-route decisions do not re-persist the pin', async () => {
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

    it('planning turn with economical pin routes frontier via turn_envelope (SP-064)', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'econ-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });
      const decision = await pipeline.route(makeRequest({ turn_type: 'planning' }));

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('turn_planning');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.selected_model_id).toBe('frontier-a');
      expect(pinner.getPin('sess-1')!.pinned_model_id).toBe('econ-a');
    });

    it('tool_result turn with frontier pin routes economical via turn_envelope (SP-064)', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'frontier-a', 'initial');

      const pipeline = new RouterPipeline(pinFleet, { sessionPinner: pinner });
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
  });

  describe('loop escalation integration (FR-014, Step 3b)', () => {
    // Use different providers so FR-024 sub-routing does not interfere
    // with escalation verification (sub-routing requires same provider).
    const escalationFleet: ModelProfile[] = [
      makeModel({ id: 'econ-a', tier: 'economical-cloud', provider: 'openai' }),
      makeModel({ id: 'frontier-a', tier: 'frontier-cloud', provider: 'anthropic' }),
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
      const pipeline = new RouterPipeline(fleet);
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
      const pipeline = new RouterPipeline(fleet, { hydraMatcher });
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
});
