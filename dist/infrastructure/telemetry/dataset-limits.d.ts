/**
 * Shared retention bounds for routing dataset records (in-memory and SQLite).
 * GitHub #8: 30 days / 10k rows.
 */
import type { RoutingDatasetRecord } from '../../domain/types/index.js';
export declare const DATASET_WINDOW_DAYS = 30;
export declare const DATASET_WINDOW_MS: number;
export declare const DATASET_MAX_ENTRIES = 10000;
/** Remove dataset entries older than the rolling window. */
export declare function evictExpiredDatasetEntries(entries: RoutingDatasetRecord[], windowMs?: number): void;
/** Make room for one more dataset entry before append. */
export declare function makeDatasetRoom(entries: RoutingDatasetRecord[], maxEntries?: number, windowMs?: number): void;
//# sourceMappingURL=dataset-limits.d.ts.map