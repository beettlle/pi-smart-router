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
export interface LifecycleFlags {
    readonly compaction_flag?: boolean;
    readonly force_model_id?: string;
}
/**
 * Per-session lifecycle flags set by pi compaction and model_select hooks.
 * Shared across router rebuilds so hook state survives fleet refresh.
 */
export declare class LifecycleHookState {
    private readonly sessions;
    private getOrCreate;
    markCompaction(sessionId: string): void;
    setForceModel(sessionId: string, modelId: string): void;
    /**
     * Consume lifecycle flags for the next routing request.
     * Compaction is one-shot; force_model_id is one-shot per consume.
     */
    consume(sessionId: string): LifecycleFlags;
}
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
export declare function createPiRouterMiddleware(options: PiRouterMiddlewareOptions): PiRouterMiddleware;
//# sourceMappingURL=pi-router-middleware.d.ts.map