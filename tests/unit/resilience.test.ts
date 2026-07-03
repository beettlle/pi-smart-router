import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  CircuitBreaker,
  isInfraError,
} from '../../src/infrastructure/gateway/circuit-breaker.js';
import {
  GatewayDispatch,
  weightedSelect,
} from '../../src/infrastructure/gateway/gateway-dispatch.js';
import type {
  RateLimitPort,
  RateLimitResult,
} from '../../src/infrastructure/gateway/gateway-dispatch.js';
import {
  evaluateLoopEscalation,
  extractToolFailureSignature,
  type LoopEscalationConfig,
} from '../../src/domain/pinning/loop-escalation.js';
import {
  HydraMatcher,
  projectToRequirements,
  type EmbeddingProvider,
  type RequirementVector,
  type HydraMatcherConfig,
} from '../../src/domain/matching/hydra-matcher.js';
import type { ModelProfile, RoutingRequest, SessionPin } from '../../src/domain/types/index.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

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
    request_id: 'req-001',
    session_id: 'sess-1',
    prompt_text: 'Hello world',
    ...overrides,
  };
}

function makePin(overrides?: Partial<SessionPin>): SessionPin {
  return {
    session_id: 'sess-1',
    pinned_model_id: 'econ-model',
    pin_reason: 'initial',
    has_ever_switched: false,
    consecutive_upstream_errors: 0,
    consecutive_tool_failures: 0,
    last_tool_failure_signature: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function isRateLimitResult(result: unknown): result is RateLimitResult {
  return typeof result === 'object' && result !== null && 'limited' in result;
}

function makeMockProvider(
  requirements: RequirementVector,
  delayMs = 0,
): EmbeddingProvider {
  return {
    extractRequirements: vi.fn(async () => {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return requirements;
    }),
    dispose: vi.fn(async () => {}),
  };
}

/**
 * Seeded PRNG (mulberry32) for deterministic weighted-selection tests.
 * Constitution: "seed RNG in stochastic tests."
 */
function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const econModel = makeModel({ id: 'econ-model', tier: 'economical-cloud' });
const frontierModel = makeModel({ id: 'frontier-model', tier: 'frontier-cloud' });
const fleet: readonly ModelProfile[] = [econModel, frontierModel];

const defaultEscalationConfig: LoopEscalationConfig = { threshold: 3 };

// ─── Loop escalation resilience ──────────────────────────────────────────────

describe('Loop escalation resilience', () => {
  describe('rapid repeated failures within same session', () => {
    it('escalates exactly once per session regardless of further failures', () => {
      const failureContent = 'Error: ENOENT file not found';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: sig,
      });

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleet,
        defaultEscalationConfig,
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('threshold_exceeded');

      const escalatedPin = makePin({
        pin_reason: 'loop_escalation',
        pinned_model_id: result.escalationTarget!.id,
        consecutive_tool_failures: 5,
        last_tool_failure_signature: sig,
      });

      const secondResult = evaluateLoopEscalation(
        escalatedPin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleet,
        defaultEscalationConfig,
      );
      expect(secondResult.shouldEscalate).toBe(false);
      expect(secondResult.reason).toBe('already_escalated');
    });

    it('resets failure count on interleaved success', () => {
      const pin = makePin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: 'tf:abc123',
      });

      const successResult = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'File written successfully' }],
        }),
        fleet,
        defaultEscalationConfig,
      );

      expect(successResult.shouldEscalate).toBe(false);
      expect(successResult.reason).toBe('success_reset');
      expect(successResult.updatedPin!.consecutive_tool_failures).toBe(0);
      expect(successResult.updatedPin!.last_tool_failure_signature).toBeNull();
    });

    it('counts different failure signatures independently', () => {
      const pin = makePin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: 'tf:old_sig',
      });

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Error: ECONNREFUSED something new' }],
        }),
        fleet,
        defaultEscalationConfig,
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.updatedPin!.consecutive_tool_failures).toBe(1);
    });
  });

  describe('boundary conditions at threshold', () => {
    it('does not escalate at threshold - 1', () => {
      const failureContent = 'Error: timeout';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        consecutive_tool_failures: 1,
        last_tool_failure_signature: sig,
      });

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleet,
        defaultEscalationConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('below_threshold');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(2);
    });

    it('escalates at exactly threshold', () => {
      const failureContent = 'Error: timeout';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: sig,
      });

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleet,
        defaultEscalationConfig,
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('threshold_exceeded');
    });
  });
});

// ─── Circuit breaker resilience ──────────────────────────────────────────────

