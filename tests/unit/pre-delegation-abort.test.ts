/**
 * SP-171: Pre-delegation abort — abort during slow dispatch must not start delegation.
 */
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Message,
  type Model,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai/compat';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routeAndDelegate } from '../../.pi/extensions/smart-router/route-and-delegate.js';
import { createStreamSimple } from '../../.pi/extensions/smart-router/stream-delegation.js';
import type { StreamDelegationDeps } from '../../.pi/extensions/smart-router/types.js';
import { ExecutionLedger } from '../../src/domain/delegation/execution-ledger.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import type { ModelProfile, RoutingDecision } from '../../src/domain/types/index.js';
import type { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { createRouterFromFleet, type RouterHandle } from '../../src/index.js';

const mockDelegateStreamSimple = vi.fn();

function makeProfile(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier']; provider?: string },
): ModelProfile {
  return {
    provider: overrides.provider ?? 'openai',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

const fleet: ModelProfile[] = [
  makeProfile({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
];

function makeRegistryModel(
  overrides: Partial<Model<Api>> & { provider: string; id: string; api?: Api },
): Model<Api> {
  const { provider, id, api, ...rest } = overrides;
  return {
    name: id,
    api: api ?? 'openai-responses',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4096,
    provider: provider as Model<Api>['provider'],
    id,
    ...rest,
  };
}

const registryModels: Model<Api>[] = [
  makeRegistryModel({ provider: 'openai', id: 'gpt-4o-mini', api: 'openai-responses' }),
];

function createMockRegistry(models: Model<Api>[]): ModelRegistry {
  return {
    find(provider: string, id: string) {
      return models.find((model) => model.provider === provider && model.id === id);
    },
    getAvailable() {
      return models;
    },
    async getApiKeyAndHeaders(model: Model<Api>) {
      return {
        ok: true as const,
        apiKey: `${model.provider}-delegation-key`,
        headers: undefined,
        env: undefined,
      };
    },
  } as unknown as ModelRegistry;
}

function makeDecision(overrides?: Partial<RoutingDecision>): RoutingDecision {
  return {
    request_id: 'req-abort-1',
    selected_model_id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    routing_latency_ms: 1,
    pin_reason: null,
    ...overrides,
  };
}

function createMockRouter(
  dispatch: GatewayDispatch['dispatch'],
  fleetOverride: ModelProfile[] = fleet,
): RouterHandle {
  const router = createRouterFromFleet(fleetOverride, {
    sessionPinner: new SessionPinner(),
  });
  vi.spyOn(router.dispatch, 'dispatch').mockImplementation(dispatch);
  return router;
}

function makeStreamDeps(overrides: Partial<StreamDelegationDeps> = {}): StreamDelegationDeps {
  return {
    router: overrides.router ?? createMockRouter(vi.fn(async () => makeDecision())),
    modelRegistry: overrides.modelRegistry ?? createMockRegistry(registryModels),
    fleet: overrides.fleet ?? fleet,
    executionLedger: overrides.executionLedger ?? new ExecutionLedger(),
    delegateStream: mockDelegateStreamSimple,
    ...overrides,
  };
}

function makeAssistantPartial(model: Model<Api>): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'hello' }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function makeSuccessStream(model: Model<Api>) {
  const stream = createAssistantMessageEventStream();
  const partial = makeAssistantPartial(model);
  void (async () => {
    stream.push({ type: 'start', partial });
    stream.push({ type: 'done', reason: 'stop', message: partial });
    stream.end(partial);
  })();
  return stream;
}

async function collectEvents(stream: AssistantMessageEventStream): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function userMessage(content: string, timestamp = 1): Message {
  return { role: 'user', content, timestamp };
}

function makeContext(messages: Message[] = []): Context {
  return { messages };
}

function makeAutoModel(): Model<Api> {
  return makeRegistryModel({ provider: 'openai', id: 'smart-router/auto', api: 'openai-responses' });
}

describe('pre-delegation abort (SP-171)', () => {
  beforeEach(() => {
    mockDelegateStreamSimple.mockReset();
    mockDelegateStreamSimple.mockImplementation((model: Model<Api>) => makeSuccessStream(model));
  });

  it('aborts during slow dispatch and never starts delegation', async () => {
    const controller = new AbortController();
    let releaseDispatch!: () => void;
    const dispatchGate = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    let resolveDispatchStarted!: () => void;
    const dispatchStarted = new Promise<void>((resolve) => {
      resolveDispatchStarted = resolve;
    });

    const dispatch = vi.fn(async () => {
      resolveDispatchStarted();
      await dispatchGate;
      return makeDecision();
    });

    const streamSimple = createStreamSimple(
      makeStreamDeps({
        router: createMockRouter(dispatch),
        modelRegistry: createMockRegistry(registryModels),
        fleet,
        executionLedger: new ExecutionLedger(),
      }),
    );

    const streamPromise = collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')]), {
        signal: controller.signal,
      }),
    );

    // Wait until slow dispatch is in flight, then abort before it resolves.
    await dispatchStarted;
    controller.abort();
    releaseDispatch();

    const events = await streamPromise;

    expect(dispatch).toHaveBeenCalledOnce();
    expect(mockDelegateStreamSimple).not.toHaveBeenCalled();

    const errorEvent = events.find((event) => event.type === 'error');
    expect(errorEvent?.type).toBe('error');
    if (errorEvent?.type === 'error') {
      expect(errorEvent.reason).toBe('aborted');
      expect(errorEvent.error.stopReason).toBe('aborted');
    }
  });

  it('throws before ensureFleetFresh when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    let ensureCalls = 0;
    const outer = createAssistantMessageEventStream();
    const deps = makeStreamDeps({
      router: createMockRouter(vi.fn(async () => makeDecision())),
      ensureFleetFresh: async () => {
        ensureCalls += 1;
      },
    });

    await expect(
      routeAndDelegate(
        makeContext([userMessage('hello')]),
        { signal: controller.signal },
        deps,
        outer,
      ),
    ).rejects.toThrow('Request was aborted');

    expect(ensureCalls).toBe(0);
    expect(mockDelegateStreamSimple).not.toHaveBeenCalled();
  });
});
