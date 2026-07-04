/**
 * Public package exports — pi-smart-router.
 *
 * Exposes the router factory (T022) and pi extension middleware (T021).
 */

import type { ModelProfile, RoutingDecision } from './domain/types/index.js';
import { loadModels } from './config/models-loader.js';
import {
  GatewayDispatch,
  type GatewayDispatchOptions,
} from './infrastructure/gateway/gateway-dispatch.js';
import {
  createPiRouterMiddleware,
  type PiRouterMiddleware,
  type PiExtensionHooks,
} from './api/middleware/pi-router-middleware.js';

/** Package identifier for diagnostics and telemetry. */
export const PACKAGE_NAME = 'pi-smart-router' as const;

// ─── Router factory types ────────────────────────────────────────────────────

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

// ─── Router factory (T022) ───────────────────────────────────────────────────

export function createRouter(options?: RouterFactoryOptions): RouterHandle {
  const catalog = loadModels(
    options?.modelsPath ? { filePath: options.modelsPath } : undefined,
  );

  return createRouterFromFleet(catalog.models as unknown as ModelProfile[]);
}

export function createRouterFromFleet(
  fleet: ModelProfile[],
  options?: GatewayDispatchOptions,
): RouterHandle {
  const dispatch = new GatewayDispatch(fleet, options);
  const middleware = createPiRouterMiddleware({ fleet });

  return {
    version: 'pi-smart-router',
    middleware,
    dispatch,
    fleet,
    register: middleware.register,
  };
}

// ─── Re-exports for consumer convenience ─────────────────────────────────────

export type { RoutingDecision, ModelProfile };
export type {
  PiRouterMiddleware,
  PiRouterMiddlewareOptions,
  PiExtensionHooks,
  PiExtensionContext,
  PiProviderRequestEvent,
  PiContextEvent,
  PiModelSelectEvent,
  PiSessionManager,
} from './api/middleware/pi-router-middleware.js';
export { createPiRouterMiddleware } from './api/middleware/pi-router-middleware.js';
export type { GatewayDispatchOptions } from './infrastructure/gateway/gateway-dispatch.js';
export type { PipelineOptions } from './domain/pipeline/router-pipeline.js';
