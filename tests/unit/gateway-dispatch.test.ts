import { describe, expect, it } from 'vitest';

import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
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
});
