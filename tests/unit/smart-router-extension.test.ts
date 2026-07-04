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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildRoutingRequest,
  createStreamSimple,
  deriveTurnType,
  extractPromptText,
  initHydraMatcher,
  mapContextMessages,
} from '../../.pi/extensions/smart-router/index.js';
import type { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { createRouterFromFleet } from '../../src/index.js';
import {
  HydraMatcher,
  type EmbeddingProvider,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import type { RouterHandle } from '../../src/index.js';

const { mockDelegateStreamSimple } = vi.hoisted(() => ({
  mockDelegateStreamSimple: vi.fn(),
}));

vi.mock('@earendil-works/pi-ai/compat', async (importOriginal) => {
  const original = await importOriginal<typeof import('@earendil-works/pi-ai/compat')>();
  return {
    ...original,
    streamSimple: mockDelegateStreamSimple,
  };
});

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
  makeProfile({ id: 'local-llama', tier: 'zero-tier', provider: 'ollama' }),
  makeProfile({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
  makeProfile({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
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
  makeRegistryModel({ provider: 'anthropic', id: 'claude-opus', api: 'anthropic-messages' }),
  makeRegistryModel({ provider: 'ollama', id: 'local-llama', api: 'openai-completions' }),
];

function createMockRegistry(models: Model<Api>[]): ModelRegistry {
  return {
    find(provider: string, id: string) {
      return models.find((model) => model.provider === provider && model.id === id);
    },
    getAvailable() {
      return models;
    },
  } as ModelRegistry;
}

function makeDecision(overrides?: Partial<RoutingDecision>): RoutingDecision {
  return {
    request_id: 'req-1',
    selected_model_id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    routing_latency_ms: 1,
    pin_reason: null,
    ...overrides,
  };
}

function createMockRouter(dispatch: GatewayDispatch['dispatch']): RouterHandle {
  return {
    version: 'pi-smart-router',
    fleet,
    dispatch: { dispatch } as GatewayDispatch,
    middleware: { register: vi.fn(), getLastDecision: vi.fn(() => undefined) },
    register: vi.fn(),
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

function assistantMessage(text: string, timestamp = 2): Message {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-4o-mini',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp,
  };
}

function toolResultMessage(content: string, timestamp = 3): Message {
  return {
    role: 'toolResult',
    toolCallId: 'tool-1',
    toolName: 'read',
    content: [{ type: 'text', text: content }],
    isError: false,
    timestamp,
  };
}

function makeContext(messages: Message[] = []): Context {
  return { messages };
}

function makeAutoModel(): Model<Api> {
  return makeRegistryModel({
    provider: 'smart-router',
    id: 'auto',
    api: 'openai-responses',
  });
}

describe('smart-router extension helpers', () => {
  it('extractPromptText returns the latest non-empty user message', () => {
    const text = extractPromptText([
      userMessage('first'),
      assistantMessage('reply'),
      userMessage('second prompt'),
    ]);

    expect(text).toBe('second prompt');
  });

  it('deriveTurnType detects planning prompts', () => {
    expect(deriveTurnType([userMessage('Please design the architecture')])).toBe('planning');
    expect(deriveTurnType([toolResultMessage('ok')])).toBe('tool_result');
  });

  it('mapContextMessages normalizes pi messages for routing', () => {
    const mapped = mapContextMessages([
      userMessage('hello'),
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'answer' },
        ],
        api: 'openai-responses',
        provider: 'openai',
        model: 'gpt-4o-mini',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: 2,
      },
    ]);

    expect(mapped[0]).toEqual({ role: 'user', content: 'hello' });
    expect(mapped[1]?.content).toContain('hmm');
    expect(mapped[1]?.content).toContain('answer');
  });

  it('buildRoutingRequest maps session and turn metadata', () => {
    const context = makeContext([userMessage('route me')]);
    const request = buildRoutingRequest(context, { sessionId: 'sess-42' });

    expect(request.session_id).toBe('sess-42');
    expect(request.prompt_text).toBe('route me');
    expect(request.turn_type).toBe('main_loop');
    expect(request.messages).toHaveLength(1);
    expect(request.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe('createStreamSimple', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

  beforeEach(() => {
    mockDelegateStreamSimple.mockReset();
    warnSpy.mockClear();
    infoSpy.mockClear();
  });

  afterEach(() => {
    warnSpy.mockClear();
    infoSpy.mockClear();
  });

  it('delegates to the routed registry model and forwards stream events', async () => {
    const target = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

    const dispatch = vi.fn(async (request: RoutingRequest) => {
      expect(request.prompt_text).toBe('hello');
      return makeDecision({ selected_model_id: 'gpt-4o-mini' });
    });

    const streamSimple = createStreamSimple({
      router: createMockRouter(dispatch),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
    });

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(dispatch).toHaveBeenCalledOnce();
    expect(mockDelegateStreamSimple).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ messages: expect.any(Array) }),
      undefined,
    );
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(
      '[smart-router] routing decision',
      expect.stringContaining('gpt-4o-mini'),
    );
  });

  it('falls back to safe cloud default when routing throws', async () => {
    const fallback = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(fallback));

    const streamSimple = createStreamSimple({
      router: createMockRouter(vi.fn(async () => {
        throw new Error('routing unavailable');
      })),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
    });

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledWith(fallback, expect.any(Object), undefined);
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] routing failed, using safe cloud default',
      'routing unavailable',
    );
  });

  it('falls back when routed model is missing from the registry', async () => {
    const fallback = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(fallback));

    const streamSimple = createStreamSimple({
      router: createMockRouter(vi.fn(async () => makeDecision({ selected_model_id: 'missing-model' }))),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
    });

    await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] routed model not found in registry',
      'missing-model',
    );
    expect(mockDelegateStreamSimple).toHaveBeenCalledWith(fallback, expect.any(Object), undefined);
  });

  it('falls back when stream delegation fails', async () => {
    const target = registryModels[1]!;
    const fallback = registryModels[0]!;
    mockDelegateStreamSimple
      .mockImplementationOnce(() => {
        throw new Error('stream broke');
      })
      .mockImplementationOnce(() => makeSuccessStream(fallback));

    const streamSimple = createStreamSimple({
      router: createMockRouter(vi.fn(async () => makeDecision({ selected_model_id: 'claude-opus' }))),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
    });

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledTimes(2);
    expect(mockDelegateStreamSimple.mock.calls[0]?.[0]).toEqual(target);
    expect(mockDelegateStreamSimple.mock.calls[1]?.[0]).toEqual(fallback);
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] stream delegation failed, using safe cloud default',
      'stream broke',
    );
  });

  it('emits aborted error when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const streamSimple = createStreamSimple({
      router: createMockRouter(vi.fn(async () => makeDecision())),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
    });

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')]), {
        signal: controller.signal,
      }),
    );

    expect(mockDelegateStreamSimple).not.toHaveBeenCalled();
    const errorEvent = events.find((event) => event.type === 'error');
    expect(errorEvent?.type).toBe('error');
    if (errorEvent?.type === 'error') {
      expect(errorEvent.reason).toBe('aborted');
      expect(errorEvent.error.stopReason).toBe('aborted');
    }
  });
});

