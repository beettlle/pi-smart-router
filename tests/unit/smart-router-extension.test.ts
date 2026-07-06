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
  formatLmuStatus,
  initHydraMatcher,
} from '../../.pi/extensions/smart-router/fleet-bootstrap.js';
import * as fleetBootstrap from '../../.pi/extensions/smart-router/fleet-bootstrap.js';
import { registerSmartRouterCommand } from '../../.pi/extensions/smart-router/commands.js';
import {
  isSmartRouterActive,
  setupSessionHooks,
} from '../../.pi/extensions/smart-router/session-lifecycle.js';
import type { SmartRouterRuntime } from '../../.pi/extensions/smart-router/types.js';
import {
  buildRoutingRequest,
  deriveTurnType,
  extractPromptText,
  mapContextMessages,
} from '../../.pi/extensions/smart-router/routing-context.js';
import {
  GEMINI_TOOL_HISTORY_EXCLUDED,
  GeminiToolHistoryEmptyFleetError,
  resolveEffectiveFleet,
} from '../../src/domain/routing/tool-history-guard.js';
import {
  createStreamSimple,
  logRoutingDecision,
  resolveDelegationOptions,
} from '../../.pi/extensions/smart-router/stream-delegation.js';
import { routeAndDelegate } from '../../.pi/extensions/smart-router/route-and-delegate.js';
import { resolveRegistryModel } from '../../.pi/extensions/smart-router/delegation-runtime.js';
import type { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { createRouterFromFleet } from '../../src/index.js';
import { mapFleetFromRegistry, mapPiModelToProfile } from '../../src/config/pi-model-mapper.js';
import { LifecycleHookState } from '../../src/index.js';
import { ExecutionLedger } from '../../src/domain/delegation/execution-ledger.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import {
  HydraMatcher,
  type EmbeddingProvider,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import type { RouterHandle } from '../../src/index.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';

const { mockDelegateStreamSimple } = vi.hoisted(() => ({
  mockDelegateStreamSimple: vi.fn(),
}));

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
  makeProfile({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
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
  makeRegistryModel({ provider: 'google', id: 'gemini-flash', api: 'google-generative-ai' }),
  makeRegistryModel({ provider: 'anthropic', id: 'claude-opus', api: 'anthropic-messages' }),
  makeRegistryModel({ provider: 'ollama', id: 'local-llama', api: 'openai-completions' }),
];

function createMockRegistry(
  models: Model<Api>[],
  authByKey?: Record<string, { apiKey: string; headers?: Record<string, string> }>,
): ModelRegistry {
  return {
    find(provider: string, id: string) {
      return models.find((model) => model.provider === provider && model.id === id);
    },
    getAvailable() {
      return models;
    },
    async getApiKeyAndHeaders(model: Model<Api>) {
      const key = `${model.provider}/${model.id}`;
      const configured = authByKey?.[key];
      return {
        ok: true as const,
        apiKey: configured?.apiKey ?? `${model.provider}-delegation-key`,
        headers: configured?.headers,
        env: undefined,
      };
    },
  } as unknown as ModelRegistry;
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

function makeStreamDeps(
  overrides: Partial<{
    router: RouterHandle;
    modelRegistry: ModelRegistry;
    fleet: ModelProfile[];
    executionLedger: ExecutionLedger;
    ensureFleetFresh: () => Promise<void>;
    onRoutingDecision: (decision: RoutingDecision) => void;
    onDelegatedModel: (model: { provider: string; id: string }) => void;
  }> = {},
) {
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

function makeErrorStream(model: Model<Api>, errorMessage: string) {
  const stream = createAssistantMessageEventStream();
  const errorMessageObj: AssistantMessage = {
    ...makeAssistantPartial(model),
    content: [],
    stopReason: 'error',
    errorMessage,
  };
  void (async () => {
    stream.push({ type: 'error', reason: 'error', error: errorMessageObj });
    stream.end(errorMessageObj);
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
  it('formatLmuStatus labels the last model used', () => {
    expect(formatLmuStatus('gpt-4o-mini')).toBe('LMU: gpt-4o-mini');
    expect(formatLmuStatus('gemini-flash', { fg: (_name, text) => `[${text}]` }))
      .toBe('[LMU: gemini-flash]');
  });

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

  it('buildRoutingRequest consumes compaction lifecycle flags', () => {
    const lifecycleHookState = new LifecycleHookState();
    lifecycleHookState.markCompaction('sess-compact');

    const context = makeContext([userMessage('after compaction')]);
    const request = buildRoutingRequest(
      context,
      { sessionId: 'sess-compact' },
      lifecycleHookState,
    );

    expect(request.compaction_flag).toBe(true);
    expect(
      buildRoutingRequest(context, { sessionId: 'sess-compact' }, lifecycleHookState)
        .compaction_flag,
    ).toBeUndefined();
  });

  it('buildRoutingRequest consumes model_select force override', () => {
    const lifecycleHookState = new LifecycleHookState();
    lifecycleHookState.setForceModel('sess-force', 'gpt-4o');

    const context = makeContext([userMessage('forced model')]);
    const request = buildRoutingRequest(
      context,
      { sessionId: 'sess-force' },
      lifecycleHookState,
    );

    expect(request.force_model_id).toBe('gpt-4o');
  });
});

describe('createStreamSimple', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

  beforeEach(() => {
    mockDelegateStreamSimple.mockReset();
    warnSpy.mockClear();
    infoSpy.mockClear();
    delete process.env.SMART_ROUTER_LOG_ROUTING;
  });

  afterEach(() => {
    warnSpy.mockClear();
    infoSpy.mockClear();
    delete process.env.SMART_ROUTER_LOG_ROUTING;
  });

  it('delegates to the routed registry model and forwards stream events', async () => {
    const target = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

    const dispatch = vi.fn(async (request: RoutingRequest) => {
      expect(request.prompt_text).toBe('hello');
      return makeDecision({ selected_model_id: 'gpt-4o-mini' });
    });

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(dispatch),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(dispatch).toHaveBeenCalledOnce();
    expect(mockDelegateStreamSimple).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ messages: expect.any(Array) }),
      expect.objectContaining({ apiKey: 'openai-delegation-key' }),
    );
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(
      '[smart-router] routing decision',
      expect.any(String),
    );
  });

  it('falls back to safe cloud default when routing throws', async () => {
    const fallback = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(fallback));

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(vi.fn(async () => {
        throw new Error('routing unavailable');
      })),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledWith(
      fallback,
      expect.any(Object),
      expect.objectContaining({ apiKey: 'openai-delegation-key' }),
    );
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] routing failed, using safe cloud default',
      'routing unavailable',
    );
  });

  it('falls back when routed model is missing from the registry', async () => {
    const fallback = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(fallback));

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(vi.fn(async () => makeDecision({ selected_model_id: 'missing-model' }))),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

    await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] routed model not found in registry',
      'missing-model',
    );
    expect(mockDelegateStreamSimple).toHaveBeenCalledWith(
      fallback,
      expect.any(Object),
      expect.objectContaining({ apiKey: 'openai-delegation-key' }),
    );
  });

  it('falls back when stream delegation fails', async () => {
    const target = registryModels[2]!;
    mockDelegateStreamSimple
      .mockImplementationOnce(() => {
        throw new Error('stream broke');
      })
      .mockImplementationOnce((model) => makeSuccessStream(model));

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(vi.fn(async () => makeDecision({ selected_model_id: 'claude-opus' }))),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledTimes(2);
    expect(mockDelegateStreamSimple.mock.calls[0]?.[0]).toEqual(target);
    expect(mockDelegateStreamSimple.mock.calls[1]?.[0].id).not.toBe('claude-opus');
    expect(events.some((event) => event.type === 'done')).toBe(true);

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent?.type).toBe('done');
    if (doneEvent?.type === 'done') {
      const textBlock = doneEvent.message?.content[0];
      expect(textBlock?.type).toBe('text');
      if (textBlock?.type === 'text') {
        expect(textBlock.text).toContain('⚠️ **pi-smart-router failover:** `claude-opus` failed (stream broke). Retrying with');
      }
    }

    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] stream delegation failed, failing over',
      'stream broke',
    );
  });

  it('uses target provider auth instead of smart-router caller apiKey', async () => {
    const target = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(vi.fn(async () => makeDecision({ selected_model_id: 'gpt-4o-mini' }))),
      modelRegistry: createMockRegistry(registryModels, {
        'openai/gpt-4o-mini': { apiKey: 'real-openai-key' },
      }),
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

    await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')]), {
        apiKey: 'local',
        sessionId: 'sess-delegate-auth',
      }),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledWith(
      target,
      expect.any(Object),
      expect.objectContaining({
        apiKey: 'real-openai-key',
        sessionId: 'sess-delegate-auth',
      }),
    );
    expect(mockDelegateStreamSimple.mock.calls[0]?.[2]?.apiKey).not.toBe('local');
  });

  it('emits error when target provider auth is missing', async () => {
    const registry = {
      find(provider: string, id: string) {
        return registryModels.find((model) => model.provider === provider && model.id === id);
      },
      getAvailable() {
        return registryModels;
      },
      async getApiKeyAndHeaders() {
        return { ok: false as const, error: 'No API key found for "openai"' };
      },
    } as unknown as ModelRegistry;

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(vi.fn(async () => makeDecision({ selected_model_id: 'gpt-4o-mini' }))),
      modelRegistry: registry,
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')]), { apiKey: 'local' }),
    );

    expect(mockDelegateStreamSimple).not.toHaveBeenCalled();
    const errorEvent = events.find((event) => event.type === 'error');
    expect(errorEvent?.type).toBe('error');
    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.errorMessage).toContain('No API key found for "openai"');
    }
  });

  it('emits aborted error when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(vi.fn(async () => makeDecision())),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

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

  it('rewrites virtual router history before delegating to preserve replay identity', async () => {
    const target = registryModels[1]!;
    const signature = 'dGhvdWdodC1zaWduYXR1cmU=';
    mockDelegateStreamSimple.mockImplementation((_model, context: Context) => {
      const assistant = context.messages.find((message: Message) => message.role === 'assistant');
      expect(assistant?.role).toBe('assistant');
      if (assistant?.role === 'assistant') {
        expect(assistant.provider).toBe('google');
        expect(assistant.model).toBe('gemini-flash');
        const toolCall = assistant.content[0];
        if (toolCall?.type === 'toolCall') {
          expect(toolCall.thoughtSignature).toBe(signature);
        }
      }
      return makeSuccessStream(target);
    });

    const streamSimple = createStreamSimple(
      makeStreamDeps({
        router: createMockRouter(
          vi.fn(async () => makeDecision({ selected_model_id: 'gemini-flash' })),
        ),
      }),
    );

    await collectEvents(
      streamSimple(
        makeAutoModel(),
        makeContext([
          userMessage('search scuba tanks'),
          {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: 'call-1',
                name: 'web_search',
                arguments: { query: 'scuba' },
                thoughtSignature: signature,
              },
            ],
            api: 'openai-responses',
            provider: 'smart-router',
            model: 'auto',
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'toolUse',
            timestamp: 2,
          },
          toolResultMessage('results'),
        ]),
        { sessionId: 'replay-sess-1' },
      ),
    );
  });

  it('records success outcome and execution ledger after delegated stream completes', async () => {
    const target = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));
    const router = createMockRouter(
      vi.fn(async () => makeDecision({ selected_model_id: 'gpt-4o-mini' })),
    );
    const recordOutcome = vi.spyOn(router.dispatch, 'recordOutcome');
    const executionLedger = new ExecutionLedger();
    const onDelegatedModel = vi.fn();

    const streamSimple = createStreamSimple(
      makeStreamDeps({ router, executionLedger, onDelegatedModel }),
    );

    await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')]), {
        sessionId: 'ledger-sess-1',
      }),
    );

    expect(recordOutcome).toHaveBeenCalledWith('gpt-4o-mini');
    expect(onDelegatedModel).toHaveBeenCalledWith({
      provider: 'openai',
      id: 'gpt-4o-mini',
    });
    expect(executionLedger.getLastExecution('ledger-sess-1')).toEqual({
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-4o-mini',
    });
  });

  it('fails over on infra stream errors within the same tier', async () => {
    const primary = registryModels[0]!;
    const alternate = registryModels[1]!;
    const errorMessage = JSON.stringify({
      error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' },
    });

    mockDelegateStreamSimple
      .mockImplementationOnce(() => makeErrorStream(primary, errorMessage))
      .mockImplementationOnce(() => makeSuccessStream(alternate));

    const router = createMockRouter(
      vi.fn(async () =>
        makeDecision({
          selected_model_id: 'gpt-4o-mini',
          tier: 'economical-cloud',
        }),
      ),
    );
    const recordOutcome = vi.spyOn(router.dispatch, 'recordOutcome');

    const streamSimple = createStreamSimple(makeStreamDeps({ router }));

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledTimes(2);
    expect(mockDelegateStreamSimple.mock.calls[0]?.[0]).toEqual(primary);
    expect(mockDelegateStreamSimple.mock.calls[1]?.[0]).toEqual(alternate);
    expect(recordOutcome).toHaveBeenCalledWith(
      'gpt-4o-mini',
      expect.objectContaining({ statusCode: 503 }),
    );
    expect(events.some((event) => event.type === 'done')).toBe(true);
    
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent?.type).toBe('done');
    if (doneEvent?.type === 'done') {
      const textBlock = doneEvent.message?.content[0];
      expect(textBlock?.type).toBe('text');
      if (textBlock?.type === 'text') {
        expect(textBlock.text).toContain('⚠️ **pi-smart-router failover:** `gpt-4o-mini` failed');
        expect(textBlock.text).toContain('Retrying with `gemini-flash`...');
      }
    }

    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] infra error, failing over to alternate model',
      'gemini-flash',
    );
  });

  it('does not failover on Gemini thought_signature 400 errors', async () => {
    const primary = registryModels[1]!;
    const errorMessage = JSON.stringify({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'Function call is missing a thought_signature',
      },
    });

    mockDelegateStreamSimple.mockImplementationOnce(() => makeErrorStream(primary, errorMessage));

    const router = createMockRouter(
      vi.fn(async () =>
        makeDecision({
          selected_model_id: 'gemini-flash',
          tier: 'economical-cloud',
        }),
      ),
    );

    const streamSimple = createStreamSimple(makeStreamDeps({ router }));

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalledWith(
      '[smart-router] infra error, failing over to alternate model',
      expect.anything(),
    );

    const errorEvent = events.find((event) => event.type === 'error');
    expect(errorEvent?.type).toBe('error');
    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.errorMessage).toContain('thought_signature');
      expect(errorEvent.error.errorMessage).toContain('/new');
      expect(errorEvent.error.errorMessage).not.toContain('failover');
    }
  });

  it('sanitizes terminal infra errors when no failover alternate exists', async () => {
    const primary = registryModels[0]!;
    const doubleWrapped = JSON.stringify({
      error: {
        message: JSON.stringify({
          error: {
            code: 503,
            message: 'This model is currently experiencing high demand.',
            status: 'UNAVAILABLE',
          },
        }),
        code: 503,
        status: 'Service Unavailable',
      },
    });

    mockDelegateStreamSimple.mockImplementationOnce(() => makeErrorStream(primary, doubleWrapped));

    const singleModelFleet = [fleet[1]!];
    const router = createMockRouter(
      vi.fn(async () =>
        makeDecision({
          selected_model_id: 'gpt-4o-mini',
          tier: 'economical-cloud',
        }),
      ),
      singleModelFleet,
    );

    const streamSimple = createStreamSimple(
      makeStreamDeps({ router, fleet: singleModelFleet }),
    );

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')])),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledTimes(1);
    const errorEvent = events.find((event) => event.type === 'error');
    expect(errorEvent?.type).toBe('error');
    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.errorMessage).toBe(
        '503 Service Unavailable: This model is currently experiencing high demand.',
      );
      expect(errorEvent.error.errorMessage).not.toContain('{"error"');
    }
  });

});

