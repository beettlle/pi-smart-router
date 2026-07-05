/**
 * Pi extension integration — T021, T021b.
 *
 * Registers hooks on pi extension events. The pi extension routes in
 * `createStreamSimple`; lifecycle flags from compaction and model_select
 * are consumed when building the next routing request.
 *
 * Contract: specs/001-build-smart-router/contracts/pi-middleware.md v1.0.0
 */

import type { RoutingDecision } from '../../domain/types/index.js';

// ─── Pi extension event types (structural typing) ────────────────────────────

export interface PiSessionManager {
  getSessionFile(): string | undefined;
  getSessionId(): string;
}

export interface PiExtensionContext {
  readonly cwd: string;
  readonly sessionManager: PiSessionManager;
}

export interface PiMessage {
  readonly role: string;
  readonly content: string;
  readonly tool_call_id?: string;
  readonly tool_calls?: readonly unknown[];
}

export interface PiContextEvent {
  readonly messages: readonly PiMessage[];
}

export interface PiModelSelectEvent {
  readonly source: string;
  readonly model: {
    readonly provider: string;
    readonly id: string;
  };
}

/** Legacy embedder event shape; routing is handled in the pi extension stream path. */
export interface PiProviderRequestEvent {
  readonly provider: string;
  readonly model: string;
  readonly messages?: readonly PiMessage[];
  [key: string]: unknown;
}

export interface PiExtensionHooks {
  on(event: 'before_provider_request', handler: (event: PiProviderRequestEvent, ctx: PiExtensionContext) => PiProviderRequestEvent | Promise<PiProviderRequestEvent>): void;
  on(event: 'context', handler: (event: PiContextEvent, ctx: PiExtensionContext) => void): void;
  on(event: 'session_compact', handler: (event: unknown, ctx: PiExtensionContext) => void): void;
  on(event: 'session_before_compact', handler: (event: unknown, ctx: PiExtensionContext) => void): void;
  on(event: 'model_select', handler: (event: PiModelSelectEvent, ctx: PiExtensionContext) => void): void;
}

// ─── Lifecycle hook state (FR-008) ───────────────────────────────────────────

export interface LifecycleFlags {
  readonly compaction_flag?: boolean;
  readonly force_model_id?: string;
}

interface SessionLifecycleState {
  compactionPending: boolean;
  forceModelId?: string;
}

/**
 * Per-session lifecycle flags set by pi compaction and model_select hooks.
 * Shared across router rebuilds so hook state survives fleet refresh.
 */
export class LifecycleHookState {
  private readonly sessions = new Map<string, SessionLifecycleState>();

  private getOrCreate(sessionId: string): SessionLifecycleState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { compactionPending: false };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  markCompaction(sessionId: string): void {
    this.getOrCreate(sessionId).compactionPending = true;
  }

  setForceModel(sessionId: string, modelId: string): void {
    const state = this.getOrCreate(sessionId);
    state.forceModelId = modelId;
  }

  /**
   * Consume lifecycle flags for the next routing request.
   * Compaction is one-shot; force_model_id is one-shot per consume.
   */
  consume(sessionId: string): LifecycleFlags {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return {};
    }

    const flags: LifecycleFlags = {
      ...(state.compactionPending ? { compaction_flag: true } : {}),
      ...(state.forceModelId !== undefined ? { force_model_id: state.forceModelId } : {}),
    };

    state.compactionPending = false;
    delete state.forceModelId;

    if (!state.compactionPending && state.forceModelId === undefined) {
      this.sessions.delete(sessionId);
    }

    return flags;
  }
}

function resolveHookSessionId(ctx: PiExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

// ─── Middleware state ────────────────────────────────────────────────────────

export interface PiRouterMiddlewareOptions {
  readonly fleet: readonly import('../../domain/types/index.js').ModelProfile[];
  readonly lifecycleHookState?: LifecycleHookState;
}

export interface PiRouterMiddleware {
  readonly register: (hooks: PiExtensionHooks) => void;
  readonly getLastDecision: () => RoutingDecision | undefined;
  readonly lifecycleHookState: LifecycleHookState;
}

/**
 * Create the pi extension middleware that wires router pipeline hooks
 * into pi extension events.
 */
export function createPiRouterMiddleware(
  options: PiRouterMiddlewareOptions,
): PiRouterMiddleware {
  void options.fleet;

  const lifecycleHookState = options.lifecycleHookState ?? new LifecycleHookState();

  function register(hooks: PiExtensionHooks): void {
    hooks.on('context', (event: PiContextEvent) => {
      void structuredClone(event.messages);
    });

    hooks.on('session_compact', (_event: unknown, ctx: PiExtensionContext) => {
      lifecycleHookState.markCompaction(resolveHookSessionId(ctx));
    });

    hooks.on('session_before_compact', (_event: unknown, ctx: PiExtensionContext) => {
      lifecycleHookState.markCompaction(resolveHookSessionId(ctx));
    });

    hooks.on('model_select', (event: PiModelSelectEvent, ctx: PiExtensionContext) => {
      if (event.source === 'set') {
        lifecycleHookState.setForceModel(resolveHookSessionId(ctx), event.model.id);
      }
    });
  }

  function getLastDecision(): RoutingDecision | undefined {
    return undefined;
  }

  return { register, getLastDecision, lifecycleHookState };
}
