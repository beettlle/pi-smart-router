import { describe, expect, it } from 'vitest';

import {
  GatewayDispatch,
  isCursorQuotaExhaustedError,
  isCursorSubscriptionModel,
  shouldFailoverOnProviderError,
  weightedSelect,
} from '../../src/infrastructure/gateway/gateway-dispatch.js';
import type { RateLimitPort, RateLimitResult } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';

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

function isRateLimitResult(result: unknown): result is RateLimitResult {
  return typeof result === 'object' && result !== null && 'limited' in result;
}

const fleet: ModelProfile[] = [
  makeModel({ id: 'local-llama', tier: 'zero-tier' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
];

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    request_id: 'req-1',
    selected_model_id: 'econ-a',
    tier: 'economical-cloud',
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    routing_latency_ms: 1,
    pin_reason: null,
    ...overrides,
  };
}

describe('GatewayDispatch', () => {
  it('constructs with a fleet array', () => {
    expect(() => new GatewayDispatch(fleet)).not.toThrow();
  });

  it('constructs with an empty fleet', () => {
    expect(() => new GatewayDispatch([])).not.toThrow();
  });

  it('dispatch returns a valid RoutingDecision with fallback', async () => {
    const gateway = new GatewayDispatch(fleet);
    const decision = await gateway.dispatch(makeRequest());

    expect(decision.request_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(decision.selected_model_id).toBe('gpt-4o-mini');
    expect(decision.tier).toBe('economical-cloud');
    expect(decision.stage).toBe('fallback');
    expect(decision.reason_code).toBe('safe_cloud_default');
    expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
    expect(decision.pin_reason).toBeNull();
  });

  it('dispatch preserves request_id', async () => {
    const gateway = new GatewayDispatch(fleet);
    const request = makeRequest({ request_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    const decision = await gateway.dispatch(request);

    expect(decision.request_id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('dispatch returns safe default for empty fleet', async () => {
    const gateway = new GatewayDispatch([]);
    const decision = await gateway.dispatch(makeRequest());

    expect(decision.selected_model_id).toBe('unknown');
    expect(decision.stage).toBe('fallback');
    expect(decision.reason_code).toBe('safe_cloud_default');
  });

  it('dispatch never throws', async () => {
    const gateway = new GatewayDispatch([]);
    await expect(gateway.dispatch(makeRequest())).resolves.toBeDefined();
  });

  it('decision contains all required RoutingDecision fields', async () => {
    const gateway = new GatewayDispatch(fleet);
    const decision = await gateway.dispatch(makeRequest());

    expect(decision).toHaveProperty('request_id');
    expect(decision).toHaveProperty('selected_model_id');
    expect(decision).toHaveProperty('tier');
    expect(decision).toHaveProperty('stage');
    expect(decision).toHaveProperty('reason_code');
    expect(decision).toHaveProperty('routing_latency_ms');
    expect(decision).toHaveProperty('pin_reason');
  });

  // ─── Circuit breaker integration (T055, FR-018) ─────────────────────────

  describe('circuit breaker', () => {
    it('fails over to same-tier model when circuit is open', async () => {
      const multiFleet = [
        makeModel({ id: 'econ-a', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.5 } }),
        makeModel({ id: 'econ-b', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.5 } }),
        makeModel({ id: 'frontier-a', tier: 'frontier-cloud' }),
      ];
      const gateway = new GatewayDispatch(multiFleet, {
        circuitBreakerConfig: { failureThreshold: 2, resetTimeoutMs: 60_000, halfOpenSuccesses: 1 },
      });

      gateway.recordOutcome('econ-a', { statusCode: 500 });
      gateway.recordOutcome('econ-a', { statusCode: 500 });

      const decision = await gateway.dispatch(makeRequest());

      expect(decision.selected_model_id).toBe('econ-b');
      expect(decision.reason_code).toBe('circuit_breaker_failover');
    });

    it('does not trip circuit on policy rejection (FR-018)', async () => {
      const gateway = new GatewayDispatch(fleet, {
        circuitBreakerConfig: { failureThreshold: 1, resetTimeoutMs: 60_000, halfOpenSuccesses: 1 },
      });

      gateway.recordOutcome('gpt-4o-mini', { statusCode: 403 });
      gateway.recordOutcome('gpt-4o-mini', { statusCode: 422 });

      const cb = gateway.getCircuitBreaker();
      expect(cb.canDispatch('gpt-4o-mini')).toBe(true);
    });

    it('trips circuit on infra errors (5xx)', async () => {
      const gateway = new GatewayDispatch(fleet, {
        circuitBreakerConfig: { failureThreshold: 2, resetTimeoutMs: 60_000, halfOpenSuccesses: 1 },
      });

      gateway.recordOutcome('gpt-4o-mini', { statusCode: 502 });
      gateway.recordOutcome('gpt-4o-mini', { statusCode: 503 });

      const cb = gateway.getCircuitBreaker();
      expect(cb.canDispatch('gpt-4o-mini')).toBe(false);
    });

    it('resets circuit on success', async () => {
      const gateway = new GatewayDispatch(fleet, {
        circuitBreakerConfig: { failureThreshold: 2, resetTimeoutMs: 60_000, halfOpenSuccesses: 1 },
      });

      gateway.recordOutcome('gpt-4o-mini', { statusCode: 500 });
      gateway.recordOutcome('gpt-4o-mini');

      const cb = gateway.getCircuitBreaker();
      expect(cb.canDispatch('gpt-4o-mini')).toBe(true);
    });

    it('trips circuit on network errors', async () => {
      const gateway = new GatewayDispatch(fleet, {
        circuitBreakerConfig: { failureThreshold: 1, resetTimeoutMs: 60_000, halfOpenSuccesses: 1 },
      });

      gateway.recordOutcome('gpt-4o-mini', { code: 'ECONNREFUSED' });

      const cb = gateway.getCircuitBreaker();
      expect(cb.canDispatch('gpt-4o-mini')).toBe(false);
    });
  });

  describe('selectFailover', () => {
    it('returns same-tier alternative excluding failed models', () => {
      const multiFleet = [
        makeModel({ id: 'econ-a', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.5 } }),
        makeModel({ id: 'econ-b', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.5 } }),
        makeModel({ id: 'frontier-a', tier: 'frontier-cloud' }),
      ];
      const gateway = new GatewayDispatch(multiFleet);

      const failover = gateway.selectFailover(
        makeDecision({ selected_model_id: 'econ-a', tier: 'economical-cloud' }),
        ['econ-a'],
      );

      expect(failover?.selected_model_id).toBe('econ-b');
      expect(failover?.reason_code).toBe('circuit_breaker_failover');
    });

    it('returns undefined when no healthy alternative exists', () => {
      const singleFleet = [
        makeModel({ id: 'econ-a', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.5 } }),
      ];
      const gateway = new GatewayDispatch(singleFleet);

      const failover = gateway.selectFailover(
        {
          request_id: 'req-1',
          selected_model_id: 'econ-a',
          tier: 'economical-cloud',
          stage: 'fallback',
          reason_code: 'safe_cloud_default',
          routing_latency_ms: 1,
          pin_reason: null,
        },
        ['econ-a'],
      );

      expect(failover).toBeUndefined();
    });
  });

  describe('cursor quota exhaustion failover (SP-097)', () => {
    it('classifies dogfood usage-limit message as quota exhausted', () => {
      expect(
        isCursorQuotaExhaustedError({
          message: "You've hit your usage limit. Switch to Auto for more usage.",
        }),
      ).toBe(true);
    });

    it('classifies RESOURCE_EXHAUSTED code as quota exhausted', () => {
      expect(isCursorQuotaExhaustedError({ code: 'RESOURCE_EXHAUSTED' })).toBe(true);
    });

    it('does not classify generic 403 as quota exhausted', () => {
      expect(
        isCursorQuotaExhaustedError({
          statusCode: 403,
          message: 'Invalid API key',
        }),
      ).toBe(false);
    });

    it('identifies cursor subscription models', () => {
      expect(
        isCursorSubscriptionModel(
          makeModel({ id: 'composer-latest', tier: 'frontier-cloud', provider: 'cursor' }),
        ),
      ).toBe(true);
      expect(
        isCursorSubscriptionModel(
          makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
        ),
      ).toBe(false);
    });

    it('shouldFailoverOnProviderError includes cursor quota and infra', () => {
      const composer = makeModel({
        id: 'composer-latest',
        tier: 'frontier-cloud',
        provider: 'cursor',
      });

      expect(
        shouldFailoverOnProviderError(
          { message: "You've hit your usage limit" },
          composer,
        ),
      ).toBe(true);
      expect(shouldFailoverOnProviderError({ statusCode: 503 }, composer)).toBe(true);
      expect(
        shouldFailoverOnProviderError(
          { statusCode: 403, message: 'forbidden' },
          composer,
        ),
      ).toBe(false);
    });

    it('fails over to cursor/auto when composer-latest hits quota', () => {
      const fleet = [
        makeModel({
          id: 'composer-latest',
          tier: 'frontier-cloud',
          provider: 'cursor',
          pricing: { fallback_cost_per_1m: 0 },
        }),
        makeModel({
          id: 'cursor/auto',
          tier: 'frontier-cloud',
          provider: 'cursor',
          pricing: { fallback_cost_per_1m: 0 },
        }),
        makeModel({
          id: 'gemini-flash-lite-latest',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 0.1 },
        }),
      ];
      const gateway = new GatewayDispatch(fleet);

      gateway.recordOutcome('composer-latest', {
        message: "You've hit your usage limit. Switch to Auto for more usage.",
      });

      const failover = gateway.selectFailover(
        makeDecision({
          selected_model_id: 'composer-latest',
          tier: 'frontier-cloud',
        }),
        ['composer-latest'],
        fleet,
      );

      expect(failover?.selected_model_id).toBe('cursor/auto');
      expect(failover?.reason_code).toBe('cursor_quota_exhausted');
    });

    it('fails over to economical API model when cursor/auto unavailable', () => {
      const fleet = [
        makeModel({
          id: 'composer-latest',
          tier: 'frontier-cloud',
          provider: 'cursor',
          pricing: { fallback_cost_per_1m: 0 },
        }),
        makeModel({
          id: 'gemini-flash-lite-latest',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 0.1 },
        }),
      ];
      const gateway = new GatewayDispatch(fleet);

      gateway.recordOutcome('composer-latest', { statusCode: 429 });

      const failover = gateway.selectFailover(
        makeDecision({
          selected_model_id: 'composer-latest',
          tier: 'frontier-cloud',
        }),
        ['composer-latest'],
        fleet,
      );

      expect(failover?.selected_model_id).toBe('gemini-flash-lite-latest');
      expect(failover?.reason_code).toBe('cursor_quota_exhausted');
    });

    it('weighted economical failover picks among viable economical candidates', () => {
      const fleet = [
        makeModel({
          id: 'composer-latest',
          tier: 'frontier-cloud',
          provider: 'cursor',
          pricing: { fallback_cost_per_1m: 0 },
        }),
        makeModel({
          id: 'gemini-flash-lite-latest',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 0.1 },
        }),
        makeModel({
          id: 'gpt-4o-mini',
          tier: 'economical-cloud',
          provider: 'openai',
          pricing: { fallback_cost_per_1m: 0.5 },
        }),
      ];
      const gateway = new GatewayDispatch(fleet);

      gateway.recordOutcome('composer-latest', { statusCode: 429 });

      const failover = gateway.selectFailover(
        makeDecision({
          selected_model_id: 'composer-latest',
          tier: 'frontier-cloud',
        }),
        ['composer-latest'],
        fleet,
      );

      expect(['gemini-flash-lite-latest', 'gpt-4o-mini']).toContain(
        failover?.selected_model_id,
      );
      expect(failover?.reason_code).toBe('cursor_quota_exhausted');
      expect(failover?.tier).toBe('economical-cloud');
    });

    it('does not trip circuit breaker on cursor quota errors', () => {
      const fleet = [
        makeModel({
          id: 'composer-latest',
          tier: 'frontier-cloud',
          provider: 'cursor',
        }),
      ];
      const gateway = new GatewayDispatch(fleet, {
        circuitBreakerConfig: { failureThreshold: 1, resetTimeoutMs: 60_000, halfOpenSuccesses: 1 },
      });

      gateway.recordOutcome('composer-latest', {
        statusCode: 429,
        message: "You've hit your usage limit",
      });

      expect(gateway.getCircuitBreaker().canDispatch('composer-latest')).toBe(true);
      expect(gateway.hasQuotaExhaustion('composer-latest')).toBe(true);
    });
  });

  // ─── Rate limiting (T057, FR-017) ──────────────────────────────────────

  describe('rate limiting', () => {
    it('returns 429 result when rate limit exceeded', async () => {
      const limiter: RateLimitPort = {
        consumeToken: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 30 }),
      };
      const gateway = new GatewayDispatch(fleet, { rateLimiter: limiter });

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key-1');

      expect(isRateLimitResult(result)).toBe(true);
      if (!isRateLimitResult(result)) return;
      expect(result.limited).toBe(true);
      expect(result.error).toBe('rate_limit_exceeded');
      expect(result.retry_after_seconds).toBe(30);
    });

    it('routes normally when rate limit allows', async () => {
      const limiter: RateLimitPort = {
        consumeToken: () => ({ allowed: true, remaining: 9, retryAfterSeconds: null }),
      };
      const gateway = new GatewayDispatch(fleet, { rateLimiter: limiter });

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key-1');

      expect(isRateLimitResult(result)).toBe(false);
      if (isRateLimitResult(result)) return;
      expect(result.selected_model_id).toBeDefined();
    });

    it('routes normally when no limiter configured', async () => {
      const gateway = new GatewayDispatch(fleet);

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key-1');

      expect(isRateLimitResult(result)).toBe(false);
    });

    it('returns 429 with retry_after_seconds 0 when limiter denies but retryAfterSeconds is null', async () => {
      const limiter: RateLimitPort = {
        consumeToken: () => ({ allowed: false, remaining: 0, retryAfterSeconds: null }),
      };
      const gateway = new GatewayDispatch(fleet, { rateLimiter: limiter });

      const result = await gateway.dispatchWithRateLimit(makeRequest(), 'api:key-1');

      expect(isRateLimitResult(result)).toBe(true);
      if (!isRateLimitResult(result)) return;
      expect(result.limited).toBe(true);
      expect(result.error).toBe('rate_limit_exceeded');
      expect(result.retry_after_seconds).toBe(0);
    });
  });

  // ─── Weighted selection (T056) ─────────────────────────────────────────

  describe('weightedSelect', () => {
    it('returns undefined for empty candidates', () => {
      expect(weightedSelect([])).toBeUndefined();
    });

    it('returns the only candidate for single-element array', () => {
      const model = makeModel({ id: 'solo', tier: 'economical-cloud' });
      expect(weightedSelect([model])).toBe(model);
    });

    it('returns one of the candidates for multiple models', () => {
      const candidates = [
        makeModel({ id: 'a', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.5 } }),
        makeModel({ id: 'b', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 1.5 } }),
      ];

      const selected = weightedSelect(candidates);
      expect(selected).toBeDefined();
      expect(['a', 'b']).toContain(selected!.id);
    });

    it('handles zero-cost models gracefully', () => {
      const candidates = [
        makeModel({ id: 'free-a', tier: 'zero-tier', pricing: { fallback_cost_per_1m: 0 } }),
        makeModel({ id: 'free-b', tier: 'zero-tier', pricing: { fallback_cost_per_1m: 0 } }),
      ];

      const selected = weightedSelect(candidates);
      expect(selected).toBeDefined();
    });
  });
});
