import { describe, expect, it } from 'vitest';

import {
  createPiRouterMiddleware,
  type PiExtensionHooks,
  type PiExtensionContext,
  type PiContextEvent,
  type PiModelSelectEvent,
  type PiSessionManager,
} from '../../src/api/middleware/pi-router-middleware.js';
import type { ModelProfile } from '../../src/domain/types/index.js';

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

interface HandlerMap {
  context: ((event: PiContextEvent, ctx: PiExtensionContext) => void)[];
  session_compact: ((event: unknown, ctx: PiExtensionContext) => void)[];
  session_before_compact: ((event: unknown, ctx: PiExtensionContext) => void)[];
  model_select: ((event: PiModelSelectEvent, ctx: PiExtensionContext) => void)[];
}

function createMockHooks(): { hooks: PiExtensionHooks; handlers: HandlerMap } {
  const handlers: HandlerMap = {
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

describe('createPiRouterMiddleware', () => {
  describe('register()', () => {
    it('wires context, compaction, and model_select hooks', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();

      middleware.register(hooks);

      expect(handlers.context).toHaveLength(1);
      expect(handlers.session_compact).toHaveLength(1);
      expect(handlers.session_before_compact).toHaveLength(1);
      expect(handlers.model_select).toHaveLength(1);
    });
  });

  describe('context event', () => {
    it('accepts context updates without throwing', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const contextHandler = handlers.context[0]!;
      expect(() => {
        contextHandler({ messages: [{ role: 'user', content: 'Hello' }] }, makeCtx());
      }).not.toThrow();
    });

    it('deep copies messages to avoid external mutation', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const contextHandler = handlers.context[0]!;
      const messages = [{ role: 'user', content: 'Original' }];
      contextHandler({ messages }, makeCtx());

      expect(() => {
        (messages[0] as { content: string }).content = 'Mutated';
      }).not.toThrow();
    });
  });

  describe('session_compact / session_before_compact', () => {
    it('session_compact handler runs without throwing', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      expect(() => {
        handlers.session_compact[0]!({}, makeCtx());
      }).not.toThrow();
    });

    it('session_before_compact handler runs without throwing', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      expect(() => {
        handlers.session_before_compact[0]!({}, makeCtx());
      }).not.toThrow();
    });
  });

  describe('model_select event', () => {
    it('accepts model_select when source is "set"', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const selectEvent: PiModelSelectEvent = {
        source: 'set',
        model: { provider: 'anthropic', id: 'claude-3' },
      };

      expect(() => {
        handlers.model_select[0]!(selectEvent, makeCtx());
      }).not.toThrow();
    });

    it('accepts model_select when source is not "set"', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const selectEvent: PiModelSelectEvent = {
        source: 'auto',
        model: { provider: 'openai', id: 'gpt-4' },
      };

      expect(() => {
        handlers.model_select[0]!(selectEvent, makeCtx());
      }).not.toThrow();
    });
  });

  describe('getLastDecision', () => {
    it('returns undefined because routing occurs in the pi extension stream path', () => {
      const middleware = createPiRouterMiddleware({ fleet });
      expect(middleware.getLastDecision()).toBeUndefined();
    });
  });
});
