// Extracted from tests/unit/router-pipeline.test.ts in SP-277 (wave 1, #155).
// Aligned with src/domain/pipeline/session-pin-stage.ts (session pin + loop escalation stages).
import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import { extractToolFailureSignature } from '../../src/domain/pinning/loop-escalation.js';
import { DEFAULT_PLANNING_DELEGATE_CONFIG, DEFAULT_SAAR_CONFIG } from '../../src/domain/types/schemas.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import { makeModel, makeRequest } from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
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
          ...DEFAULT_PLANNING_DELEGATE_CONFIG,
          enabled: false,
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
          ...DEFAULT_PLANNING_DELEGATE_CONFIG,
          enabled: false,
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
});
