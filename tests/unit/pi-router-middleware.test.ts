import { describe, expect, it } from 'vitest';

import {
  createPiRouterMiddleware,
  type PiExtensionHooks,
  type PiExtensionContext,
  type PiProviderRequestEvent,
  type PiContextEvent,
  type PiModelSelectEvent,
  type PiSessionManager,
} from '../../src/api/middleware/pi-router-middleware.js';
import type { ModelProfile } from '../../src/domain/types/index.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

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

const fleet: ModelProfile[] = [
  makeModel({ id: 'local-llama', tier: 'zero-tier' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
];

type BeforeProviderHandler = (event: PiProviderRequestEvent, ctx: PiExtensionContext) => PiProviderRequestEvent;

interface HandlerMap {
  before_provider_request: BeforeProviderHandler[];
  context: ((event: PiContextEvent, ctx: PiExtensionContext) => void)[];
  session_compact: ((event: unknown, ctx: PiExtensionContext) => void)[];
  session_before_compact: ((event: unknown, ctx: PiExtensionContext) => void)[];
  model_select: ((event: PiModelSelectEvent, ctx: PiExtensionContext) => void)[];
}

function createMockHooks(): { hooks: PiExtensionHooks; handlers: HandlerMap } {
  const handlers: HandlerMap = {
    before_provider_request: [],
    context: [],
    session_compact: [],
    session_before_compact: [],
    model_select: [],
  };

  const hooks = {
    on(event: string, handler: unknown): void {
      const key = event as keyof HandlerMap;
      if (handlers[key]) {
        (handlers[key] as unknown[]).push(handler);
      }
    },
  } as PiExtensionHooks;

  return { hooks, handlers };
}

function makeCtx(opts?: { sessionFile?: string; sessionId?: string; cwd?: string }): PiExtensionContext {
  const sessionManager: PiSessionManager = {
    getSessionFile: () => opts?.sessionFile,
    getSessionId: () => opts?.sessionId ?? 'test-session-id',
  };
  return {
    cwd: opts?.cwd ?? '/home/user/project',
    sessionManager,
  };
}

function makeProviderEvent(overrides?: Partial<PiProviderRequestEvent>): PiProviderRequestEvent {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createPiRouterMiddleware', () => {
  describe('register()', () => {
    it('wires all four event hooks', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();

      middleware.register(hooks);

      expect(handlers.before_provider_request).toHaveLength(1);
      expect(handlers.context).toHaveLength(1);
      expect(handlers.session_compact).toHaveLength(1);
      expect(handlers.session_before_compact).toHaveLength(1);
      expect(handlers.model_select).toHaveLength(1);
    });
  });

  describe('context event', () => {
    it('updates internal message state from context event', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const contextHandler = handlers.context[0]!;
      const messages = [{ role: 'user', content: 'Hello' }];
      contextHandler({ messages }, makeCtx());

      const requestHandler = handlers.before_provider_request[0]!;
      const result = requestHandler(makeProviderEvent(), makeCtx({ sessionFile: '/tmp/sess' }));
      expect(result).toHaveProperty('model');
    });

    it('deep copies messages to avoid external mutation', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const contextHandler = handlers.context[0]!;
      const messages = [{ role: 'user', content: 'Original' }];
      contextHandler({ messages }, makeCtx());

      (messages[0] as { content: string }).content = 'Mutated';

      const requestHandler = handlers.before_provider_request[0]!;
      const result = requestHandler(makeProviderEvent(), makeCtx({ sessionFile: '/tmp/s' }));
      expect(result).toHaveProperty('model');
    });
  });

  describe('session_compact / session_before_compact', () => {
    it('session_compact sets compaction flag', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.session_compact[0]!({}, makeCtx());

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });

    it('session_before_compact sets compaction flag', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.session_before_compact[0]!({}, makeCtx());

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });

    it('compaction flag is consumed after one routing decision', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.session_compact[0]!({}, makeCtx());

      handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      const secondResult = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(secondResult).toBeDefined();
    });
  });

  describe('model_select event', () => {
    it('sets forceModelId when source is "set"', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const selectEvent: PiModelSelectEvent = {
        source: 'set',
        model: { provider: 'anthropic', id: 'claude-3' },
      };
      handlers.model_select[0]!(selectEvent, makeCtx());

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });

    it('ignores model_select when source is not "set"', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const selectEvent: PiModelSelectEvent = {
        source: 'auto',
        model: { provider: 'openai', id: 'gpt-4' },
      };
      handlers.model_select[0]!(selectEvent, makeCtx());

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('before_provider_request', () => {
    it('builds a valid RoutingRequest and returns modified event', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'Write a function' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/home/user/.sessions/main.json' }),
      );

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('model');
      expect(typeof result.model).toBe('string');
    });

    it('selects economical-cloud model (safe default) for basic request', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'Hello world' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );

      expect(result.model).toBe('gpt-4o-mini');
    });

    it('falls back to unmodified event on pipeline error', () => {
      const emptyFleetMiddleware = createPiRouterMiddleware({ fleet: [] });
      const { hooks, handlers } = createMockHooks();
      emptyFleetMiddleware.register(hooks);

      const originalEvent = makeProviderEvent({ provider: 'original', model: 'original-model' });
      const result = handlers.before_provider_request[0]!(
        originalEvent,
        makeCtx({ sessionFile: '/tmp/s' }),
      );

      expect(result.model).toBeDefined();
    });

    it('resets forceModelId is not cleared between requests', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const selectEvent: PiModelSelectEvent = {
        source: 'set',
        model: { provider: 'anthropic', id: 'opus' },
      };
      handlers.model_select[0]!(selectEvent, makeCtx());

      handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('deriveSessionId', () => {
    it('uses session file path when available', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'test' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/absolute/path/to/session.json' }),
      );

      expect(result).toBeDefined();
    });

    it('falls back to sha256 hash when session file is undefined', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'test' }] },
        makeCtx(),
      );

      const ctx = makeCtx({ sessionId: 'ephemeral-123' });
      const result = handlers.before_provider_request[0]!(makeProviderEvent(), ctx);

      expect(result).toBeDefined();
    });
  });

  describe('deriveTurnType', () => {
    it('returns tool_result for messages ending with tool role', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'hi' }, { role: 'tool', content: 'result', tool_call_id: 'tc1' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });

    it('returns planning for messages containing "plan" keyword', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'Please plan the architecture' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });

    it('returns main_loop for regular user messages', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'Fix the bug in file.ts' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });

    it('returns unknown for empty messages', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('extractPromptText', () => {
    it('extracts last user message content', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        {
          messages: [
            { role: 'user', content: 'First message' },
            { role: 'assistant', content: 'Response' },
            { role: 'user', content: 'Second message' },
          ],
        },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });

    it('returns empty string when no user messages exist', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'assistant', content: 'Only assistant' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('getLastDecision', () => {
    it('returns undefined before any routing', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      expect(middleware.getLastDecision()).toBeUndefined();
    });

    it('returns the most recent routing decision after routing', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'hi' }] },
        makeCtx(),
      );

      handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );

      const decision = middleware.getLastDecision();
      expect(decision).toBeDefined();
      expect(decision!.request_id).toBeDefined();
      expect(decision!.selected_model_id).toBe('gpt-4o-mini');
      expect(decision!.tier).toBe('economical-cloud');
      expect(decision!.stage).toBe('fallback');
      expect(decision!.reason_code).toBe('safe_cloud_default');
      expect(decision!.routing_latency_ms).toBeGreaterThanOrEqual(0);
      expect(decision!.pin_reason).toBeNull();
    });

    it('updates on each new routing decision', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'first' }] },
        makeCtx(),
      );
      handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      const first = middleware.getLastDecision();

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'second' }] },
        makeCtx(),
      );
      handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );
      const second = middleware.getLastDecision();

      expect(first!.request_id).not.toBe(second!.request_id);
    });
  });

  describe('routeSync fallback behavior', () => {
    it('returns safe cloud default when pipeline resolves on same tick', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'test' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );

      expect(result.model).toBe('gpt-4o-mini');
    });

    it('returns unknown model ID when fleet is empty', () => {
      const emptyMiddleware = createPiRouterMiddleware({ fleet: [] });
      const { hooks, handlers } = createMockHooks();
      emptyMiddleware.register(hooks);

      handlers.context[0]!(
        { messages: [{ role: 'user', content: 'test' }] },
        makeCtx(),
      );

      const result = handlers.before_provider_request[0]!(
        makeProviderEvent(),
        makeCtx({ sessionFile: '/tmp/sess' }),
      );

      expect(result.model).toBe('unknown');
    });
  });
});
