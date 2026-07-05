import { describe, expect, it } from 'vitest';

import {
  createPiRouterMiddleware,
  LifecycleHookState,
  type PiExtensionHooks,
  type PiExtensionContext,
  type PiModelSelectEvent,
  type PiSessionManager,
} from '../../src/api/middleware/pi-router-middleware.js';

interface HandlerMap {
  session_compact: ((event: unknown, ctx: PiExtensionContext) => void)[];
  session_before_compact: ((event: unknown, ctx: PiExtensionContext) => void)[];
  model_select: ((event: PiModelSelectEvent, ctx: PiExtensionContext) => void)[];
}

function createMockHooks(): { hooks: PiExtensionHooks; handlers: HandlerMap } {
  const handlers: HandlerMap = {
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
    it('wires compaction and model_select lifecycle hooks only', () => {
      const middleware = createPiRouterMiddleware();
      const { hooks, handlers } = createMockHooks();

      middleware.register(hooks);

      expect(handlers.session_compact).toHaveLength(1);
      expect(handlers.session_before_compact).toHaveLength(1);
      expect(handlers.model_select).toHaveLength(1);
    });
  });

  describe('session_compact / session_before_compact', () => {
    it('session_compact sets compaction flag for next consume', () => {
      const lifecycleHookState = new LifecycleHookState();
      const middleware = createPiRouterMiddleware({ lifecycleHookState });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.session_compact[0]!({}, makeCtx({ sessionId: 'compact-sess' }));

      expect(lifecycleHookState.consume('compact-sess')).toEqual({
        compaction_flag: true,
      });
      expect(lifecycleHookState.consume('compact-sess')).toEqual({});
    });

    it('session_before_compact sets compaction flag for next consume', () => {
      const lifecycleHookState = new LifecycleHookState();
      const middleware = createPiRouterMiddleware({ lifecycleHookState });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      handlers.session_before_compact[0]!({}, makeCtx({ sessionId: 'before-compact' }));

      expect(lifecycleHookState.consume('before-compact')).toEqual({
        compaction_flag: true,
      });
    });
  });

  describe('model_select event', () => {
    it('sets force_model_id when source is "set"', () => {
      const lifecycleHookState = new LifecycleHookState();
      const middleware = createPiRouterMiddleware({ lifecycleHookState });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const selectEvent: PiModelSelectEvent = {
        source: 'set',
        model: { provider: 'anthropic', id: 'claude-3' },
      };

      handlers.model_select[0]!(selectEvent, makeCtx({ sessionId: 'override-sess' }));

      expect(lifecycleHookState.consume('override-sess')).toEqual({
        force_model_id: 'claude-3',
      });
    });

    it('ignores model_select when source is not "set"', () => {
      const lifecycleHookState = new LifecycleHookState();
      const middleware = createPiRouterMiddleware({ lifecycleHookState });
      const { hooks, handlers } = createMockHooks();
      middleware.register(hooks);

      const selectEvent: PiModelSelectEvent = {
        source: 'auto',
        model: { provider: 'openai', id: 'gpt-4' },
      };

      handlers.model_select[0]!(selectEvent, makeCtx({ sessionId: 'auto-sess' }));

      expect(lifecycleHookState.consume('auto-sess')).toEqual({});
    });
  });

  describe('lifecycleHookState', () => {
    it('creates shared state when not injected', () => {
      const middleware = createPiRouterMiddleware();
      expect(middleware.lifecycleHookState).toBeInstanceOf(LifecycleHookState);
    });
  });
});
