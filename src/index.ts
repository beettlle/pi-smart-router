/**
 * Public package exports — pi-smart-router.
 *
 * Exposes the router factory (T022) and pi lifecycle hook registrar (T021).
 * Full pi integration uses `.pi/extensions/smart-router/`; library embedders
 * route via `dispatch.dispatch()` after calling `register(hooks)`.
 */

import type { ModelProfile, RoutingDecision } from './domain/types/index.js';
import { loadModels } from './config/models-loader.js';
import {
  GatewayDispatch,
  type GatewayDispatchOptions,
} from './infrastructure/gateway/gateway-dispatch.js';
import {
  createPiRouterMiddleware,
  LifecycleHookState,
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

export interface CreateRouterFromFleetOptions extends GatewayDispatchOptions {
  readonly lifecycleHookState?: LifecycleHookState;
}

export function createRouterFromFleet(
  fleet: ModelProfile[],
  options?: CreateRouterFromFleetOptions,
): RouterHandle {
  const { lifecycleHookState, ...dispatchOptions } = options ?? {};
  const dispatch = new GatewayDispatch(fleet, dispatchOptions);
  const middleware = createPiRouterMiddleware(
    lifecycleHookState !== undefined ? { lifecycleHookState } : undefined,
  );

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
  LifecycleFlags,
} from './api/middleware/pi-router-middleware.js';
export { createPiRouterMiddleware, LifecycleHookState } from './api/middleware/pi-router-middleware.js';
export type { GatewayDispatchOptions } from './infrastructure/gateway/gateway-dispatch.js';
export type { PipelineOptions } from './domain/pipeline/router-pipeline.js';
