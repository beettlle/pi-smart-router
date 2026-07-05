/**
 * Shared retention bounds for routing telemetry (in-memory and SQLite).
 */
import type { RoutingTelemetry } from '../../domain/types/index.js';
export declare const TELEMETRY_WINDOW_HOURS = 168;
export declare const TELEMETRY_WINDOW_MS: number;
export declare const TELEMETRY_MAX_ENTRIES = 1111;
export declare const DEFAULT_HISTORY_LIMIT = 10;
export declare const MAX_HISTORY_LIMIT = 100;
/** Remove entries older than the rolling window. */
export declare function evictExpiredTelemetryEntries(entries: RoutingTelemetry[], windowMs?: number): void;
/** Trim oldest entries until count is at most maxEntries. */
export declare function trimTelemetryEntriesToMax(entries: RoutingTelemetry[], maxEntries?: number): void;
/** Make room for one more entry before append. */
export declare function makeTelemetryRoom(entries: RoutingTelemetry[], maxEntries?: number): void;
//# sourceMappingURL=telemetry-limits.d.ts.map