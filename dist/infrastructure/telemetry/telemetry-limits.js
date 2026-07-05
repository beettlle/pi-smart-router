/**
 * Shared retention bounds for routing telemetry (in-memory and SQLite).
 */
export const TELEMETRY_WINDOW_HOURS = 168;
export const TELEMETRY_WINDOW_MS = TELEMETRY_WINDOW_HOURS * 60 * 60 * 1000;
export const TELEMETRY_MAX_ENTRIES = 1111;
export const DEFAULT_HISTORY_LIMIT = 10;
export const MAX_HISTORY_LIMIT = 100;
/** Remove entries older than the rolling window. */
export function evictExpiredTelemetryEntries(entries, windowMs = TELEMETRY_WINDOW_MS) {
    const cutoff = Date.now() - windowMs;
    while (entries.length > 0) {
        const oldest = entries[0];
        if (new Date(oldest.timestamp).getTime() < cutoff) {
            entries.shift();
        }
        else {
            break;
        }
    }
}
/** Trim oldest entries until count is at most maxEntries. */
export function trimTelemetryEntriesToMax(entries, maxEntries = TELEMETRY_MAX_ENTRIES) {
    while (entries.length > maxEntries) {
        entries.shift();
    }
}
/** Make room for one more entry before append. */
export function makeTelemetryRoom(entries, maxEntries = TELEMETRY_MAX_ENTRIES) {
    evictExpiredTelemetryEntries(entries);
    while (entries.length >= maxEntries) {
        entries.shift();
    }
}
//# sourceMappingURL=telemetry-limits.js.map
