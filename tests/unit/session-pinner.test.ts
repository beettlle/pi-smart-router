import { describe, expect, it } from 'vitest';

import {
  SessionPinner,
} from '../../src/domain/pinning/session-pinner.js';
import {
  evaluateCacheEconomics,
  type CacheEconomicsConfig,
} from '../../src/domain/pinning/cache-economics.js';
import type { ModelProfile, RoutingRequest, SessionPin } from '../../src/domain/types/index.js';
import { DEFAULT_SAAR_CONFIG } from '../../src/domain/types/schemas.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import { SqliteStore } from '../../src/infrastructure/persistence/sqlite-store.js';

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

const frontier = makeModel({
  id: 'claude-opus',
  tier: 'frontier-cloud',
  provider: 'anthropic',
  pricing: { fallback_cost_per_1m: 15.0 },
});
const econAnthro = makeModel({
  id: 'claude-haiku',
  tier: 'economical-cloud',
  provider: 'anthropic',
  pricing: { fallback_cost_per_1m: 1.0 },
});
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

    it('breaks pin when estimated tokens exceed pinned model context window', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const limitedFleet = [
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          limits: { max_input_tokens: 100_000 },
        }),
      ];

      const withinLimit = pinner.lookupPin(
        makeRequest({ estimated_input_tokens: 90_000 }),
        limitedFleet,
      );
      expect(withinLimit.action).toBe('use_pin');

      pinner.recordPin('sess-1', 'claude-opus', 'initial');
      const overLimit = pinner.lookupPin(
        makeRequest({ estimated_input_tokens: 90_001 }),
        limitedFleet,
      );

      expect(overLimit.action).toBe('break');
      expect(overLimit.breakReason).toBe('context_overflow');
      expect(pinner.getPin('sess-1')).toBeNull();
    });

    it('compaction break takes priority over context overflow', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const limitedFleet = [
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          limits: { max_input_tokens: 100_000 },
        }),
      ];

      const result = pinner.lookupPin(
        makeRequest({
          compaction_flag: true,
          estimated_input_tokens: 200_000,
        }),
        limitedFleet,
      );

      expect(result.action).toBe('break');
      expect(result.breakReason).toBe('compaction');
    });

    it('does not break on overflow when pinned model has no max_input_tokens', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ estimated_input_tokens: 1_000_000 }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('respects custom contextOverflowSafetyMargin', () => {
      const pinner = new SessionPinner({ contextOverflowSafetyMargin: 0.5 });
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const limitedFleet = [
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          limits: { max_input_tokens: 100_000 },
        }),
      ];

      const result = pinner.lookupPin(
        makeRequest({ estimated_input_tokens: 50_001 }),
        limitedFleet,
      );

      expect(result.action).toBe('break');
      expect(result.breakReason).toBe('context_overflow');
    });

    it('keeps pin when cross-provider switch fails cache economics (FR-008 rule #4)', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const marginalFleet = [
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
        makeModel({
          id: 'marginal',
          tier: 'economical-cloud',
          provider: 'other',
          pricing: { fallback_cost_per_1m: 14.5 },
        }),
      ];

      const result = pinner.lookupPin(
        makeRequest({
          candidate_model_id: 'marginal',
          estimated_input_tokens: 1_000,
        }),
        marginalFleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
      expect(pinner.getPin('sess-1')?.pinned_model_id).toBe('claude-opus');
    });

    it('breaks pin when cross-provider switch is justified by cache economics', () => {
      const pinner = new SessionPinner({
        cacheEconomicsConfig: { projectedRemainingTurns: 10 },
      });
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const econFleet = [
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
        makeModel({
          id: 'gpt-4o-mini',
          tier: 'economical-cloud',
          provider: 'openai',
          pricing: { fallback_cost_per_1m: 0.15 },
        }),
      ];

      const result = pinner.lookupPin(
        makeRequest({
          candidate_model_id: 'gpt-4o-mini',
          estimated_input_tokens: 100_000,
        }),
        econFleet,
      );

      expect(result.action).toBe('break');
      expect(result.breakReason).toBe('cache_economics');
      expect(pinner.getPin('sess-1')).toBeNull();
    });

    it('ignores cache economics for same-provider candidate_model_id', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ candidate_model_id: 'claude-haiku' }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
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

    it('blocks sub-route when cache breakeven fails on warm prefix (SP-125)', () => {
      const pinner = new SessionPinner();
      const warmFleet = [
        makeModel({
          id: 'claude-opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 30.0 },
        }),
        makeModel({
          id: 'claude-haiku',
          tier: 'economical-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 30.0 },
        }),
      ];
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'tool_result',
          estimated_input_tokens: 100_000,
        }),
        warmFleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
      expect(result.subRouteModel).toBeUndefined();
    });

    it('allows sub-route when cache breakeven passes on cold prefix (SP-125)', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'tool_result',
          estimated_input_tokens: 100,
        }),
        fleet,
      );

      expect(result.action).toBe('sub_route');
      expect(result.subRouteModel?.id).toBe('claude-haiku');
    });
  });

  describe('lookupPin — pin_only_fallback (SP-161)', () => {
    it('returns use_pin instead of sub_route when pinOnlyFallback is enabled', () => {
      const pinner = new SessionPinner({ pinOnlyFallback: true });
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'tool_result',
          estimated_input_tokens: 100,
        }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('still honors compaction break when pinOnlyFallback is enabled', () => {
      const pinner = new SessionPinner({ pinOnlyFallback: true });
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({ compaction_flag: true }),
        fleet,
      );

      expect(result.action).toBe('break');
      expect(result.breakReason).toBe('compaction');
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

  // ─── FR-007 negative tests ──────────────────────────────────────────────────

  describe('FR-007: MUST NOT re-optimize on every turn', () => {
    it('pin hit returns use_pin without re-evaluating fleet cost', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const cheaperModel = makeModel({
        id: 'super-cheap',
        tier: 'economical-cloud',
        provider: 'budget-co',
        pricing: { fallback_cost_per_1m: 0.01 },
      });
      const fleetWithCheap = [...fleet, cheaperModel];

      const result = pinner.lookupPin(
        makeRequest({ turn_type: 'planning' }),
        fleetWithCheap,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('consecutive turns on same session always return pinned model', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      for (let i = 0; i < 10; i++) {
        const result = pinner.lookupPin(
          makeRequest({ request_id: `req-${i}`, turn_type: 'main_loop' }),
          fleet,
        );
        expect(result.action).toBe('use_pin');
        expect(result.pinnedModel?.id).toBe('claude-opus');
      }
    });

    it('pin holds even when a different tier would be cheaper for the prompt', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const trivialRequest = makeRequest({
        prompt_text: 'Format this JSON',
        turn_type: 'main_loop',
      });

      const result = pinner.lookupPin(trivialRequest, fleet);

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('pin is NOT broken by provider cost difference alone', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'gpt-4o', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'planning',
          estimated_input_tokens: 50_000,
        }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('gpt-4o');
      expect(result.breakReason).toBeUndefined();
    });

    it('sub-routing does not change the session pin record', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-opus', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'tool_result',
          estimated_input_tokens: 100,
        }),
        fleet,
      );

      expect(result.action).toBe('sub_route');

      const pin = pinner.getPin('sess-1');
      expect(pin?.pinned_model_id).toBe('claude-opus');
      expect(pin?.pin_reason).toBe('initial');
    });
  });

  // ─── Cross-process pin load / hydrate ──────────────────────────────────────

  describe('cross-process pin read', () => {
    it('loaded pin from another process is usable for routing', () => {
      const pinner = new SessionPinner();
      const externalPin: SessionPin = {
        session_id: 'sess-cross-proc',
        pinned_model_id: 'gpt-4o',
        pin_reason: 'initial',
        has_ever_switched: false,
        consecutive_upstream_errors: 0,
        consecutive_tool_failures: 0,
        last_tool_failure_signature: null,
        created_at: '2026-06-30T00:00:00.000Z',
        updated_at: '2026-06-30T12:00:00.000Z',
      };

      pinner.loadPin(externalPin);
      const result = pinner.lookupPin(
        makeRequest({ session_id: 'sess-cross-proc' }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('gpt-4o');
    });

    it('loaded pin preserves all metadata fields', () => {
      const pinner = new SessionPinner();
      const externalPin: SessionPin = {
        session_id: 'sess-meta',
        pinned_model_id: 'claude-opus',
        pin_reason: 'loop_escalation',
        has_ever_switched: true,
        consecutive_upstream_errors: 5,
        consecutive_tool_failures: 2,
        last_tool_failure_signature: 'TIMEOUT',
        created_at: '2026-06-28T10:00:00.000Z',
        updated_at: '2026-06-28T18:00:00.000Z',
      };

      pinner.loadPin(externalPin);
      const retrieved = pinner.getPin('sess-meta');

      expect(retrieved).toEqual(externalPin);
    });
  });

  describe('StorePort persistence (SP-054)', () => {
    it('works without store (in-memory only)', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-mem', 'claude-opus', 'initial');

      expect(pinner.getPin('sess-mem')?.pinned_model_id).toBe('claude-opus');
    });

    it('persists recordPin to StorePort', async () => {
      const store = new MemoryStore();
      const pinner = new SessionPinner({ store });

      pinner.recordPin('sess-persist', 'claude-opus', 'initial');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const stored = await store.getSessionPin('sess-persist');
      expect(stored?.pinned_model_id).toBe('claude-opus');
      expect(stored?.pin_reason).toBe('initial');
    });

    it('restoreSessionPin hydrates in-memory state after simulated restart', async () => {
      const store = new MemoryStore();
      const original = new SessionPinner({ store });
      original.recordPin('sess-reload', 'gpt-4o', 'initial');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const reloaded = new SessionPinner({ store });
      expect(reloaded.getPin('sess-reload')).toBeNull();

      await reloaded.restoreSessionPin('sess-reload');
      const result = reloaded.lookupPin(
        makeRequest({ session_id: 'sess-reload' }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('gpt-4o');
    });

    it('breakPin removes pin from StorePort', async () => {
      const store = new MemoryStore();
      const pinner = new SessionPinner({ store });
      pinner.recordPin('sess-break', 'claude-opus', 'initial');
      await new Promise((resolve) => setTimeout(resolve, 0));

      pinner.breakPin('sess-break');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(await store.getSessionPin('sess-break')).toBeNull();
    });

    it('persists context_overflow pin_reason to SQLite', async () => {
      const sqliteStore = new SqliteStore({ dbPath: ':memory:', models: fleet });
      const pinner = new SessionPinner({ store: sqliteStore });

      pinner.recordPin('sess-overflow', 'claude-opus', 'context_overflow');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const stored = await sqliteStore.getSessionPin('sess-overflow');
      expect(stored?.pin_reason).toBe('context_overflow');
      sqliteStore.close();
    });
  });
});

// ─── SAAR pin policy (SP-122) ───────────────────────────────────────────────

describe('SessionPinner SAAR policy', () => {
  const saarConfig = {
    ...DEFAULT_SAAR_CONFIG,
    planning_turn_buffer: 2,
    idle_timeout_seconds: 300,
  };

  const BASE_TIME = Date.parse('2026-07-08T12:00:00.000Z');

  describe('buffer window (turns 0–1 with buffer=2)', () => {
    it('allows capability-gated frontier without pin overwrite', () => {
      const pinner = new SessionPinner({ saarConfig });
      pinner.recordPin('sess-1', 'claude-haiku', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'planning',
          candidate_model_id: 'claude-opus',
        }),
        fleet,
      );

      expect(result.action).toBe('saar_route');
      expect(result.saarReason).toBe('saar_buffer_active');
      expect(result.saarRouteModel?.id).toBe('claude-opus');
      expect(result.pinnedModel?.id).toBe('claude-haiku');
      expect(pinner.getPin('sess-1')?.pinned_model_id).toBe('claude-haiku');
    });

    it('exits buffer after recordSaarTurn reaches planning_turn_buffer', () => {
      const pinner = new SessionPinner({ saarConfig });
      pinner.recordPin('sess-1', 'claude-haiku', 'initial');

      pinner.recordSaarTurn('sess-1');
      pinner.recordSaarTurn('sess-1');

      expect(pinner.getSaarState('sess-1')?.hard_lock).toBe(true);
      expect(pinner.getSaarState('sess-1')?.turn_index).toBe(2);

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'planning',
          candidate_model_id: 'claude-opus',
        }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.saarReason).toBe('saar_hard_lock');
      expect(result.pinnedModel?.id).toBe('claude-haiku');
    });
  });

  describe('hard-lock during tool loop', () => {
    it('allows tier upgrade during active tool loop', () => {
      const pinner = new SessionPinner({ saarConfig });
      pinner.recordPin('sess-1', 'claude-haiku', 'initial');
      pinner.recordSaarTurn('sess-1');
      pinner.recordSaarTurn('sess-1');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'main_loop',
          candidate_model_id: 'claude-opus',
        }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.saarReason).toBe('saar_tier_upgrade');
      expect(result.pinnedModel?.id).toBe('claude-opus');
      expect(pinner.getPin('sess-1')?.pinned_model_id).toBe('claude-opus');
    });

    it('blocks non-upgrade candidate switches when hard-locked outside tool loop', () => {
      const pinner = new SessionPinner({ saarConfig });
      pinner.recordPin('sess-1', 'claude-haiku', 'initial');
      pinner.recordSaarTurn('sess-1');
      pinner.recordSaarTurn('sess-1');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'planning',
          candidate_model_id: 'claude-opus',
        }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.saarReason).toBe('saar_hard_lock');
      expect(pinner.getPin('sess-1')?.pinned_model_id).toBe('claude-haiku');
    });
  });

  describe('idle timeout reopen', () => {
    it('breaks pin and returns no_pin when idle timeout expires', () => {
      let now = BASE_TIME;
      const pinner = new SessionPinner({
        saarConfig,
        saarClock: () => now,
      });
      pinner.recordPin('sess-1', 'claude-haiku', 'initial');

      pinner.lookupPin(makeRequest(), fleet);
      now += saarConfig.idle_timeout_seconds * 1000;

      const result = pinner.lookupPin(makeRequest(), fleet);

      expect(result.action).toBe('no_pin');
      expect(result.saarReason).toBe('saar_idle_reopen');
      expect(pinner.getPin('sess-1')).toBeNull();
      expect(pinner.getSaarState('sess-1')).toBeNull();
    });
  });

  describe('SAAR disabled by default', () => {
    it('preserves legacy pin behavior without saarConfig', () => {
      const pinner = new SessionPinner();
      pinner.recordPin('sess-1', 'claude-haiku', 'initial');

      const result = pinner.lookupPin(
        makeRequest({
          turn_type: 'planning',
          candidate_model_id: 'claude-opus',
        }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.saarReason).toBeUndefined();
      expect(pinner.getSaarState('sess-1')).toBeNull();
    });
  });
});

