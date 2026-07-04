/**
 * Pi extension integration — T021, T021b.
 *
 * Registers hooks on pi extension events. The pi extension routes in
 * `createStreamSimple`; these hooks remain for embedders and future
 * context/session wiring.
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

// ─── Middleware state ────────────────────────────────────────────────────────

export interface PiRouterMiddlewareOptions {
  readonly fleet: readonly import('../../domain/types/index.js').ModelProfile[];
}

export interface PiRouterMiddleware {
  readonly register: (hooks: PiExtensionHooks) => void;
  readonly getLastDecision: () => RoutingDecision | undefined;
}

/**
 * Create the pi extension middleware that wires router pipeline hooks
 * into pi extension events.
 */
export function createPiRouterMiddleware(
  options: PiRouterMiddlewareOptions,
): PiRouterMiddleware {
  void options;

  function register(hooks: PiExtensionHooks): void {
    hooks.on('context', (event: PiContextEvent) => {
      void structuredClone(event.messages);
    });

    hooks.on('session_compact', () => {});

    hooks.on('session_before_compact', () => {});

    hooks.on('model_select', (event: PiModelSelectEvent) => {
      void event;
    });
  }

  function getLastDecision(): RoutingDecision | undefined {
    return undefined;
  }

  return { register, getLastDecision };
}
