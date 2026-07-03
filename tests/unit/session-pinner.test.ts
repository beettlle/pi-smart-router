import { describe, expect, it } from 'vitest';

import {
  SessionPinner,
  type PinLookupResult,
} from '../../src/domain/pinning/session-pinner.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'openai',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-001',
    session_id: 'sess-1',
    prompt_text: 'Hello world',
    ...overrides,
  };
}

const frontier = makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' });
const econAnthro = makeModel({ id: 'claude-haiku', tier: 'economical-cloud', provider: 'anthropic' });
const econOpenai = makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' });
const frontierOpenai = makeModel({ id: 'gpt-4o', tier: 'frontier-cloud', provider: 'openai' });

const fleet: ModelProfile[] = [frontier, econAnthro, econOpenai, frontierOpenai];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SessionPinner', () => {
  describe('lookupPin — no existing pin', () => {
    it('returns no_pin when no pin exists for the session', () => {
      const pinner = new SessionPinner();
      const result = pinner.lookupPin(makeRequest(), fleet);

      expect(result.action).toBe('no_pin');
      expect(result.pinnedModel).toBeUndefined();
      expect(result.subRouteModel).toBeUndefined();
      expect(result.breakReason).toBeUndefined();
    });
  });

  describe('lookupPin — use_pin', () => {
    it('returns use_pin when a valid pin exists and model is healthy', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(makeRequest(), fleet);

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('returns use_pin for non-tool-result turns regardless of payload size', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ turn_type: 'planning' }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('returns no_pin and removes pin when pinned model is unhealthy', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'dead-model', 'initial');

      const fleetWithDead = [
        ...fleet,
        makeModel({ id: 'dead-model', tier: 'frontier-cloud', healthy: false }),
      ];
      const result = pinner.lookupPin(makeRequest(), fleetWithDead);

      expect(result.action).toBe('no_pin');
      expect(pinner.getPin('sess-1')).toBeNull();
    });

    it('returns no_pin and removes pin when pinned model is not in fleet', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'removed-model', 'initial');

      const result = pinner.lookupPin(makeRequest(), fleet);

      expect(result.action).toBe('no_pin');
      expect(pinner.getPin('sess-1')).toBeNull();
    });
  });

  describe('lookupPin — break rules (FR-008)', () => {
    it('breaks pin on history compaction', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ compaction_flag: true }),
        fleet,
      );

      expect(result.action).toBe('break');
      expect(result.breakReason).toBe('compaction');
      expect(pinner.getPin('sess-1')).toBeNull();
    });

    it('applies force_model_id override to a healthy model', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ force_model_id: 'gpt-4o' }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('gpt-4o');
      expect(pinner.getPin('sess-1')?.pinned_model_id).toBe('gpt-4o');
      expect(pinner.getPin('sess-1')?.pin_reason).toBe('user_forced');
    });

    it('breaks pin when force_model_id target is unhealthy', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const fleetWithUnhealthy = [
        ...fleet,
        makeModel({ id: 'sick-model', tier: 'frontier-cloud', healthy: false }),
      ];
      const result = pinner.lookupPin(
        makeRequest({ force_model_id: 'sick-model' }),
        fleetWithUnhealthy,
      );

      expect(result.action).toBe('break');
      expect(result.breakReason).toBe('user_forced');
      expect(pinner.getPin('sess-1')).toBeNull();
    });

    it('breaks pin when force_model_id target is not in fleet', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ force_model_id: 'nonexistent' }),
        fleet,
      );

      expect(result.action).toBe('break');
      expect(result.breakReason).toBe('user_forced');
    });

    it('compaction break takes priority over force override', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ compaction_flag: true, force_model_id: 'gpt-4o' }),
        fleet,
      );

      expect(result.action).toBe('break');
      expect(result.breakReason).toBe('compaction');
    });
  });

  describe('lookupPin — sub-routing (FR-024)', () => {
    it('sub-routes tool_result below threshold to same-provider economical model', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'tool_result',
          prompt_text: 'ok',
          estimated_input_tokens: 100,
        }),
        fleet,
      );

      expect(result.action).toBe('sub_route');
      expect(result.subRouteModel?.id).toBe('claude-haiku');
      expect(result.subRouteModel?.provider).toBe('anthropic');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('does not sub-route when payload exceeds threshold', () => {
      const pinner = new SessionPinner({ toolResultSizeThreshold: 500 });
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'tool_result',
          estimated_input_tokens: 1000,
        }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('does not sub-route when no same-provider economical model exists', () => {
      const pinner = new SessionPinner();
      const isolatedFleet = [
        makeModel({ id: 'only-frontier', tier: 'frontier-cloud', provider: 'solo-provider' }),
      ];
      pinner.recordPin('sess-1', 'only-frontier', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'tool_result',
          estimated_input_tokens: 50,
        }),
        isolatedFleet,
      );

      expect(result.action).toBe('use_pin');
    });

    it('does not sub-route for non-tool-result turns', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ turn_type: 'planning', estimated_input_tokens: 10 }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
    });

    it('uses prompt_text length when estimated_input_tokens is absent', () => {
      const pinner = new SessionPinner({ toolResultSizeThreshold: 10 });
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'tool_result',
          prompt_text: 'a'.repeat(20),
        }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
    });

    it('skips unhealthy same-provider economical models', () => {
      const pinner = new SessionPinner();
      const fleetWithSickEcon = [
        frontier,
        makeModel({ id: 'haiku-sick', tier: 'economical-cloud', provider: 'anthropic', healthy: false }),
      ];
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        fleetWithSickEcon,
      );

      expect(result.action).toBe('use_pin');
    });

    it('does not sub-route to the same model as the pin', () => {
      const pinner = new SessionPinner();
      const singleEconFleet = [
        makeModel({ id: 'econ-only', tier: 'economical-cloud', provider: 'test' }),
      ];
      pinner.recordPin('sess-1', 'econ-only', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        singleEconFleet,
      );

      expect(result.action).toBe('use_pin');
    });

    it('uses default 2048 threshold when none configured', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const belowThreshold = pinner.lookupPin(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 2000 }),
        fleet,
      );
      expect(belowThreshold.action).toBe('sub_route');

      const aboveThreshold = pinner.lookupPin(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 2100 }),
        fleet,
      );
      expect(aboveThreshold.action).toBe('use_pin');
    });
  });

  describe('recordPin', () => {
    it('creates a new pin with initial values', () => {
      const pinner = new SessionPinner();
      const pin = pinner.recordPin('sess-1', 'claude-opus', 'initial');

      expect(pin.session_id).toBe('sess-1');
      expect(pin.pinned_model_id).toBe('claude-opus');
      expect(pin.pin_reason).toBe('initial');
      expect(pin.has_ever_switched).toBe(false);
      expect(pin.consecutive_upstream_errors).toBe(0);
      expect(pin.consecutive_tool_failures).toBe(0);
      expect(pin.last_tool_failure_signature).toBeNull();
      expect(pin.created_at).toBeTruthy();
      expect(pin.updated_at).toBeTruthy();
    });

    it('sets has_ever_switched when model changes', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');
      const pin = pinner.recordPin('sess-1', 'gpt-4o', 'user_forced');

      expect(pin.has_ever_switched).toBe(true);
      expect(pin.pinned_model_id).toBe('gpt-4o');
    });

    it('preserves has_ever_switched once set', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');
      pinner.recordPin('sess-1', 'gpt-4o', 'user_forced');
      const pin = pinner.recordPin('sess-1', 'gpt-4o', 'initial');

      expect(pin.has_ever_switched).toBe(true);
    });

    it('preserves created_at across updates', () => {
      const pinner = new SessionPinner();
      const first = pinner.recordPin('sess-1', 'claude-opus', 'initial');
      const second = pinner.recordPin('sess-1', 'gpt-4o', 'user_forced');

      expect(second.created_at).toBe(first.created_at);
    });

    it('preserves consecutive_tool_failures from existing pin', () => {
      const pinner = new SessionPinner();
      pinner.loadPin({
        session_id: 'sess-1',
        pinned_model_id: 'claude-opus',
        pin_reason: 'initial',
        has_ever_switched: false,
        consecutive_upstream_errors: 0,
        consecutive_tool_failures: 3,
        last_tool_failure_signature: 'ENOENT',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      });

      const pin = pinner.recordPin('sess-1', 'gpt-4o', 'loop_escalation');
      expect(pin.consecutive_tool_failures).toBe(3);
      expect(pin.last_tool_failure_signature).toBe('ENOENT');
    });
  });

  describe('breakPin', () => {
    it('deletes the pin for the session', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');
      expect(pinner.getPin('sess-1')).not.toBeNull();

      pinner.breakPin('sess-1');
      expect(pinner.getPin('sess-1')).toBeNull();
    });

    it('does not throw when breaking a non-existent pin', () => {
      const pinner = new SessionPinner();
      expect(() => pinner.breakPin('no-such-session')).not.toThrow();
    });
  });

  describe('loadPin / getPin', () => {
    it('round-trips a loaded pin', () => {
      const pinner = new SessionPinner();
      const pinData = {
        session_id: 'sess-hydrate',
        pinned_model_id: 'claude-opus',
        pin_reason: 'initial' as const,
        has_ever_switched: true,
        consecutive_upstream_errors: 2,
        consecutive_tool_failures: 1,
        last_tool_failure_signature: 'timeout',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T12:00:00.000Z',
      };

      pinner.loadPin(pinData);
      const retrieved = pinner.getPin('sess-hydrate');

      expect(retrieved).toEqual(pinData);
    });

    it('getPin returns null for unknown session', () => {
      const pinner = new SessionPinner();
      expect(pinner.getPin('unknown')).toBeNull();
    });

    it('loaded pin is usable by lookupPin', () => {
      const pinner = new SessionPinner();
      pinner.loadPin({
        session_id: 'sess-1',
        pinned_model_id: 'claude-opus',
        pin_reason: 'initial',
        has_ever_switched: false,
        consecutive_upstream_errors: 0,
        consecutive_tool_failures: 0,
        last_tool_failure_signature: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      });

      const result = pinner.lookupPin(makeRequest(), fleet);
      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });
  });

  describe('session isolation', () => {
    it('pins are independent per session', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-a', 'claude-opus', 'initial');
      pinner.recordPin('sess-b', 'gpt-4o', 'initial');

      const resultA = pinner.lookupPin(makeRequest({ session_id: 'sess-a' }), fleet);
      const resultB = pinner.lookupPin(makeRequest({ session_id: 'sess-b' }), fleet);

      expect(resultA.pinnedModel?.id).toBe('claude-opus');
      expect(resultB.pinnedModel?.id).toBe('gpt-4o');
    });

    it('breaking one session does not affect another', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-a', 'claude-opus', 'initial');
      pinner.recordPin('sess-b', 'gpt-4o', 'initial');

      pinner.breakPin('sess-a');

      expect(pinner.getPin('sess-a')).toBeNull();
      expect(pinner.getPin('sess-b')).not.toBeNull();
    });
  });

  describe('performance', () => {
    it('lookupPin completes in <1ms (completion criteria)', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const iterations = 10_000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        pinner.lookupPin(makeRequest(), fleet);
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / iterations;

      expect(perCall).toBeLessThan(1);
    });

    it('lookupPin with sub-routing completes in <1ms', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const req = makeRequest({
        turn_type: 'tool_result',
        estimated_input_tokens: 100,
      });

      const iterations = 10_000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        pinner.lookupPin(req, fleet);
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / iterations;

      expect(perCall).toBeLessThan(1);
    });
  });
});
