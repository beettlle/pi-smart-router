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
/**
 * Per-session lifecycle flags set by pi compaction and model_select hooks.
 * Shared across router rebuilds so hook state survives fleet refresh.
 */
export class LifecycleHookState {
    sessions = new Map();
    getOrCreate(sessionId) {
        let state = this.sessions.get(sessionId);
        if (!state) {
            state = { compactionPending: false };
            this.sessions.set(sessionId, state);
        }
        return state;
    }
    markCompaction(sessionId) {
        this.getOrCreate(sessionId).compactionPending = true;
    }
    setForceModel(sessionId, modelId) {
        const state = this.getOrCreate(sessionId);
        state.forceModelId = modelId;
    }
    /**
     * Consume lifecycle flags for the next routing request.
     * Compaction is one-shot; force_model_id is one-shot per consume.
     */
    consume(sessionId) {
        const state = this.sessions.get(sessionId);
        if (!state) {
            return {};
        }
        const flags = {
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
function resolveHookSessionId(ctx) {
    return ctx.sessionManager.getSessionId();
}
/**
 * Create pi lifecycle hook handlers for session compaction and model overrides.
 *
 * Library embedders: call `router.register(hooks)` on the returned `RouterHandle`
 * and route via `router.dispatch.dispatch()`. For pi, use the project extension at
 * `.pi/extensions/smart-router/` — it owns stream delegation and routing telemetry.
 */
export function createPiRouterMiddleware(options) {
    const lifecycleHookState = options?.lifecycleHookState ?? new LifecycleHookState();
    function register(hooks) {
        hooks.on('session_compact', (_event, ctx) => {
            lifecycleHookState.markCompaction(resolveHookSessionId(ctx));
        });
        hooks.on('session_before_compact', (_event, ctx) => {
            lifecycleHookState.markCompaction(resolveHookSessionId(ctx));
        });
        hooks.on('model_select', (event, ctx) => {
            if (event.source === 'set') {
                lifecycleHookState.setForceModel(resolveHookSessionId(ctx), event.model.id);
            }
        });
    }
    return { register, lifecycleHookState };
}
//# sourceMappingURL=pi-router-middleware.js.map