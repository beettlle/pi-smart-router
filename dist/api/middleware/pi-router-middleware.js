/**
 * Pi extension integration — T021, T021b.
 *
 * Registers hooks on pi extension events. The pi extension routes in
 * `createStreamSimple`; these hooks remain for embedders and future
 * context/session wiring.
 *
 * Contract: specs/001-build-smart-router/contracts/pi-middleware.md v1.0.0
 */
/**
 * Create the pi extension middleware that wires router pipeline hooks
 * into pi extension events.
 */
export function createPiRouterMiddleware(options) {
    void options;
    function register(hooks) {
        hooks.on('context', (event) => {
            void structuredClone(event.messages);
        });
        hooks.on('session_compact', () => { });
        hooks.on('session_before_compact', () => { });
        hooks.on('model_select', (event) => {
            void event;
        });
    }
    function getLastDecision() {
        return undefined;
    }
    return { register, getLastDecision };
}
//# sourceMappingURL=pi-router-middleware.js.map