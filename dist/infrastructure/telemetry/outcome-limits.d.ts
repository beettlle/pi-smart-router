/**
 * Shared retention bounds for routing outcome labels (in-memory and SQLite).
 * Aligns with dataset retention (30 days / 10k rows).
 */
import type { RoutingOutcomeRecord } from '../../domain/types/index.js';
export declare const OUTCOME_MAX_ENTRIES = 10000;
export declare const OUTCOME_WINDOW_MS: number;
/** Remove outcome entries older than the rolling window. */
export declare function evictExpiredOutcomeEntries(entries: RoutingOutcomeRecord[], windowMs?: number): void;
/** Make room for one more outcome entry before append. */
export declare function makeOutcomeRoom(entries: RoutingOutcomeRecord[], maxEntries?: number, windowMs?: number): void;
//# sourceMappingURL=outcome-limits.d.ts.map