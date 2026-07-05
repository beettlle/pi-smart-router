/**
 * Shared retention bounds for routing dataset records (in-memory and SQLite).
 * GitHub #8: 30 days / 10k rows.
 */

import type { RoutingDatasetRecord } from '../../domain/types/index.js';

export const DATASET_WINDOW_DAYS = 30;
export const DATASET_WINDOW_MS = DATASET_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const DATASET_MAX_ENTRIES = 10_000;

/** Remove dataset entries older than the rolling window. */
export function evictExpiredDatasetEntries(
  entries: RoutingDatasetRecord[],
  windowMs: number = DATASET_WINDOW_MS,
): void {
  const cutoff = Date.now() - windowMs;

  while (entries.length > 0) {
    const oldest = entries[0]!;
    if (new Date(oldest.timestamp).getTime() < cutoff) {
      entries.shift();
    } else {
      break;
    }
  }
}

/** Make room for one more dataset entry before append. */
export function makeDatasetRoom(
  entries: RoutingDatasetRecord[],
  maxEntries: number = DATASET_MAX_ENTRIES,
  windowMs: number = DATASET_WINDOW_MS,
): void {
  evictExpiredDatasetEntries(entries, windowMs);
  while (entries.length >= maxEntries) {
    entries.shift();
  }
}