describe('Circuit breaker resilience', () => {
  describe('429 rate-limit errors trip the breaker', () => {
    it('treats 429 as infra error', () => {
      expect(isInfraError({ statusCode: 429 })).toBe(true);
    });

    it('trips breaker after consecutive 429s', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5000, halfOpenSuccesses: 1 });

      cb.recordFailure('model-x');
      expect(cb.getSnapshot('model-x').state).toBe('closed');

      cb.recordFailure('model-x');
      expect(cb.getSnapshot('model-x').state).toBe('open');
      expect(cb.canDispatch('model-x')).toBe(false);
    });

    it('does not trip on single 429 below threshold', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5000, halfOpenSuccesses: 1 });

      cb.recordFailure('model-x');
      expect(cb.getSnapshot('model-x').state).toBe('closed');
      expect(cb.canDispatch('model-x')).toBe(true);
    });
  });

  describe('half-open probe success path', () => {
    it('allows single probe request after reset timeout', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10, halfOpenSuccesses: 2 });

      cb.recordFailure('model-x');
      cb.recordFailure('model-x');
      expect(cb.getSnapshot('model-x').state).toBe('open');

      await new Promise((r) => setTimeout(r, 20));

      expect(cb.canDispatch('model-x')).toBe(true);
      expect(cb.getSnapshot('model-x').state).toBe('half_open');
    });

    it('re-opens on probe failure', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10, halfOpenSuccesses: 2 });

      cb.recordFailure('model-x');
      cb.recordFailure('model-x');
      await new Promise((r) => setTimeout(r, 20));
      cb.canDispatch('model-x');

      cb.recordFailure('model-x');
      expect(cb.getSnapshot('model-x').state).toBe('open');
    });

    it('closes after sufficient consecutive successes', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10, halfOpenSuccesses: 2 });

      cb.recordFailure('model-x');
      cb.recordFailure('model-x');
      await new Promise((r) => setTimeout(r, 20));
      cb.canDispatch('model-x');

      cb.recordSuccess('model-x');
      expect(cb.getSnapshot('model-x').state).toBe('half_open');

      cb.recordSuccess('model-x');
      expect(cb.getSnapshot('model-x').state).toBe('closed');
    });
  });

  describe('multi-model isolation', () => {
    it('does not affect other models when one circuit trips', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5000, halfOpenSuccesses: 1 });

      cb.recordFailure('model-a');
      cb.recordFailure('model-a');

      expect(cb.canDispatch('model-a')).toBe(false);
      expect(cb.canDispatch('model-b')).toBe(true);
      expect(cb.canDispatch('model-c')).toBe(true);
    });

    it('tracks multiple open circuits independently', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000, halfOpenSuccesses: 1 });

      cb.recordFailure('model-a');
      cb.recordFailure('model-b');

      const open = cb.getOpenCircuits();
      expect(open).toContain('model-a');
      expect(open).toContain('model-b');
      expect(open).toHaveLength(2);
    });
  });
});

// ─── Rate limit race conditions ──────────────────────────────────────────────