describe('logRoutingDecision', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.SMART_ROUTER_LOG_ROUTING;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete process.env.SMART_ROUTER_LOG_ROUTING;
  });

  it('does not log by default', () => {
    logRoutingDecision(makeDecision({ selected_model_id: 'gpt-4o-mini' }), {
      provider: 'openai',
      modelId: 'gpt-4o-mini',
      api: 'openai-responses',
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs to stderr when SMART_ROUTER_LOG_ROUTING=1', () => {
    process.env.SMART_ROUTER_LOG_ROUTING = '1';

    logRoutingDecision(makeDecision({ selected_model_id: 'gpt-4o-mini' }), {
      provider: 'openai',
      modelId: 'gpt-4o-mini',
      api: 'openai-responses',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[smart-router] routing decision',
      expect.stringContaining('gpt-4o-mini'),
    );
  });
});

describe('resolveDelegationOptions', () => {
  it('merges caller stream options with target provider auth', async () => {
    const target = registryModels[0]!;
    const registry = createMockRegistry(registryModels, {
      'openai/gpt-4o-mini': {
        apiKey: 'real-openai-key',
        headers: { 'X-Custom': 'router' },
      },
    });

    const options = await resolveDelegationOptions(registry, target, {
      apiKey: 'local',
      sessionId: 'sess-1',
      reasoning: 'medium',
    });

    expect(options.apiKey).toBe('real-openai-key');
    expect(options.headers).toEqual({ 'X-Custom': 'router' });
    expect(options.sessionId).toBe('sess-1');
    expect(options.reasoning).toBe('medium');
  });

  it('throws when target auth resolution fails', async () => {
    const registry = {
      async getApiKeyAndHeaders() {
        return { ok: false as const, error: 'missing auth' };
      },
    } as unknown as ModelRegistry;

    await expect(
      resolveDelegationOptions(registry, registryModels[0]!, { apiKey: 'local' }),
    ).rejects.toThrow('missing auth');
  });

  it('strips pi agent-loop callbacks and forwards only stream options', async () => {
    const target = registryModels[0]!;
    const registry = createMockRegistry(registryModels);
    const onPayload = vi.fn((payload: unknown) => payload);
    const onResponse = vi.fn();

    const options = await resolveDelegationOptions(registry, target, {
      apiKey: 'local',
      sessionId: 'sess-1',
      reasoning: 'medium',
      onPayload,
      onResponse,
      transformContext: vi.fn(),
      getSteeringMessages: vi.fn(),
      getFollowUpMessages: vi.fn(),
    } as Parameters<typeof resolveDelegationOptions>[2]);

    expect(options.apiKey).toBe('openai-delegation-key');
    expect(options.sessionId).toBe('sess-1');
    expect(options.reasoning).toBe('medium');
    expect(options).not.toHaveProperty('onPayload');
    expect(options).not.toHaveProperty('onResponse');
    expect(options).not.toHaveProperty('transformContext');
    expect(options).not.toHaveProperty('getSteeringMessages');
    expect(options).not.toHaveProperty('getFollowUpMessages');
  });
});

describe('delegation onPayload regression', () => {
  beforeEach(() => {
    mockDelegateStreamSimple.mockReset();
  });

  it('does not forward caller onPayload through createStreamSimple delegation', async () => {
    const target = registryModels[0]!;
    const callerOnPayload = vi.fn((payload: unknown) => payload);

    mockDelegateStreamSimple.mockImplementation((_model, _context, options) => {
      expect(options?.onPayload).toBeUndefined();
      expect(options?.onResponse).toBeUndefined();
      return makeSuccessStream(target);
    });

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(vi.fn(async () => makeDecision({ selected_model_id: 'gpt-4o-mini' }))),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

    await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('hello')]), {
        onPayload: callerOnPayload,
        onResponse: vi.fn(),
      } as Parameters<ReturnType<typeof createStreamSimple>>[2]),
    );

    expect(callerOnPayload).not.toHaveBeenCalled();
    expect(mockDelegateStreamSimple).toHaveBeenCalledOnce();
  });

  it('completes delegation when caller passes pi-style onPayload that would corrupt provider payloads', async () => {
    const target = registryModels[0]!;
    const corruptingBeforeProviderRequest = (event: { payload: unknown }) => ({
      ...event,
      provider: 'google',
      model: 'gemini-flash-latest',
    });

    mockDelegateStreamSimple.mockImplementation((_model, _context, options) => {
      expect(options?.onPayload).toBeUndefined();
      return makeSuccessStream(target);
    });

    const streamSimple = createStreamSimple(makeStreamDeps({
      router: createMockRouter(vi.fn(async () => makeDecision({ selected_model_id: 'gpt-4o-mini' }))),
      modelRegistry: createMockRegistry(registryModels),
      fleet,
      executionLedger: new ExecutionLedger(),
    }));

    const events = await collectEvents(
      streamSimple(makeAutoModel(), makeContext([userMessage('what is 2+2?')]), {
        onPayload: async (payload: unknown) =>
          corruptingBeforeProviderRequest({ payload }),
      } as Parameters<ReturnType<typeof createStreamSimple>>[2]),
    );

    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(mockDelegateStreamSimple).toHaveBeenCalledOnce();
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

describe('smart-router unpin command (SP-076)', () => {
  function createCommandHarness(sessionId = 'sess-unpin') {
    const notify = vi.fn();
    let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;

    const pi = {
      registerCommand: vi.fn((_name: string, spec: { handler: typeof handler }) => {
        handler = spec.handler;
      }),
      appendEntry: vi.fn(),
    };

    const store = new MemoryStore([]);
    const sessionPinner = new SessionPinner({ store });
    const runtime = {
      fleetMode: 'scoped' as const,
      lastDecision: undefined,
      priceCatalog: null,
      modelRegistry: createMockRegistry(registryModels),
      store,
      sessionPinner,
      executionLedger: new ExecutionLedger(),
      lifecycleHookState: new LifecycleHookState(),
      hydraMatcher: undefined,
      sessionRouting: new Map(),
      streamDeps: {
        router: createMockRouter(vi.fn(async () => makeDecision())),
        modelRegistry: createMockRegistry(registryModels),
        fleet,
        executionLedger: new ExecutionLedger(),
        sessionPinner,
        sessionRouting: new Map(),
      },
    } as unknown as SmartRouterRuntime;

    registerSmartRouterCommand(pi as never, runtime);

    const ctx = {
      cwd: '/tmp',
      sessionManager: { getSessionId: () => sessionId },
      ui: { notify },
    };

    return { handler: handler!, runtime, sessionPinner, notify, ctx, store, sessionId };
  }

  it('clears the current session pin and notifies success', async () => {
    const { handler, sessionPinner, notify, ctx, sessionId } = createCommandHarness();

    sessionPinner.recordPin(sessionId, 'gpt-4o-mini', 'initial');
    expect(sessionPinner.getPin(sessionId)).not.toBeNull();

    await handler('unpin', ctx);

    expect(sessionPinner.getPin(sessionId)).toBeNull();
    expect(notify).toHaveBeenCalledWith(
      'Cleared session pin (was gpt-4o-mini). Next request will run full routing.',
      'info',
    );
  });

  it('is a no-op when the session has no pin', async () => {
    const { handler, sessionPinner, notify, ctx, sessionId } = createCommandHarness();

    expect(sessionPinner.getPin(sessionId)).toBeNull();

    await handler('unpin', ctx);

    expect(sessionPinner.getPin(sessionId)).toBeNull();
    expect(notify).toHaveBeenCalledWith('No session pin to clear.', 'info');
  });

  it('does not clear pins for other sessions', async () => {
    const { handler, sessionPinner, notify, ctx, sessionId } = createCommandHarness('sess-current');

    sessionPinner.recordPin('sess-current', 'gpt-4o-mini', 'initial');
    sessionPinner.recordPin('sess-other', 'claude-opus', 'initial');

    await handler('unpin', ctx);

    expect(sessionPinner.getPin('sess-current')).toBeNull();
    expect(sessionPinner.getPin('sess-other')).not.toBeNull();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('Cleared session pin'),
      'info',
    );
  });
});

describe('gemini tool history guard (SP-077)', () => {
  beforeEach(() => {
    mockDelegateStreamSimple.mockClear();
  });

  it('routes tool-history sessions to non-google models via stream delegation', async () => {
    const router = createRouterFromFleet(fleet);
    const decisions: RoutingDecision[] = [];
    const target = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

    const streamSimple = createStreamSimple(
      makeStreamDeps({
        router,
        onRoutingDecision: (decision) => decisions.push(decision),
      }),
    );

    await collectEvents(
      streamSimple(
        makeAutoModel(),
        makeContext([
          userMessage('search scuba tanks'),
          {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: 'call-1',
                name: 'web_search',
                arguments: { query: 'scuba' },
              },
            ],
            api: 'openai-responses',
            provider: 'smart-router',
            model: 'auto',
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'toolUse',
            timestamp: 2,
          },
          toolResultMessage('results'),
        ]),
        { sessionId: 'tool-history-sess-1' },
      ),
    );

    expect(decisions[0]?.selected_model_id).toBe('gpt-4o-mini');
    expect(mockDelegateStreamSimple).toHaveBeenCalledOnce();
    expect(mockDelegateStreamSimple.mock.calls[0]?.[0]?.provider).toBe('openai');
  });

  it('leaves fleet unchanged for sessions without tool history', () => {
    const request = buildRoutingRequest(
      makeContext([userMessage('plain prompt')]),
      { sessionId: 'no-tool-history' },
    );

    const result = resolveEffectiveFleet(fleet, request);
    expect(result.excluded).toBe(false);
    expect(result.effectiveFleet).toEqual(fleet);
  });

  it('emits gemini_tool_history_excluded when filtering applies', () => {
    const request = buildRoutingRequest(
      makeContext([
        userMessage('search'),
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'read',
              arguments: {},
            },
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
          stopReason: 'toolUse',
          timestamp: 2,
        },
        toolResultMessage('ok'),
      ]),
      { sessionId: 'guard-reason' },
    );

    const result = resolveEffectiveFleet(
      fleet,
      request,
      makeContext([
        userMessage('search'),
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'read',
              arguments: {},
            },
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
          stopReason: 'toolUse',
          timestamp: 2,
        },
        toolResultMessage('ok'),
      ]).messages,
    );
    expect(result.reasonCode).toBe(GEMINI_TOOL_HISTORY_EXCLUDED);
  });
});

