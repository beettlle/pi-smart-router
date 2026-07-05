/**
 * In-memory persistence store — fallback when SQLite is unavailable.
 *
 * Implements StorePort for process-local state. Data does not survive
 * process restart. Used as a safety net per FR-025: when the SQLite
 * state store is unavailable, degrade to in-memory rather than crash.
 */
import { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT, TELEMETRY_MAX_ENTRIES, makeTelemetryRoom, } from '../telemetry/telemetry-limits.js';
export class MemoryStore {
    pins = new Map();
    models;
    priceCatalog = null;
    telemetry = [];
    constructor(models = []) {
        this.models = models;
    }
    async getSessionPin(sessionId) {
        return this.pins.get(sessionId) ?? null;
    }
    async putSessionPin(pin) {
        this.pins.set(pin.session_id, pin);
    }
    async deleteSessionPin(sessionId) {
        this.pins.delete(sessionId);
    }
    async getModelProfiles() {
        return this.models;
    }
    async getPriceCatalog() {
        return this.priceCatalog;
    }
    async putPriceCatalog(catalog) {
        this.priceCatalog = catalog;
    }
    appendTelemetry(entry) {
        makeTelemetryRoom(this.telemetry, TELEMETRY_MAX_ENTRIES);
        this.telemetry.push(entry);
    }
    async listTelemetry(options) {
        const limit = clampHistoryLimit(options?.limit);
        const sessionId = options?.sessionId;
        const filtered = sessionId
            ? this.telemetry.filter((entry) => entry.session_id === sessionId)
            : this.telemetry;
        return [...filtered]
            .reverse()
            .slice(0, limit);
    }
}
function clampHistoryLimit(limit) {
    if (limit === undefined) {
        return DEFAULT_HISTORY_LIMIT;
    }
    return Math.min(Math.max(1, Math.floor(limit)), MAX_HISTORY_LIMIT);
}
//# sourceMappingURL=memory-store.js.map