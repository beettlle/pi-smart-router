/**
 * Pi extension integration — T021, T021b.
 *
 * Registers hooks on pi extension events. The pi extension routes in
 * `createStreamSimple`; lifecycle flags from compaction and model_select
 * are consumed when building the next routing request.
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
 * Create the pi extension middleware that wires router pipeline hooks
 * into pi extension events.
 */
export function createPiRouterMiddleware(options) {
    void options.fleet;
    const lifecycleHookState = options.lifecycleHookState ?? new LifecycleHookState();
    function register(hooks) {
        hooks.on('context', (event) => {
            void structuredClone(event.messages);
        });
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
    function getLastDecision() {
        return undefined;
    }
    return { register, getLastDecision, lifecycleHookState };
}
//# sourceMappingURL=pi-router-middleware.js.map