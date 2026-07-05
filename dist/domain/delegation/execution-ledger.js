/**
 * Tracks the last successfully executing model per session.
 *
 * Used to rewrite virtual smart-router assistant identity on replay so pi-ai
 * transformMessages sees the model that actually produced prior turns.
 */
export class ExecutionLedger {
    bySession = new Map();
    recordSuccess(sessionId, model) {
        this.bySession.set(sessionId, {
            provider: model.provider,
            api: model.api,
            id: model.id,
        });
    }
    getLastExecution(sessionId) {
        return this.bySession.get(sessionId) ?? null;
    }
    clear(sessionId) {
        this.bySession.delete(sessionId);
    }
}
//# sourceMappingURL=execution-ledger.js.map