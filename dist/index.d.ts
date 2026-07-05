/**
 * Public package exports — pi-smart-router.
 *
 * Exposes the router factory (T022) and pi lifecycle hook registrar (T021).
 * Full pi integration uses `.pi/extensions/smart-router/`; library embedders
 * route via `dispatch.dispatch()` after calling `register(hooks)`.
 */
import type { ModelProfile, RoutingDecision } from './domain/types/index.js';
import { GatewayDispatch, type GatewayDispatchOptions } from './infrastructure/gateway/gateway-dispatch.js';
import { LifecycleHookState, type PiRouterMiddleware, type PiExtensionHooks } from './api/middleware/pi-router-middleware.js';
/** Package identifier for diagnostics and telemetry. */
export declare const PACKAGE_NAME: "pi-smart-router";
export interface RouterFactoryOptions {
    readonly modelsPath?: string;
}
export interface RouterHandle {
    readonly version: string;
    readonly middleware: PiRouterMiddleware;
    readonly dispatch: GatewayDispatch;
    readonly fleet: readonly ModelProfile[];
    readonly register: (hooks: PiExtensionHooks) => void;
}
export declare function createRouter(options?: RouterFactoryOptions): RouterHandle;
export interface CreateRouterFromFleetOptions extends GatewayDispatchOptions {
    readonly lifecycleHookState?: LifecycleHookState;
}
export declare function createRouterFromFleet(fleet: ModelProfile[], options?: CreateRouterFromFleetOptions): RouterHandle;
export type { RoutingDecision, ModelProfile };
export type { PiRouterMiddleware, PiRouterMiddlewareOptions, PiExtensionHooks, PiExtensionContext, PiProviderRequestEvent, PiContextEvent, PiModelSelectEvent, PiSessionManager, LifecycleFlags, } from './api/middleware/pi-router-middleware.js';
export { createPiRouterMiddleware, LifecycleHookState } from './api/middleware/pi-router-middleware.js';
export type { GatewayDispatchOptions } from './infrastructure/gateway/gateway-dispatch.js';
export type { PipelineOptions } from './domain/pipeline/router-pipeline.js';
//# sourceMappingURL=index.d.ts.map