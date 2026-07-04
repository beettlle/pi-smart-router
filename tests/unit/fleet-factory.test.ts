import { describe, expect, it } from 'vitest';

import { createRouterFromFleet } from '../../src/index.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import type { PiExtensionHooks } from '../../src/api/middleware/pi-router-middleware.js';
import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';

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

const minimalFleet: ModelProfile[] = [
  makeModel({ id: 'local-llama', tier: 'zero-tier' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
];

describe('createRouterFromFleet factory (SP-039)', () => {
  it('accepts a minimal 3-model fleet', () => {
    const handle = createRouterFromFleet(minimalFleet);

    expect(handle.fleet).toBe(minimalFleet);
    expect(handle.fleet).toHaveLength(3);
    expect(handle.fleet.map((m) => m.id)).toEqual([
      'local-llama',
      'gpt-4o-mini',
      'claude-opus',
    ]);
  });

  it('returns a valid RouterHandle with middleware, dispatch, fleet, register', () => {
    const handle = createRouterFromFleet(minimalFleet);

    expect(handle).toHaveProperty('version');
    expect(handle).toHaveProperty('middleware');
    expect(handle).toHaveProperty('dispatch');
    expect(handle).toHaveProperty('fleet');
    expect(handle).toHaveProperty('register');

    expect(handle.version).toBe('pi-smart-router');
    expect(handle.dispatch).toBeInstanceOf(GatewayDispatch);
    expect(typeof handle.register).toBe('function');
    expect(handle.register).toBe(handle.middleware.register);
    expect(typeof handle.middleware.getLastDecision).toBe('function');
    expect(handle.middleware.getLastDecision()).toBeUndefined();
  });

  it('register delegates to middleware.register', () => {
    const handle = createRouterFromFleet(minimalFleet);
    const registered: string[] = [];

    const mockHooks = {
      on(event: string) {
        registered.push(event);
      },
    } as PiExtensionHooks;

    handle.register(mockHooks);

    expect(registered).toContain('before_provider_request');
    expect(registered).toContain('context');
    expect(registered).toContain('session_compact');
    expect(registered).toContain('session_before_compact');
    expect(registered).toContain('model_select');
  });
});
