/**
 * Pi lifecycle hook integration — T021, T021b, SP-055.
 *
 * Registers compaction and model-override hooks on pi extension events.
 * Lifecycle flags are consumed when building the next routing request
 * (extension `buildRoutingRequest` or embedder `dispatch.dispatch`).
 *
 * Routing and stream delegation live in `.pi/extensions/smart-router/` for
 * pi users, or in embedder code that calls `GatewayDispatch.dispatch()`.
 * This module does not register routing or no-op context hooks.
 *
 * Contract: specs/001-build-smart-router/contracts/pi-middleware.md v1.0.0
 */

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

// ─── Lifecycle hook registrar ────────────────────────────────────────────────

export interface PiRouterMiddlewareOptions {
  readonly lifecycleHookState?: LifecycleHookState;
}

export interface PiRouterMiddleware {
  readonly register: (hooks: PiExtensionHooks) => void;
  readonly lifecycleHookState: LifecycleHookState;
}

/**
 * Create pi lifecycle hook handlers for session compaction and model overrides.
 *
 * Library embedders: call `router.register(hooks)` on the returned `RouterHandle`
 * and route via `router.dispatch.dispatch()`. For pi, use the project extension at
 * `.pi/extensions/smart-router/` — it owns stream delegation and routing telemetry.
 */
export function createPiRouterMiddleware(
  options?: PiRouterMiddlewareOptions,
): PiRouterMiddleware {
  const lifecycleHookState = options?.lifecycleHookState ?? new LifecycleHookState();

  function register(hooks: PiExtensionHooks): void {
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

  return { register, lifecycleHookState };
}