// ─── Cache Economics Tests ──────────────────────────────────────────────────

describe('evaluateCacheEconomics', () => {
  const pinnedPin: SessionPin = {
    session_id: 'sess-econ',
    pinned_model_id: 'claude-opus',
    pin_reason: 'initial',
    has_ever_switched: false,
    consecutive_upstream_errors: 0,
    consecutive_tool_failures: 0,
    last_tool_failure_signature: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  };

  const expensiveModel = makeModel({
    id: 'claude-opus',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    pricing: { fallback_cost_per_1m: 15.0 },
  });

  const cheapModel = makeModel({
    id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    provider: 'openai',
    pricing: { fallback_cost_per_1m: 0.15 },
  });

  const sameProviderCheap = makeModel({
    id: 'claude-haiku',
    tier: 'economical-cloud',
    provider: 'anthropic',
    pricing: { fallback_cost_per_1m: 0.25 },
  });

  it('returns shouldSwitch: false for same-provider candidates', () => {
    const result = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      sameProviderCheap,
      10_000,
    );

    expect(result.shouldSwitch).toBe(false);
    expect(result.reason).toBe('same_provider_no_cache_penalty');
    expect(result.warmupCostUsd).toBe(0);
  });

  it('returns shouldSwitch: false when warmup cost exceeds savings', () => {
    const marginalCandidate = makeModel({
      id: 'marginal',
      tier: 'economical-cloud',
      provider: 'other',
      pricing: { fallback_cost_per_1m: 14.5 },
    });

    const result = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      marginalCandidate,
      1_000,
      { projectedRemainingTurns: 1 },
    );

    expect(result.shouldSwitch).toBe(false);
  });

  it('returns shouldSwitch: false when savings below threshold', () => {
    const slightlyCheaper = makeModel({
      id: 'slightly-cheaper',
      tier: 'economical-cloud',
      provider: 'other',
      pricing: { fallback_cost_per_1m: 14.9 },
    });

    const result = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      slightlyCheaper,
      1_000,
    );

    expect(result.shouldSwitch).toBe(false);
    expect(result.reason).toBe('savings_below_threshold');
  });

  it('returns shouldSwitch: true when projected savings are large', () => {
    const result = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      cheapModel,
      100_000,
      { projectedRemainingTurns: 10 },
    );

    expect(result.shouldSwitch).toBe(true);
    expect(result.reason).toBe('switch_justified');
    expect(result.projectedSavingsUsd).toBeGreaterThan(result.warmupCostUsd);
  });

  it('respects custom warmupCostMultiplier', () => {
    const config: CacheEconomicsConfig = {
      warmupCostMultiplier: 2.0,
      projectedRemainingTurns: 2,
    };

    const result = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      cheapModel,
      10_000,
      config,
    );

    expect(result.warmupCostUsd).toBeGreaterThan(0);
  });

  it('respects custom minSavingsThreshold', () => {
    const config: CacheEconomicsConfig = {
      minSavingsThreshold: 100.0,
    };

    const result = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      cheapModel,
      1_000,
      config,
    );

    expect(result.shouldSwitch).toBe(false);
    expect(result.reason).toBe('savings_below_threshold');
  });

  it('higher projectedRemainingTurns favors switching', () => {
    const shortHorizon = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      cheapModel,
      50_000,
      { projectedRemainingTurns: 1 },
    );

    const longHorizon = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      cheapModel,
      50_000,
      { projectedRemainingTurns: 20 },
    );

    expect(longHorizon.projectedSavingsUsd).toBeGreaterThan(
      shortHorizon.projectedSavingsUsd,
    );
  });

  it('returns numeric cost values for all scenarios', () => {
    const result = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      cheapModel,
      50_000,
    );

    expect(typeof result.warmupCostUsd).toBe('number');
    expect(typeof result.projectedSavingsUsd).toBe('number');
    expect(result.warmupCostUsd).toBeGreaterThanOrEqual(0);
  });

  it('handles zero estimated tokens gracefully', () => {
    const result = evaluateCacheEconomics(
      pinnedPin,
      expensiveModel,
      cheapModel,
      0,
    );

    expect(result.shouldSwitch).toBe(false);
    expect(result.warmupCostUsd).toBe(0);
    expect(result.projectedSavingsUsd).toBe(0);
  });
});