describe('Rate limit race conditions', () => {
  describe('429 response fields', () => {
    it('returns error=rate_limit_exceeded with retry_after_seconds', async () => {
      const limiter: RateLimitPort = {
        consumeToken: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 60 }),
      };
      const gateway = new GatewayDispatch(
        [makeModel({ id: 'econ', tier: 'economical-cloud' })],
        { rateLimiter: limiter },
      );

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key-1');

      expect(isRateLimitResult(result)).toBe(true);
      if (!isRateLimitResult(result)) return;
      expect(result.limited).toBe(true);
      expect(result.error).toBe('rate_limit_exceeded');
      expect(result.retry_after_seconds).toBe(60);
    });

    it('returns retry_after_seconds=0 when limiter provides null', async () => {
      const limiter: RateLimitPort = {
        consumeToken: () => ({ allowed: false, remaining: 0, retryAfterSeconds: null }),
      };
      const gateway = new GatewayDispatch(
        [makeModel({ id: 'econ', tier: 'economical-cloud' })],
        { rateLimiter: limiter },
      );

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key-1');

      expect(isRateLimitResult(result)).toBe(true);
      if (!isRateLimitResult(result)) return;
      expect(result.retry_after_seconds).toBe(0);
    });

    it('preserves fractional retry_after_seconds from bucket', async () => {
      const limiter: RateLimitPort = {
        consumeToken: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 2.5 }),
      };
      const gateway = new GatewayDispatch(
        [makeModel({ id: 'econ', tier: 'economical-cloud' })],
        { rateLimiter: limiter },
      );

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key-1');

      expect(isRateLimitResult(result)).toBe(true);
      if (!isRateLimitResult(result)) return;
      expect(result.retry_after_seconds).toBe(2.5);
    });
  });

  describe('concurrent request races', () => {
    it('only first request passes when bucket has single token', async () => {
      let tokenCount = 1;
      const limiter: RateLimitPort = {
        consumeToken: () => {
          if (tokenCount > 0) {
            tokenCount--;
            return { allowed: true, remaining: tokenCount, retryAfterSeconds: null };
          }
          return { allowed: false, remaining: 0, retryAfterSeconds: 10 };
        },
      };
      const gateway = new GatewayDispatch(
        [makeModel({ id: 'econ', tier: 'economical-cloud' })],
        { rateLimiter: limiter },
      );

      const [first, second] = await Promise.all([
        gateway.dispatchWithRateLimit(makeRequest({ request_id: 'r1' }), 'api:shared-key'),
        gateway.dispatchWithRateLimit(makeRequest({ request_id: 'r2' }), 'api:shared-key'),
      ]);

      const results = [first, second];
      const limited = results.filter(isRateLimitResult);
      const routed = results.filter((r) => !isRateLimitResult(r));

      expect(limited).toHaveLength(1);
      expect(routed).toHaveLength(1);
      expect(limited[0]!.retry_after_seconds).toBe(10);
    });

    it('different keys do not interfere', async () => {
      const buckets = new Map<string, number>([
        ['key-a', 1],
        ['key-b', 1],
      ]);
      const limiter: RateLimitPort = {
        consumeToken: (key: string) => {
          const count = buckets.get(key) ?? 0;
          if (count > 0) {
            buckets.set(key, count - 1);
            return { allowed: true, remaining: count - 1, retryAfterSeconds: null };
          }
          return { allowed: false, remaining: 0, retryAfterSeconds: 5 };
        },
      };
      const gateway = new GatewayDispatch(
        [makeModel({ id: 'econ', tier: 'economical-cloud' })],
        { rateLimiter: limiter },
      );

      const [resultA, resultB] = await Promise.all([
        gateway.dispatchWithRateLimit(makeRequest({ request_id: 'r-a' }), 'key-a'),
        gateway.dispatchWithRateLimit(makeRequest({ request_id: 'r-b' }), 'key-b'),
      ]);

      expect(isRateLimitResult(resultA)).toBe(false);
      expect(isRateLimitResult(resultB)).toBe(false);
    });

    it('rate limit check happens before routing (short-circuit)', async () => {
      const routeSpy = vi.fn();
      const limiter: RateLimitPort = {
        consumeToken: () => {
          routeSpy();
          return { allowed: false, remaining: 0, retryAfterSeconds: 30 };
        },
      };
      const gateway = new GatewayDispatch(
        [makeModel({ id: 'econ', tier: 'economical-cloud' })],
        { rateLimiter: limiter },
      );

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key');

      expect(isRateLimitResult(result)).toBe(true);
      expect(routeSpy).toHaveBeenCalledOnce();
    });
  });

  describe('rate limit with circuit breaker interaction', () => {
    it('rate limit rejects before circuit breaker is consulted', async () => {
      const limiter: RateLimitPort = {
        consumeToken: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 45 }),
      };
      const modelFleet = [
        makeModel({ id: 'econ-a', tier: 'economical-cloud' }),
      ];
      const gateway = new GatewayDispatch(modelFleet, {
        rateLimiter: limiter,
        circuitBreakerConfig: { failureThreshold: 1, resetTimeoutMs: 60_000, halfOpenSuccesses: 1 },
      });

      gateway.recordOutcome('econ-a', { statusCode: 500 });
      const cb = gateway.getCircuitBreaker();
      expect(cb.canDispatch('econ-a')).toBe(false);

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key');

      expect(isRateLimitResult(result)).toBe(true);
      if (!isRateLimitResult(result)) return;
      expect(result.retry_after_seconds).toBe(45);
    });
  });
});

// ─── Seeded RNG for matcher tests ────────────────────────────────────────────

