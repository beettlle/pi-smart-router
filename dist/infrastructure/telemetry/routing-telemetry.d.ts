/**
 * Routing telemetry emitter — T039.
 *
 * Maintains an append-only rolling window of routing decisions for
 * observability and audit. Window bounds: 168 hours (7 days), max 1111 entries.
 */
import type { RoutingDecision, RoutingRequest, RoutingTelemetry } from '../../domain/types/index.js';
export { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT, TELEMETRY_MAX_ENTRIES, TELEMETRY_WINDOW_HOURS, TELEMETRY_WINDOW_MS, } from './telemetry-limits.js';
export interface TelemetryEmitterOptions {
    readonly maxEntries?: number;
    readonly windowMs?: number;
    readonly clock?: () => string;
    readonly onRecord?: (record: RoutingTelemetry) => void;
}
export declare class RoutingTelemetryEmitter {
    private readonly entries;
    private readonly maxEntries;
    private readonly windowMs;
    private readonly clock;
    private readonly onRecord;
    constructor(options?: TelemetryEmitterOptions);
    /**
     * Emit a telemetry record from a completed routing decision.
     * Enforces the rolling window (time + count) before appending.
     */
    emit(request: RoutingRequest, decision: RoutingDecision): RoutingTelemetry;
    /** Current number of retained entries. */
    get size(): number;
    /** Snapshot of all retained entries (newest last). */
    snapshot(): readonly RoutingTelemetry[];
}
//# sourceMappingURL=routing-telemetry.d.ts.map