describe('initHydraMatcher (SP-044)', () => {
  function makeMockProvider(requirements: RequirementVector): EmbeddingProvider {
    return {
      extractRequirements: vi.fn(async () => requirements),
      dispose: vi.fn(async () => {}),
    };
  }

  it('constructs HydraMatcher when ONNX provider loads', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = makeMockProvider({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
    const createOnnxEmbeddingProvider = vi.fn(async () => provider);

    const matcher = await initHydraMatcher({ createOnnxEmbeddingProvider });

    expect(matcher).toBeInstanceOf(HydraMatcher);
    expect(createOnnxEmbeddingProvider).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns undefined and logs once when provider init fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const createOnnxEmbeddingProvider = vi.fn(async () => {
      throw new Error('ONNX embedding requires @huggingface/transformers');
    });

    const matcher = await initHydraMatcher({ createOnnxEmbeddingProvider });

    expect(matcher).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] HyDRA matcher disabled',
      'ONNX embedding requires @huggingface/transformers',
    );
    warnSpy.mockRestore();
  });
});

describe('extension hydra routing (SP-044)', () => {
  function makeMockProvider(requirements: RequirementVector): EmbeddingProvider {
    return {
      extractRequirements: vi.fn(async () => requirements),
      dispose: vi.fn(async () => {}),
    };
  }

  it('routes ambiguous prompts through hydra_match when matcher is configured', async () => {
    const provider = makeMockProvider({ reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 });
    const hydraMatcher = new HydraMatcher(provider, {
      artifactCachePath: '.pi-smart-router/models/',
    });
    const router = createRouterFromFleet(fleet, { hydraMatcher });
    const request = buildRoutingRequest(
      makeContext([userMessage('Hello, how are you today?')]),
      { sessionId: 'hydra-ext-001' },
    );

    const decision = await router.dispatch.dispatch(request);

    expect(decision.stage).toBe('hydra_match');
    expect(decision.reason_code).toBe('hydra_embedding_match');
    expect(fleet.map((profile) => profile.id)).toContain(decision.selected_model_id);
  });

  it('falls back to safe cloud default when matcher is not configured', async () => {
    const router = createRouterFromFleet(fleet);
    const request = buildRoutingRequest(
      makeContext([userMessage('Hello, how are you today?')]),
      { sessionId: 'hydra-ext-002' },
    );

    const decision = await router.dispatch.dispatch(request);

    expect(decision.stage).toBe('fallback');
    expect(decision.reason_code).toBe('safe_cloud_default');
    expect(decision.selected_model_id).toBe('gpt-4o-mini');
  });
});
