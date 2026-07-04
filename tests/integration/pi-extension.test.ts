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
  createStreamSimple,
} from '../../.pi/extensions/smart-router/index.js';
import {
  mapFleetFromRegistry,
  mapPiModelToProfile,
  type PiModelInput,
} from '../../src/config/pi-model-mapper.js';
import type { ModelProfile, RoutingDecision } from '../../src/domain/types/index.js';
import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import { createRouterFromFleet } from '../../src/index.js';
import { ExecutionLedger } from '../../src/domain/delegation/execution-ledger.js';

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

  describe('createRouterFromFleet with mapped fleet', () => {
    it('returns a working RouterHandle wired to the mapped catalog', () => {
      const fleet = mapFleetFromRegistry(REGISTRY_MODELS);
      const router = createRouterFromFleet(fleet);

      expect(router.version).toBe('pi-smart-router');
      expect(router.fleet).toBe(fleet);
      expect(router.dispatch).toBeInstanceOf(GatewayDispatch);
      expect(typeof router.register).toBe('function');
      expect(typeof router.middleware.getLastDecision).toBe('function');
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
      const streamSimple = createStreamSimple({
        router,
        modelRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
        onRoutingDecision(decision) {
          capturedDecision = decision;
        },
      });

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

      const streamSimple = createStreamSimple({
        router,
        modelRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
      });

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
});