describe('gemini empty-fleet fail-safe (SP-084)', () => {
  beforeEach(() => {
    mockDelegateStreamSimple.mockClear();
  });

  it('throws actionable error for google-only fleet with tool history', async () => {
    const googleOnlyFleet = [
      makeProfile({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
    ];
    const router = createRouterFromFleet(googleOnlyFleet);
    const outer = createAssistantMessageEventStream();
    const deps = makeStreamDeps({
      router,
      fleet: googleOnlyFleet,
      modelRegistry: createMockRegistry([
        makeRegistryModel({ provider: 'google', id: 'gemini-flash', api: 'google-generative-ai' }),
      ]),
    });

    await expect(
      routeAndDelegate(
        makeContext([userMessage('search'), toolResultMessage('ok')]),
        { sessionId: 'empty-fleet-sess' },
        deps,
        outer,
      ),
    ).rejects.toThrow(GeminiToolHistoryEmptyFleetError);

    expect(mockDelegateStreamSimple).not.toHaveBeenCalled();
  });

  it('routes tool-history sessions to cursor/auto without unknown delegation', async () => {
    const cursorFleet = [
      makeProfile({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
      makeProfile({ id: 'cursor/auto', tier: 'economical-cloud', provider: 'cursor' }),
    ];
    const cursorModel = makeRegistryModel({
      provider: 'cursor',
      id: 'cursor/auto',
      api: 'openai-responses',
    });
    const router = createRouterFromFleet(cursorFleet);
    const decisions: RoutingDecision[] = [];
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(cursorModel));

    const streamSimple = createStreamSimple(
      makeStreamDeps({
        router,
        fleet: cursorFleet,
        modelRegistry: createMockRegistry([
          cursorModel,
          makeRegistryModel({
            provider: 'google',
            id: 'gemini-flash',
            api: 'google-generative-ai',
          }),
        ]),
        onRoutingDecision: (decision) => decisions.push(decision),
      }),
    );

    await collectEvents(
      streamSimple(
        makeAutoModel(),
        makeContext([userMessage('search'), toolResultMessage('ok')]),
        { sessionId: 'cursor-auto-sess' },
      ),
    );

    expect(decisions[0]?.selected_model_id).not.toBe('unknown');
    expect(decisions[0]?.selected_model_id).toBe('cursor/auto');
    expect(mockDelegateStreamSimple).toHaveBeenCalledOnce();
    expect(mockDelegateStreamSimple.mock.calls[0]?.[0]?.id).toBe('cursor/auto');
  });
});

describe('cursor model delegation (SP-086)', () => {
  beforeEach(() => {
    mockDelegateStreamSimple.mockClear();
  });

  it('resolveRegistryModel finds cursor/auto from mapped profile', () => {
    const profile = mapPiModelToProfile({ provider: 'cursor', id: 'cursor/auto' });
    const cursorModel = makeRegistryModel({
      provider: 'cursor',
      id: 'cursor/auto',
      api: 'openai-responses',
    });

    expect(resolveRegistryModel(createMockRegistry([cursorModel]), profile)).toEqual(cursorModel);
  });

  it('resolveRegistryModel finds composer-latest from mapped profile', () => {
    const profile = mapPiModelToProfile({ provider: 'cursor', id: 'composer-latest' });
    const composerModel = makeRegistryModel({
      provider: 'cursor',
      id: 'composer-latest',
      api: 'openai-responses',
    });

    expect(resolveRegistryModel(createMockRegistry([composerModel]), profile)).toEqual(
      composerModel,
    );
  });

  it('delegates stream to composer-latest when router selects it', async () => {
    const cursorFleet = mapFleetFromRegistry([
      { provider: 'cursor', id: 'composer-latest' },
      { provider: 'google', id: 'gemini-2.5-flash' },
    ]);
    const composerModel = makeRegistryModel({
      provider: 'cursor',
      id: 'composer-latest',
      api: 'openai-responses',
    });
    const router = createRouterFromFleet(cursorFleet);
    vi.spyOn(router.dispatch, 'dispatch').mockResolvedValue(
      makeDecision({
        selected_model_id: 'composer-latest',
        tier: 'frontier-cloud',
        stage: 'hydra_match',
        reason_code: 'hydra_embedding_match',
      }),
    );
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(composerModel));

    const streamSimple = createStreamSimple(
      makeStreamDeps({
        router,
        fleet: cursorFleet,
        modelRegistry: createMockRegistry([
          composerModel,
          makeRegistryModel({
            provider: 'google',
            id: 'gemini-2.5-flash',
            api: 'google-generative-ai',
          }),
        ]),
      }),
    );

    await collectEvents(
      streamSimple(
        makeAutoModel(),
        makeContext([userMessage('implement feature')]),
        { sessionId: 'composer-delegation' },
      ),
    );

    expect(mockDelegateStreamSimple).toHaveBeenCalledOnce();
    expect(mockDelegateStreamSimple.mock.calls[0]?.[0]?.id).toBe('composer-latest');
    expect(mockDelegateStreamSimple.mock.calls[0]?.[0]?.provider).toBe('cursor');
  });

  it('delegates stream using mapped cursor/auto fleet from registry', async () => {
    const cursorFleet = mapFleetFromRegistry([
      { provider: 'google', id: 'gemini-2.5-flash' },
      { provider: 'cursor', id: 'cursor/auto' },
    ]);
    expect(cursorFleet.find((profile) => profile.id === 'cursor/auto')?.tier).toBe(
      'frontier-cloud',
    );

    const cursorModel = makeRegistryModel({
      provider: 'cursor',
      id: 'cursor/auto',
      api: 'openai-responses',
    });
    const router = createRouterFromFleet(cursorFleet);
    const decisions: RoutingDecision[] = [];
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(cursorModel));

    const streamSimple = createStreamSimple(
      makeStreamDeps({
        router,
        fleet: cursorFleet,
        modelRegistry: createMockRegistry([
          cursorModel,
          makeRegistryModel({
            provider: 'google',
            id: 'gemini-2.5-flash',
            api: 'google-generative-ai',
          }),
        ]),
        onRoutingDecision: (decision) => decisions.push(decision),
      }),
    );

    await collectEvents(
      streamSimple(
        makeAutoModel(),
        makeContext([userMessage('search'), toolResultMessage('ok')]),
        { sessionId: 'mapped-cursor-auto' },
      ),
    );

    expect(decisions[0]?.selected_model_id).toBe('cursor/auto');
    expect(mockDelegateStreamSimple).toHaveBeenCalledOnce();
    expect(mockDelegateStreamSimple.mock.calls[0]?.[0]?.id).toBe('cursor/auto');
  });
});

describe('ensureFleetFresh before routed turn (SP-087)', () => {
  beforeEach(() => {
    mockDelegateStreamSimple.mockClear();
  });

  it('refreshes fleet when ensureFleetFresh hook is wired', async () => {
    const registryModels = [
      makeRegistryModel({ provider: 'openai', id: 'gpt-4o-mini', api: 'openai-responses' }),
    ];
    const fleetProfiles = fleet.filter((profile) => profile.id === 'gpt-4o-mini');
    const router = createMockRouter(vi.fn(async () => makeDecision()));
    const targetModel = registryModels[0]!;
    mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(targetModel));

    let ensureCalls = 0;
    const deps = makeStreamDeps({
      router,
      fleet: fleetProfiles,
      modelRegistry: createMockRegistry(registryModels),
      ensureFleetFresh: async () => {
        ensureCalls += 1;
      },
    });

    await routeAndDelegate(
      makeContext([userMessage('hello')]),
      { sessionId: 'ensure-fresh' },
      deps,
      createAssistantMessageEventStream(),
    );

    expect(ensureCalls).toBe(1);
    expect(mockDelegateStreamSimple).toHaveBeenCalledOnce();
  });
});

