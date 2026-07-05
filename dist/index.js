/**
 * Public package exports — pi-smart-router.
 *
 * Exposes the router factory (T022) and pi lifecycle hook registrar (T021).
 * Full pi integration uses `.pi/extensions/smart-router/`; library embedders
 * route via `dispatch.dispatch()` after calling `register(hooks)`.
 */
import { loadModels } from './config/models-loader.js';
import { GatewayDispatch, } from './infrastructure/gateway/gateway-dispatch.js';
import { createPiRouterMiddleware, } from './api/middleware/pi-router-middleware.js';
/** Package identifier for diagnostics and telemetry. */
export const PACKAGE_NAME = 'pi-smart-router';
// ─── Router factory (T022) ───────────────────────────────────────────────────
export function createRouter(options) {
    const catalog = loadModels(options?.modelsPath ? { filePath: options.modelsPath } : undefined);
    return createRouterFromFleet(catalog.models);
}
export function createRouterFromFleet(fleet, options) {
    const { lifecycleHookState, ...dispatchOptions } = options ?? {};
    const dispatch = new GatewayDispatch(fleet, dispatchOptions);
    const middleware = createPiRouterMiddleware(lifecycleHookState !== undefined ? { lifecycleHookState } : undefined);
    return {
        version: 'pi-smart-router',
        middleware,
        dispatch,
        fleet,
        register: middleware.register,
    };
}
export { createPiRouterMiddleware, LifecycleHookState } from './api/middleware/pi-router-middleware.js';
//# sourceMappingURL=index.js.map