describe('FlipFlopGuard integration (SP-155)', () => {
  function observeTierFlips(
    pinner: SessionPinner,
    sessionId: string,
    candidateIds: readonly string[],
  ): void {
    for (const candidateModelId of candidateIds) {
      pinner.lookupPin(
        makeRequest({ session_id: sessionId, candidate_model_id: candidateModelId }),
        fleet,
      );
    }
  }

  it('does not pin after 2 consecutive tier flips', () => {
    const pinner = new SessionPinner();
    pinner.recordPin('sess-flip', 'claude-haiku', 'initial');

    observeTierFlips(pinner, 'sess-flip', [
      'claude-opus',
      'gpt-4o-mini',
      'claude-opus',
    ]);

    expect(pinner.getFlipFlopState('sess-flip')?.tier_pinned).toBeNull();
    expect(pinner.getFlipFlopState('sess-flip')?.consecutive_tier_flips).toBe(2);
    expect(pinner.getLastFlipFlopObservation()?.shadow_event).toBe('flip_flop_tier_flip');
  });

  it('pins tier after 3 consecutive tier flips', () => {
    const pinner = new SessionPinner();
    pinner.recordPin('sess-pin', 'claude-haiku', 'initial');

    observeTierFlips(pinner, 'sess-pin', [
      'claude-opus',
      'gpt-4o-mini',
      'claude-opus',
      'gpt-4o-mini',
    ]);

    expect(pinner.getFlipFlopState('sess-pin')?.tier_pinned).toBe('economical-cloud');
    expect(pinner.getLastFlipFlopObservation()?.shadow_event).toBe(
      'flip_flop_tier_pinned',
    );

    const blocked = pinner.lookupPin(
      makeRequest({
        session_id: 'sess-pin',
        candidate_model_id: 'claude-opus',
      }),
      fleet,
    );

    expect(blocked.action).toBe('use_pin');
    expect(blocked.flipFlopReason).toBe('flip_flop_tier_pinned');
    expect(blocked.pinnedModel?.tier).toBe('economical-cloud');
  });

  it('resets consecutive flips when shadow tier is stable', () => {
    const pinner = new SessionPinner();
    pinner.recordPin('sess-stable', 'claude-haiku', 'initial');

    observeTierFlips(pinner, 'sess-stable', [
      'claude-opus',
      'claude-opus',
      'gpt-4o-mini',
    ]);

    expect(pinner.getFlipFlopState('sess-stable')?.consecutive_tier_flips).toBe(1);
    expect(pinner.getFlipFlopState('sess-stable')?.tier_pinned).toBeNull();
  });

  it('clears flip-flop state when pin breaks', () => {
    const pinner = new SessionPinner();
    pinner.recordPin('sess-break', 'claude-haiku', 'initial');

    observeTierFlips(pinner, 'sess-break', [
      'claude-opus',
      'gpt-4o-mini',
      'claude-opus',
      'gpt-4o-mini',
    ]);

    expect(pinner.getFlipFlopState('sess-break')?.tier_pinned).toBe('economical-cloud');

    pinner.breakPin('sess-break');

    expect(pinner.getFlipFlopState('sess-break')).toBeNull();
  });
});