describe('LMU active-provider gate (SP-088)', () => {
  type SessionHookName = 'session_start' | 'model_select' | 'session_shutdown';

  function createSessionHookHarness(initialModel: Model<Api> = makeAutoModel()) {
    const handlers: Record<SessionHookName, Array<(event: unknown, ctx: unknown) => unknown>> = {
      session_start: [],
      model_select: [],
      session_shutdown: [],
    };

    const pi = {
      on(event: string, handler: unknown) {
        if (event in handlers) {
          handlers[event as SessionHookName].push(handler as (event: unknown, ctx: unknown) => unknown);
        }
      },
    };

    const setStatus = vi.fn();
    const store = new MemoryStore([]);
    const sessionPinner = new SessionPinner({ store });
    const executionLedger = new ExecutionLedger();
    const runtime = {
      fleetMode: 'scoped' as const,
      lastDecision: makeDecision({ selected_model_id: 'gpt-4o-mini' }),
      priceCatalog: null,
      modelRegistry: createMockRegistry(registryModels),
      store,
      sessionPinner,
      executionLedger,
      lifecycleHookState: new LifecycleHookState(),
      hydraMatcher: undefined,
      sessionRouting: new Map(),
      streamDeps: {
        router: createMockRouter(vi.fn(async () => makeDecision())),
        modelRegistry: createMockRegistry(registryModels),
        fleet,
        executionLedger,
      },
    } as unknown as SmartRouterRuntime;

    setupSessionHooks(pi as never, runtime, sessionPinner, { fn: undefined });

    const ctx = {
      cwd: '/tmp',
      model: initialModel,
      modelRegistry: createMockRegistry(registryModels),
      sessionManager: {
        getSessionId: () => 'sess-lmu',
        getEntries: () => [],
      },
      ui: {
        setStatus,
        notify: vi.fn(),
        theme: undefined,
      },
    };

    return {
      handlers,
      setStatus,
      runtime,
      executionLedger,
      ctx,
      async fireSessionStart() {
        await handlers.session_start[0]!({}, ctx);
      },
      fireModelSelect(model: Model<Api>) {
        handlers.model_select[0]!({ source: 'set', model }, ctx);
      },
    };
  }

  beforeEach(() => {
    vi.spyOn(fleetBootstrap, 'bindSharedModelRegistry').mockImplementation(() => {});
    vi.spyOn(fleetBootstrap, 'rebuildFleet').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isSmartRouterActive is true only for smart-router/auto', () => {
    expect(isSmartRouterActive({ provider: 'smart-router', id: 'auto' })).toBe(true);
    expect(isSmartRouterActive({ provider: 'cursor', id: 'auto' })).toBe(false);
    expect(isSmartRouterActive({ provider: 'smart-router', id: 'manual' })).toBe(false);
  });

  it('restores LMU on session_start when active model is smart-router/auto', async () => {
    const harness = createSessionHookHarness(makeAutoModel());
    harness.executionLedger.recordSuccess('sess-lmu', {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-4o-mini',
    });

    await harness.fireSessionStart();

    expect(harness.setStatus).toHaveBeenCalledWith(
      'smart-router-lmu',
      formatLmuStatus('gpt-4o-mini'),
    );
  });

  it('clears LMU on session_start when active model is not smart-router/auto', async () => {
    const cursorModel = makeRegistryModel({
      provider: 'cursor',
      id: 'auto',
      api: 'openai-responses',
    });
    const harness = createSessionHookHarness(cursorModel);
    harness.executionLedger.recordSuccess('sess-lmu', {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gpt-4o-mini',
    });

    await harness.fireSessionStart();

    expect(harness.setStatus).toHaveBeenCalledWith('smart-router-lmu', undefined);
    expect(harness.setStatus).not.toHaveBeenCalledWith(
      'smart-router-lmu',
      formatLmuStatus('gpt-4o-mini'),
    );
  });

  it('clears LMU immediately on model_select away from smart-router/auto', async () => {
    const harness = createSessionHookHarness(makeAutoModel());
    await harness.fireSessionStart();
    harness.setStatus.mockClear();

    const cursorModel = makeRegistryModel({
      provider: 'cursor',
      id: 'auto',
      api: 'openai-responses',
    });
    harness.fireModelSelect(cursorModel);

    expect(harness.setStatus).toHaveBeenCalledWith('smart-router-lmu', undefined);
  });

  it('restores LMU on model_select when switching to smart-router/auto', async () => {
    const cursorModel = makeRegistryModel({
      provider: 'cursor',
      id: 'auto',
      api: 'openai-responses',
    });
    const harness = createSessionHookHarness(cursorModel);
    await harness.fireSessionStart();
    harness.setStatus.mockClear();

    harness.executionLedger.recordSuccess('sess-lmu', {
      provider: 'openai',
      api: 'openai-responses',
      id: 'gemini-flash',
    });
    harness.fireModelSelect(makeAutoModel());

    expect(harness.setStatus).toHaveBeenCalledWith(
      'smart-router-lmu',
      formatLmuStatus('gemini-flash'),
    );
  });

  it('setLmuStatus no-ops when active model is not smart-router/auto', async () => {
    const cursorModel = makeRegistryModel({
      provider: 'cursor',
      id: 'auto',
      api: 'openai-responses',
    });
    const harness = createSessionHookHarness(cursorModel);
    await harness.fireSessionStart();
    harness.setStatus.mockClear();

    harness.runtime.setLmuStatus?.('gpt-4o-mini');

    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it('setLmuStatus updates footer when active model is smart-router/auto', async () => {
    const harness = createSessionHookHarness(makeAutoModel());
    await harness.fireSessionStart();
    harness.setStatus.mockClear();

    harness.runtime.setLmuStatus?.('claude-opus');

    expect(harness.setStatus).toHaveBeenCalledWith(
      'smart-router-lmu',
      formatLmuStatus('claude-opus'),
    );
  });
});
