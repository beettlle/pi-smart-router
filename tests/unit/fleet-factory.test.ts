import { describe, expect, it, vi } from 'vitest';

import { createRouterFromFleet } from '../../src/index.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';
import type { PiExtensionHooks } from '../../src/api/middleware/pi-router-middleware.js';
import { LifecycleHookState } from '../../src/api/middleware/pi-router-middleware.js';
import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import {
  HydraMatcher,
  type EmbeddingProvider,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';

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

function makeMockProvider(requirements: RequirementVector): EmbeddingProvider {
  return {
    extractRequirements: vi.fn(async () => requirements),
    dispose: vi.fn(async () => {}),
  };
}

function makeRoutingRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-factory-1',
    session_id: 'sess-factory-1',
    prompt_text: 'Hello, how are you today?',
    messages: [{ role: 'user', content: 'Hello, how are you today?' }],
    turn_type: 'main_loop',
    ...overrides,
  };
}

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
    expect(handle.middleware.lifecycleHookState).toBeInstanceOf(LifecycleHookState);
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

    expect(registered).toContain('session_compact');
    expect(registered).toContain('session_before_compact');
    expect(registered).toContain('model_select');
    expect(registered).not.toContain('before_provider_request');
    expect(registered).not.toContain('context');
  });

  it('passes hydraMatcher dispatch options through to routing', async () => {
    const provider = makeMockProvider({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
    const hydraMatcher = new HydraMatcher(provider, {
      artifactCachePath: '.pi-smart-router/models/',
    });
    const handle = createRouterFromFleet(minimalFleet, { hydraMatcher });

    const decision = await handle.dispatch.dispatch(makeRoutingRequest());

    expect(decision.stage).toBe('hydra_match');
    expect(decision.reason_code).toBe('hydra_embedding_match');
    expect(['local-llama', 'gpt-4o-mini', 'claude-opus']).toContain(decision.selected_model_id);
  });

  it('falls back to safe cloud default for ambiguous prompts without hydraMatcher', async () => {
    const handle = createRouterFromFleet(minimalFleet);

    const decision = await handle.dispatch.dispatch(makeRoutingRequest());

    expect(decision.stage).toBe('fallback');
    expect(decision.reason_code).toBe('safe_cloud_default');
    expect(decision.selected_model_id).toBe('gpt-4o-mini');
  });
});
