/**
 * SP-043 — Pi extension integration tests.
 *
 * Exercises the extension entry-point flow without a running pi instance:
 * mock registry models → pi-model-mapper → createRouterFromFleet → routing
 * decision → stream delegation to the resolved registry target.
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildRoutingRequest,
  createDispatchOptions,
  createExtensionDatasetRecorder,
  createExtensionOutcomeRecorder,
  createStreamSimple,
  getRoutingFeatureSidecar,
} from '../../.pi/extensions/smart-router/index.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import type { ClusterMatcher } from '../../src/domain/matching/cluster-matcher.js';
import { mapFleetFromRegistry,
  mapPiModelToProfile,
  resetBenchmarkProfilesCacheForTests,
  setBenchmarkProfilesPathForTests,
  DEFAULT_BENCHMARK_PROFILES_PATH,
  type PiModelInput,
} from '../../src/config/pi-model-mapper.js';
import {
  HydraMatcher,
  type EmbeddingProvider,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import type { ModelProfile, RoutingDecision } from '../../src/domain/types/index.js';
import type { SystemInfo } from '../../src/infrastructure/hardware/hardware-probe.js';
import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import {
  DEFAULT_LOCAL_CONFIG,
  type HttpFetchPort,
} from '../../src/infrastructure/local/local-zero-tier.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import { SqliteStore } from '../../src/infrastructure/persistence/sqlite-store.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import { createRouterFromFleet, LifecycleHookState } from '../../src/index.js';
import { ExecutionLedger } from '../../src/domain/delegation/execution-ledger.js';

const { mockDelegateStreamSimple } = vi.hoisted(() => ({
  mockDelegateStreamSimple: vi.fn(),
}));

function withDelegateStream<T extends Record<string, unknown>>(deps: T) {
  return { ...deps, delegateStream: mockDelegateStreamSimple };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const REGISTRY_MODELS: PiModelInput[] = [
  { provider: 'anthropic', id: 'claude-3.5-sonnet', name: 'Claude Sonnet' },
  { provider: 'openai', id: 'gpt-5-mini', name: 'GPT-5 Mini' },
  { provider: 'google', id: 'gemini-2.5-flash', name: 'Gemini Flash' },
  { provider: 'ollama', id: 'llama3.2:3b', name: 'Llama 3.2' },
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

const piRegistryModels: Model<Api>[] = [
  makeRegistryModel({ provider: 'anthropic', id: 'claude-3.5-sonnet', api: 'anthropic-messages' }),
  makeRegistryModel({ provider: 'openai', id: 'gpt-5-mini', api: 'openai-responses' }),
  makeRegistryModel({ provider: 'google', id: 'gemini-2.5-flash', api: 'openai-responses' }),
  makeRegistryModel({ provider: 'ollama', id: 'llama3.2:3b', api: 'openai-completions' }),
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
        apiKey: `${model.provider}-integration-key`,
        headers: undefined,
        env: undefined,
      };
    },
  } as unknown as ModelRegistry;
}

function userMessage(content: string): Message {
  return { role: 'user', content, timestamp: Date.now() };
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

function makeAssistantPartial(model: Model<Api>): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'routed response' }],
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

function fleetIds(fleet: readonly ModelProfile[]): string[] {
  return fleet.map((profile) => profile.id);
}

// ─── Mapper integration ──────────────────────────────────────────────────────

describe('Pi extension integration (SP-043)', () => {
  describe('mapPiModelToProfile classifies major model families', () => {
    it('maps Claude sonnet to frontier-cloud', () => {
      const profile = mapPiModelToProfile({ provider: 'anthropic', id: 'claude-3.5-sonnet' });

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.provider).toBe('anthropic');
      expect(profile.id).toBe('claude-3.5-sonnet');
    });

    it('maps GPT mini variants to economical-cloud', () => {
      const profile = mapPiModelToProfile({ provider: 'openai', id: 'gpt-5-mini' });

      expect(profile.tier).toBe('economical-cloud');
      expect(profile.provider).toBe('openai');
    });

    it('maps Gemini flash to economical-cloud', () => {
      const profile = mapPiModelToProfile({ provider: 'google', id: 'gemini-2.5-flash' });

      expect(profile.tier).toBe('economical-cloud');
      expect(profile.provider).toBe('google');
    });

    it('maps local ollama models to zero-tier', () => {
      const profile = mapPiModelToProfile({ provider: 'ollama', id: 'llama3.2:3b' });

      expect(profile.tier).toBe('zero-tier');
      expect(profile.endpoint).toBe('http://localhost:1234/v1');
      expect(profile.pricing.registry_key).toBe('local/free');
    });
  });

  describe('mapFleetFromRegistry builds fleet from mixed registry models', () => {
    it('produces tier-diverse fleet preserving model ids', () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);

      expect(fleet).toHaveLength(4);
      expect(fleetIds(fleet)).toEqual([
        'claude-3.5-sonnet',
        'gpt-5-mini',
        'gemini-2.5-flash',
        'llama3.2:3b',
      ]);
      expect(fleet.map((profile) => profile.tier)).toEqual([
        'frontier-cloud',
        'economical-cloud',
        'economical-cloud',
        'zero-tier',
      ]);
    });
  });

  describe('benchmark-grounded profiles (SP-136)', () => {
    afterEach(() => {
      resetBenchmarkProfilesCacheForTests();
    });

    it('maps economical models with benchmark scores instead of hardcoded 0.95 frontier defaults', () => {
      setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

      const haiku = mapPiModelToProfile({ provider: 'anthropic', id: 'claude-3.5-haiku' });
      const sonnet = mapPiModelToProfile({ provider: 'anthropic', id: 'claude-3.5-sonnet' });

      expect(haiku.capabilities.reasoning).toBeCloseTo(0.5685, 4);
      expect(haiku.capabilities.reasoning).not.toBe(0.95);
      expect(sonnet.capabilities.reasoning).toBe(0.95);
    });

    it('shortfall gate uses grounded economical capabilities from mapped fleet', async () => {
      setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

      const requirements: RequirementVector = {
        reasoning: 0.65,
        code_gen: 0.65,
        tool_use: 0.65,
      };
      const provider: EmbeddingProvider = {
        extractRequirements: vi.fn(async () => requirements),
        dispose: vi.fn(async () => {}),
      };
      const matcher = new HydraMatcher(provider, { artifactCachePath: '.pi-smart-router/models/' });

      const fleet = [
        mapPiModelToProfile({ provider: 'anthropic', id: 'claude-3.5-haiku' }),
        mapPiModelToProfile({ provider: 'anthropic', id: 'claude-3.5-sonnet' }),
      ];

      const result = await matcher.match(
        {
          request_id: 'sp136-grounded-shortfall',
          session_id: 'sess-sp136',
          prompt_text: 'Refactor the auth middleware and add integration tests',
        },
        fleet,
      );

      const haiku = result.candidates.find((candidate) => candidate.model_id === 'claude-3.5-haiku');
      const sonnet = result.candidates.find((candidate) => candidate.model_id === 'claude-3.5-sonnet');

      expect(haiku?.rejected_reason).toBe('shortfall_gate');
      expect(haiku?.shortfall).toBeGreaterThan(0);
      expect(sonnet?.rejected_reason).toBeNull();
      expect(result.selected?.model_id).toBe('claude-3.5-sonnet');
    });
  });

  describe('createRouterFromFleet with mapped fleet', () => {
    it('returns a working RouterHandle wired to the mapped catalog', () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const router = createRouterFromFleet(fleet);

      expect(router.version).toBe('pi-smart-router');
      expect(router.fleet).toBe(fleet);
      expect(router.dispatch).toBeInstanceOf(GatewayDispatch);
      expect(typeof router.register).toBe('function');
      expect(router.middleware.lifecycleHookState).toBeInstanceOf(LifecycleHookState);
    });
  });

  describe('estimated_input_tokens (SP-091)', () => {
    const originalDatasetEnv = process.env.SMART_ROUTER_DATASET;

    beforeEach(() => {
      mockDelegateStreamSimple.mockReset();
      process.env.SMART_ROUTER_DATASET = '1';
    });

    afterEach(() => {
      if (originalDatasetEnv === undefined) {
        delete process.env.SMART_ROUTER_DATASET;
      } else {
        process.env.SMART_ROUTER_DATASET = originalDatasetEnv;
      }
    });

    it('buildRoutingRequest populates estimated_input_tokens for routing dispatch', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const router = createRouterFromFleet(fleet);
      const request = buildRoutingRequest(
        makeContext([userMessage('Fix the failing integration test')]),
        { sessionId: 'ext-int-001' },
      );

      expect(request.estimated_input_tokens).toBeGreaterThan(0);

      const decision = await router.dispatch.dispatch(request);

      expect(decision.request_id).toBe(request.request_id);
      expect(decision.selected_model_id).toBeDefined();
    });

    it('stream delegation persists non-zero estimated_input_tokens', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const store = new MemoryStore();
      const datasetRecorder = createExtensionDatasetRecorder(store);
      const router = createRouterFromFleet(fleet);
      const modelRegistry = createMockRegistry(piRegistryModels);
      const target = piRegistryModels.find((model) => model.id === 'gpt-5-mini')!;
      mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

      const streamSimple = createStreamSimple(withDelegateStream({
        router,
        modelRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
        datasetRecorder,
      }));

      const shortMessages = [userMessage('First message in session')];
      await collectEvents(
        streamSimple(makeAutoModel(), makeContext(shortMessages), {
          sessionId: 'token-estimate-short',
        }),
      );

      const longMessages = [
        ...shortMessages,
        {
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text: 'Working on it' }],
          api: 'openai-responses' as Api,
          provider: 'openai' as Model<Api>['provider'],
          model: 'gpt-5-mini',
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop' as const,
          timestamp: 2,
        },
        {
          role: 'toolResult' as const,
          toolCallId: 'call-1',
          toolName: 'read',
          content: [{ type: 'text' as const, text: 'file contents here' }],
          isError: false,
          timestamp: 3,
        },
        userMessage('Continue with the fix'),
      ] satisfies Message[];

      await collectEvents(
        streamSimple(makeAutoModel(), makeContext(longMessages), {
          sessionId: 'token-estimate-long',
        }),
      );

      const rows = await store.listDatasetRecords({ limit: 10 });
      expect(rows).toHaveLength(2);
      const tokenEstimates = rows
        .map((row) => row.estimated_input_tokens)
        .filter((value): value is number => value !== null && value > 0);
      expect(tokenEstimates).toHaveLength(2);
      expect(Math.max(...tokenEstimates)).toBeGreaterThan(Math.min(...tokenEstimates));
    });
  });

  describe('routing decision resolves to a fleet model', () => {
    it('dispatches a sample request and selects a fleet member', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const router = createRouterFromFleet(fleet);
      const request = buildRoutingRequest(
        makeContext([userMessage('Fix the failing integration test')]),
        { sessionId: 'ext-int-001' },
      );

      const decision = await router.dispatch.dispatch(request);

      expect(decision.request_id).toBe(request.request_id);
      expect(decision.selected_model_id).toBeDefined();
      expect(fleetIds(fleet)).toContain(decision.selected_model_id);
      expect(decision.tier).toMatch(/^(zero-tier|economical-cloud|frontier-cloud)$/);
      expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stream delegation resolves the routed registry target', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    beforeEach(() => {
      mockDelegateStreamSimple.mockReset();
      infoSpy.mockClear();
      warnSpy.mockClear();
      delete process.env.SMART_ROUTER_LOG_ROUTING;
    });

    afterEach(() => {
      infoSpy.mockClear();
      warnSpy.mockClear();
      delete process.env.SMART_ROUTER_LOG_ROUTING;
    });

    it('delegates to the registry model matching the routing decision', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const router = createRouterFromFleet(fleet);
      const modelRegistry = createMockRegistry(piRegistryModels);

      let capturedDecision: RoutingDecision | undefined;
      const streamSimple = createStreamSimple(withDelegateStream({
        router,
        modelRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
        onRoutingDecision(decision: RoutingDecision) {
          capturedDecision = decision;
        },
      }));

      const target = piRegistryModels.find((model) => model.id === 'gpt-5-mini')!;
      mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

      const events = await collectEvents(
        streamSimple(
          makeAutoModel(),
          makeContext([userMessage('Route this coding task')]),
          { sessionId: 'ext-stream-001' },
        ),
      );

      expect(capturedDecision).toBeDefined();
      expect(fleetIds(fleet)).toContain(capturedDecision!.selected_model_id);
      expect(getRoutingFeatureSidecar(capturedDecision!)).toBeDefined();
      expect(getRoutingFeatureSidecar(capturedDecision!)!.triage).not.toBeNull();
      expect(JSON.stringify(getRoutingFeatureSidecar(capturedDecision!))).not.toContain(
        'Route this coding task',
      );

      const routedProfile = fleet.find(
        (profile) => profile.id === capturedDecision!.selected_model_id,
      );
      expect(routedProfile).toBeDefined();

      const expectedTarget = modelRegistry.find(
        routedProfile!.provider,
        routedProfile!.id,
      );
      expect(expectedTarget).toBeDefined();
      expect(mockDelegateStreamSimple).toHaveBeenCalledWith(
        expectedTarget,
        expect.objectContaining({ messages: expect.any(Array) }),
        expect.objectContaining({
          sessionId: 'ext-stream-001',
          apiKey: `${expectedTarget!.provider}-integration-key`,
        }),
      );
      expect(events.some((event) => event.type === 'done')).toBe(true);
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalledWith(
        '[smart-router] routing decision',
        expect.any(String),
      );
    });
  });

  describe('routing telemetry persistence', () => {
    beforeEach(() => {
      mockDelegateStreamSimple.mockReset();
    });

    it('persists a telemetry row after stream delegation', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const store = new MemoryStore();
      const router = createRouterFromFleet(fleet, {
        telemetryEmitter: new RoutingTelemetryEmitter({
          onRecord: (record) => store.appendTelemetry(record),
        }),
      });
      const modelRegistry = createMockRegistry(piRegistryModels);

      const target = piRegistryModels.find((model) => model.id === 'gpt-5-mini')!;
      mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

      const streamSimple = createStreamSimple(withDelegateStream({
        router,
        modelRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
      }));

      await collectEvents(
        streamSimple(
          makeAutoModel(),
          makeContext([userMessage('Persist this route')]),
          { sessionId: 'telemetry-session' },
        ),
      );

      const rows = await store.listTelemetry({ limit: 5 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.session_id).toBe('telemetry-session');
      expect(rows[0]?.selected_model_id).toBeDefined();
      expect(fleet.map((profile) => profile.id)).toContain(rows[0]?.selected_model_id);
    });
  });

  describe('routing dataset persistence (SP-058)', () => {
    const originalDatasetEnv = process.env.SMART_ROUTER_DATASET;

    beforeEach(() => {
      mockDelegateStreamSimple.mockReset();
      delete process.env.SMART_ROUTER_DATASET;
    });

    afterEach(() => {
      if (originalDatasetEnv === undefined) {
        delete process.env.SMART_ROUTER_DATASET;
      } else {
        process.env.SMART_ROUTER_DATASET = originalDatasetEnv;
      }
    });

    it('writes nothing when SMART_ROUTER_DATASET is unset', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const store = new MemoryStore();
      const datasetRecorder = createExtensionDatasetRecorder(store);
      const router = createRouterFromFleet(fleet);
      const modelRegistry = createMockRegistry(piRegistryModels);
      const target = piRegistryModels.find((model) => model.id === 'gpt-5-mini')!;
      mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

      const streamSimple = createStreamSimple(withDelegateStream({
        router,
        modelRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
        datasetRecorder,
      }));

      await collectEvents(
        streamSimple(
          makeAutoModel(),
          makeContext([userMessage('Do not persist this prompt text')]),
          { sessionId: 'dataset-off' },
        ),
      );

      const rows = await store.listDatasetRecords({ limit: 5 });
      expect(rows).toHaveLength(0);
    });

    it('persists feature fields without prompt text when SMART_ROUTER_DATASET=1', async () => {
      process.env.SMART_ROUTER_DATASET = '1';
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const store = new MemoryStore();
      const notifySpy = vi.fn();
      const datasetRecorder = createExtensionDatasetRecorder(store, notifySpy);
      const router = createRouterFromFleet(fleet);
      const modelRegistry = createMockRegistry(piRegistryModels);
      const target = piRegistryModels.find((model) => model.id === 'gpt-5-mini')!;
      mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

      const prompt = 'Persist dataset metadata only';
      const streamSimple = createStreamSimple(withDelegateStream({
        router,
        modelRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
        datasetRecorder,
      }));

      await collectEvents(
        streamSimple(
          makeAutoModel(),
          makeContext([userMessage(prompt)]),
          { sessionId: 'dataset-on' },
        ),
      );

      const rows = await store.listDatasetRecords({ limit: 5 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.triage_verdict).not.toBeNull();
      expect(rows[0]?.prompt_length_chars).toBe(prompt.length);
      expect(JSON.stringify(rows[0])).not.toContain(prompt);
      expect(rows[0]).not.toHaveProperty('prompt_text');
      expect(notifySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('outcome labels (SP-062)', () => {
    const originalDatasetEnv = process.env.SMART_ROUTER_DATASET;

    beforeEach(() => {
      process.env.SMART_ROUTER_DATASET = '1';
      mockDelegateStreamSimple.mockReset();
    });

    afterEach(() => {
      if (originalDatasetEnv === undefined) {
        delete process.env.SMART_ROUTER_DATASET;
      } else {
        process.env.SMART_ROUTER_DATASET = originalDatasetEnv;
      }
    });

    it('records model_override outcome after user model override', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const store = new MemoryStore();
      const sessionPinner = new SessionPinner({ store });
      const lifecycleHookState = new LifecycleHookState();
      const sessionRouting = new Map<string, { lastRequestId: string; lastSelectedModelId: string }>();
      const outcomeRecorder = createExtensionOutcomeRecorder(store);
      const router = createRouterFromFleet(fleet, {
        ...createDispatchOptions(store, sessionPinner),
        lifecycleHookState,
      });
      const modelRegistry = createMockRegistry(piRegistryModels);
      const target = piRegistryModels.find((model) => model.id === 'gpt-5-mini')!;
      mockDelegateStreamSimple.mockImplementation(() => makeSuccessStream(target));

      const streamSimple = createStreamSimple(withDelegateStream({
        router,
        modelRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
        lifecycleHookState,
        sessionPinner,
        sessionRouting,
        outcomeRecorder,
      }));

      await collectEvents(
        streamSimple(
          makeAutoModel(),
          makeContext([userMessage('First auto route')]),
          { sessionId: 'outcome-override' },
        ),
      );

      const firstSnapshot = sessionRouting.get('outcome-override');
      expect(firstSnapshot).toBeDefined();

      lifecycleHookState.setForceModel('outcome-override', 'claude-3.5-sonnet');
      mockDelegateStreamSimple.mockImplementation(() =>
        makeSuccessStream(piRegistryModels.find((model) => model.id === 'claude-3.5-sonnet')!),
      );

      await collectEvents(
        streamSimple(
          makeAutoModel(),
          makeContext([userMessage('Override model')]),
          { sessionId: 'outcome-override' },
        ),
      );

      const outcomes = await store.listOutcomeRecords({ sessionId: 'outcome-override' });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.signal_type).toBe('model_override');
      expect(outcomes[0]?.request_id).toBe(firstSnapshot!.lastRequestId);
      expect(outcomes[0]?.override_model_id).toBe('claude-3.5-sonnet');
      expect(JSON.stringify(outcomes[0])).not.toContain('Override model');
    });
  });

  describe('extension dispatch wiring (SP-049)', () => {
    function makeSystemInfo(overrides?: Partial<SystemInfo>): SystemInfo {
      return {
        totalMemoryGb: 16,
        arch: 'arm64',
        platform: 'darwin',
        batteryLevel: 80,
        isOnAcPower: true,
        ...overrides,
      };
    }

    const readyFetch: HttpFetchPort = {
      fetch: async (url) => {
        if (url.includes('/v1/models')) {
          return { ok: true, json: async () => ({ data: [{ id: 'llama3.2:3b' }] }) };
        }
        if (url.includes('/api/tags')) {
          return { ok: true, json: async () => ({ models: [{ name: 'llama3.2' }] }) };
        }
        throw new Error('ECONNREFUSED');
      },
    };

    it('createDispatchOptions passes hardware, local, loop escalation, and rate limiter settings', () => {
      const sessionPinner = new SessionPinner();
      const sqliteStore = new SqliteStore({ dbPath: ':memory:', models: [] });
      const options = createDispatchOptions(sqliteStore, sessionPinner);

      expect(options.hardwareConfig).toEqual(DEFAULT_OPERATOR_CONFIG.local);
      expect(options.localConfig).toEqual(DEFAULT_LOCAL_CONFIG);
      expect(options.loopEscalationConfig).toEqual(DEFAULT_OPERATOR_CONFIG.loop_escalation);
      expect(options.systemInfoProvider).toBeTypeOf('function');
      expect(options.rateLimiter).toBeDefined();
      expect(options.rateLimiter?.consumeToken).toBeTypeOf('function');

      sqliteStore.close();
    });

    it('omits rateLimiter when the extension store is not SQLite-backed', () => {
      const sessionPinner = new SessionPinner();
      const memoryStore = new MemoryStore([]);
      const options = createDispatchOptions(memoryStore, sessionPinner);

      expect(options.rateLimiter).toBeUndefined();
    });

    it('routes to zero-tier using extension-equivalent dispatch options', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const sessionPinner = new SessionPinner();
      const sqliteStore = new SqliteStore({ dbPath: ':memory:', models: [] });
      const baseOptions = createDispatchOptions(sqliteStore, sessionPinner);
      const router = createRouterFromFleet(fleet, {
        ...baseOptions,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 16 })),
        httpFetchPort: readyFetch,
      });

      const decision = await router.dispatch.dispatch(
        buildRoutingRequest(
          makeContext([userMessage('Format this JSON file')]),
          { sessionId: 'ext-wiring-001' },
        ),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.selected_model_id).toBe('llama3.2:3b');
      expect(decision.reason_code).toBe('local_model_ready');

      sqliteStore.close();
    });

    it('routes ambiguous Q&A to local_zero on fresh session when local is ready (SP-111)', async () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const sessionPinner = new SessionPinner();
      const sqliteStore = new SqliteStore({ dbPath: ':memory:', models: [] });
      const baseOptions = createDispatchOptions(sqliteStore, sessionPinner);
      const router = createRouterFromFleet(fleet, {
        ...baseOptions,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 16 })),
        httpFetchPort: readyFetch,
        clusterMatcher: {
          match: async () => ({
            clusterId: 'low_stakes_general',
            tierBias: 'zero-tier' as const,
            similarity: 0.92,
            margin: 0.12,
            confidence: 'high' as const,
            elapsedMs: 2,
          }),
        } as unknown as ClusterMatcher,
      });

      const decision = await router.dispatch.dispatch(
        buildRoutingRequest(
          makeContext([userMessage('what is 2+2 ?')]),
          { sessionId: 'ext-sp111-fresh' },
        ),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.selected_model_id).toBe('llama3.2:3b');
      expect(decision.features?.local_eligible_reason).toBe('cluster_low_stakes_general');

      sqliteStore.close();
    });
  });

  describe('delegation output headroom (SP-108)', () => {
    beforeEach(() => {
      mockDelegateStreamSimple.mockReset();
    });

    it('escalates before provider dispatch when input leaves no output headroom', async () => {
      const headroomFleet: ModelProfile[] = [
        {
          id: 'gemini-flash-lite',
          tier: 'economical-cloud',
          provider: 'google',
          capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
          pricing: { fallback_cost_per_1m: 0.1 },
          limits: { max_input_tokens: 32_768, max_output_tokens: 8_192 },
        },
        {
          id: 'gemini-1.5-pro',
          tier: 'frontier-cloud',
          provider: 'google',
          capabilities: { reasoning: 0.8, code_gen: 0.8, tool_use: 0.8 },
          pricing: { fallback_cost_per_1m: 3.0 },
          limits: { max_input_tokens: 2_000_000, max_output_tokens: 8_192 },
        },
      ];
      const flashLite = makeRegistryModel({
        provider: 'google',
        id: 'gemini-flash-lite',
        api: 'google-generative-ai',
        contextWindow: 32_768,
        maxTokens: 8_192,
      });
      const geminiPro = makeRegistryModel({
        provider: 'google',
        id: 'gemini-1.5-pro',
        api: 'google-generative-ai',
        contextWindow: 2_000_000,
        maxTokens: 8_192,
      });
      const router = createRouterFromFleet(headroomFleet);
      vi.spyOn(router.dispatch, 'dispatch').mockResolvedValue({
        request_id: 'req-headroom',
        selected_model_id: 'gemini-flash-lite',
        tier: 'economical-cloud',
        stage: 'fallback',
        reason_code: 'safe_cloud_default',
        routing_latency_ms: 1,
        pin_reason: null,
      });
      mockDelegateStreamSimple.mockImplementation((model) => makeSuccessStream(model));

      const streamSimple = createStreamSimple(withDelegateStream({
        router,
        modelRegistry: createMockRegistry([flashLite, geminiPro]),
        fleet: headroomFleet,
        executionLedger: new ExecutionLedger(),
      }));

      await collectEvents(
        streamSimple(makeAutoModel(), makeContext([userMessage('continue')]), {
          sessionId: 'ext-headroom',
          estimatedInputTokens: 34_000,
        } as Parameters<typeof streamSimple>[2]),
      );

      expect(mockDelegateStreamSimple).toHaveBeenCalledOnce();
      expect(mockDelegateStreamSimple.mock.calls[0]?.[0]?.id).toBe('gemini-1.5-pro');
      expect(mockDelegateStreamSimple.mock.calls[0]?.[2]?.maxTokens).toBe(8_192);
    });

    it('retries larger model after zero-output length stop from provider', async () => {
      const headroomFleet: ModelProfile[] = [
        {
          id: 'gemini-flash-lite',
          tier: 'economical-cloud',
          provider: 'google',
          capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
          pricing: { fallback_cost_per_1m: 0.1 },
          limits: { max_input_tokens: 32_768, max_output_tokens: 8_192 },
        },
        {
          id: 'gemini-1.5-pro',
          tier: 'frontier-cloud',
          provider: 'google',
          capabilities: { reasoning: 0.8, code_gen: 0.8, tool_use: 0.8 },
          pricing: { fallback_cost_per_1m: 3.0 },
          limits: { max_input_tokens: 2_000_000, max_output_tokens: 8_192 },
        },
      ];
      const flashLite = makeRegistryModel({
        provider: 'google',
        id: 'gemini-flash-lite',
        api: 'google-generative-ai',
        contextWindow: 32_768,
        maxTokens: 8_192,
      });
      const geminiPro = makeRegistryModel({
        provider: 'google',
        id: 'gemini-1.5-pro',
        api: 'google-generative-ai',
        contextWindow: 2_000_000,
        maxTokens: 8_192,
      });
      const router = createRouterFromFleet(headroomFleet);
      vi.spyOn(router.dispatch, 'dispatch').mockResolvedValue({
        request_id: 'req-length-stop',
        selected_model_id: 'gemini-flash-lite',
        tier: 'economical-cloud',
        stage: 'fallback',
        reason_code: 'safe_cloud_default',
        routing_latency_ms: 1,
        pin_reason: null,
      });

      mockDelegateStreamSimple.mockImplementation((model) => {
        if (model.id === 'gemini-flash-lite') {
          const stream = createAssistantMessageEventStream();
          const partial: AssistantMessage = {
            ...makeAssistantPartial(model),
            content: [],
            usage: {
              input: 34_000,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 34_000,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'length',
          };
          void (async () => {
            stream.push({ type: 'start', partial });
            stream.push({ type: 'done', reason: 'length', message: partial });
            stream.end(partial);
          })();
          return stream;
        }
        return makeSuccessStream(model);
      });

      const streamSimple = createStreamSimple(withDelegateStream({
        router,
        modelRegistry: createMockRegistry([flashLite, geminiPro]),
        fleet: headroomFleet,
        executionLedger: new ExecutionLedger(),
      }));

      const events = await collectEvents(
        streamSimple(makeAutoModel(), makeContext([userMessage('continue')]), {
          sessionId: 'ext-length-stop-retry',
          estimatedInputTokens: 10_000,
        } as Parameters<typeof streamSimple>[2]),
      );

      expect(mockDelegateStreamSimple).toHaveBeenCalledTimes(2);
      expect(mockDelegateStreamSimple.mock.calls[0]?.[0]?.id).toBe('gemini-flash-lite');
      expect(mockDelegateStreamSimple.mock.calls[1]?.[0]?.id).toBe('gemini-1.5-pro');
      expect(events.some((event) => event.type === 'done' && event.message.stopReason === 'stop')).toBe(
        true,
      );
    });
  });
});
