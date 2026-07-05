/**
 * Routing telemetry emitter — T039.
 *
 * Maintains an append-only rolling window of routing decisions for
 * observability and audit. Window bounds: 168 hours (7 days), max 1111 entries.
 */
import { TELEMETRY_MAX_ENTRIES, TELEMETRY_WINDOW_MS, evictExpiredTelemetryEntries, makeTelemetryRoom, } from './telemetry-limits.js';
export { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT, TELEMETRY_MAX_ENTRIES, TELEMETRY_WINDOW_HOURS, TELEMETRY_WINDOW_MS, } from './telemetry-limits.js';
// ─── Emitter ─────────────────────────────────────────────────────────────────
export class RoutingTelemetryEmitter {
    entries = [];
    maxEntries;
    windowMs;
    clock;
    onRecord;
    constructor(options) {
        this.maxEntries = options?.maxEntries ?? TELEMETRY_MAX_ENTRIES;
        this.windowMs = options?.windowMs ?? TELEMETRY_WINDOW_MS;
        this.clock = options?.clock ?? (() => new Date().toISOString());
        this.onRecord = options?.onRecord;
    }
    /**
     * Emit a telemetry record from a completed routing decision.
     * Enforces the rolling window (time + count) before appending.
     */
    emit(request, decision) {
        makeTelemetryRoom(this.entries, this.maxEntries);
        const record = {
            timestamp: this.clock(),
            session_id: request.session_id,
            request_id: decision.request_id,
            turn_type: request.turn_type ?? 'unknown',
            stage: decision.stage,
            reason_code: decision.reason_code,
            selected_model_id: decision.selected_model_id,
            estimated_cost_usd: decision.estimated_cost_usd ?? 0,
            routing_latency_ms: decision.routing_latency_ms,
            pin_reason: decision.pin_reason,
        };
        this.entries.push(record);
        this.onRecord?.(record);
        return record;
    }
    /** Current number of retained entries. */
    get size() {
        return this.entries.length;
    }
    /** Snapshot of all retained entries (newest last). */
    snapshot() {
        evictExpiredTelemetryEntries(this.entries, this.windowMs);
        return [...this.entries];
    }
}
//# sourceMappingURL=routing-telemetry.js.map