describe('Seeded RNG matcher determinism', () => {
  const MATCHER_CONFIG: HydraMatcherConfig = {
    artifactCachePath: '.pi-smart-router/models/',
    budgetMs: 100,
  };

  describe('projectToRequirements with seeded embeddings', () => {
    it('produces deterministic requirements from seeded embedding', () => {
      const rng = seededRandom(42);
      const embedding = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        embedding[i] = rng() * 2 - 1;
      }

      const req1 = projectToRequirements(embedding);
      const req2 = projectToRequirements(embedding);

      expect(req1).toEqual(req2);
      expect(req1.reasoning).toBeGreaterThan(0);
      expect(req1.reasoning).toBeLessThan(1);
      expect(req1.code_gen).toBeGreaterThan(0);
      expect(req1.code_gen).toBeLessThan(1);
      expect(req1.tool_use).toBeGreaterThan(0);
      expect(req1.tool_use).toBeLessThan(1);
    });

    it('different seeds produce different requirements', () => {
      const makeEmbedding = (seed: number) => {
        const rng = seededRandom(seed);
        const embedding = new Float32Array(384);
        for (let i = 0; i < 384; i++) {
          embedding[i] = rng() * 2 - 1;
        }
        return embedding;
      };

      const req1 = projectToRequirements(makeEmbedding(42));
      const req2 = projectToRequirements(makeEmbedding(99));

      expect(req1).not.toEqual(req2);
    });
  });

  describe('HydraMatcher scoring determinism with seeded provider', () => {
    it('selects same model across repeated calls with identical requirements', async () => {
      const rng = seededRandom(1337);
      const requirements: RequirementVector = {
        reasoning: rng(),
        code_gen: rng(),
        tool_use: rng(),
      };

      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, MATCHER_CONFIG);

      const testFleet: ModelProfile[] = [
        makeModel({ id: 'model-a', tier: 'economical-cloud', capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 } }),
        makeModel({ id: 'model-b', tier: 'economical-cloud', capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 } }),
        makeModel({ id: 'model-c', tier: 'frontier-cloud', capabilities: { reasoning: 0.95, code_gen: 0.95, tool_use: 0.95 } }),
      ];

      const results = await Promise.all([
        matcher.match(makeRequest(), testFleet),
        matcher.match(makeRequest(), testFleet),
        matcher.match(makeRequest(), testFleet),
      ]);

      const selectedIds = results.map((r) => r.selected?.model_id);
      expect(new Set(selectedIds).size).toBe(1);
    });

    it('scores are consistent for seeded requirement vectors', async () => {
      const rng = seededRandom(7);
      const requirements: RequirementVector = {
        reasoning: rng(),
        code_gen: rng(),
        tool_use: rng(),
      };

      const provider = makeMockProvider(requirements);
      const matcher = new HydraMatcher(provider, MATCHER_CONFIG);

      const testFleet: ModelProfile[] = [
        makeModel({ id: 'alpha', tier: 'economical-cloud', capabilities: { reasoning: 0.8, code_gen: 0.6, tool_use: 0.7 } }),
        makeModel({ id: 'beta', tier: 'frontier-cloud', capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 } }),
      ];

      const result1 = await matcher.match(makeRequest(), testFleet);
      const result2 = await matcher.match(makeRequest(), testFleet);

      expect(result1.candidates.map((c) => c.score)).toEqual(
        result2.candidates.map((c) => c.score),
      );
    });
  });

  describe('weightedSelect determinism with seeded Math.random', () => {
    let originalRandom: () => number;

    beforeEach(() => {
      originalRandom = Math.random;
    });

    afterEach(() => {
      Math.random = originalRandom;
    });

    it('produces deterministic selection with seeded random', () => {
      const candidates = [
        makeModel({ id: 'cheap', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.5 } }),
        makeModel({ id: 'mid', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 1.0 } }),
        makeModel({ id: 'expensive', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 5.0 } }),
      ];

      const rng = seededRandom(42);
      Math.random = rng;
      const selection1 = weightedSelect(candidates);

      const rng2 = seededRandom(42);
      Math.random = rng2;
      const selection2 = weightedSelect(candidates);

      expect(selection1!.id).toBe(selection2!.id);
    });

    it('favors cheaper models with inverse-cost weighting', () => {
      const candidates = [
        makeModel({ id: 'cheap', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.1 } }),
        makeModel({ id: 'expensive', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 100.0 } }),
      ];

      const selections = new Map<string, number>();
      for (let seed = 0; seed < 100; seed++) {
        Math.random = seededRandom(seed);
        const pick = weightedSelect(candidates);
        if (pick) {
          selections.set(pick.id, (selections.get(pick.id) ?? 0) + 1);
        }
      }

      expect(selections.get('cheap')!).toBeGreaterThan(selections.get('expensive')!);
    });
  });
});
