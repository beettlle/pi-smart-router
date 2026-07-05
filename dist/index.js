/**
 * Public package exports — pi-smart-router.
 *
 * Exposes the router factory (T022) and pi extension middleware (T021).
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
export { createPiRouterMiddleware } from './api/middleware/pi-router-middleware.js';
//# sourceMappingURL=index.js.map