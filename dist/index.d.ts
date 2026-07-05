/**
 * Public package exports — pi-smart-router.
 *
 * Exposes the router factory (T022) and pi extension middleware (T021).
 */
import type { ModelProfile, RoutingDecision } from './domain/types/index.js';
import { GatewayDispatch, type GatewayDispatchOptions } from './infrastructure/gateway/gateway-dispatch.js';
import { type PiRouterMiddleware, type PiExtensionHooks } from './api/middleware/pi-router-middleware.js';
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
export declare function createRouterFromFleet(fleet: ModelProfile[], options?: GatewayDispatchOptions): RouterHandle;
export type { RoutingDecision, ModelProfile };
export type { PiRouterMiddleware, PiRouterMiddlewareOptions, PiExtensionHooks, PiExtensionContext, PiProviderRequestEvent, PiContextEvent, PiModelSelectEvent, PiSessionManager, } from './api/middleware/pi-router-middleware.js';
export { createPiRouterMiddleware } from './api/middleware/pi-router-middleware.js';
export type { GatewayDispatchOptions } from './infrastructure/gateway/gateway-dispatch.js';
export type { PipelineOptions } from './domain/pipeline/router-pipeline.js';
//# sourceMappingURL=index.d.ts.map