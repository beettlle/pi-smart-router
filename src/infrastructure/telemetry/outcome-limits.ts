/**
 * Shared retention bounds for routing outcome labels (in-memory and SQLite).
 * Aligns with dataset retention (30 days / 10k rows).
 */

import type { RoutingOutcomeRecord } from '../../domain/types/index.js';
import {
  DATASET_MAX_ENTRIES,
  DATASET_WINDOW_MS,
} from './dataset-limits.js';

export const OUTCOME_MAX_ENTRIES = DATASET_MAX_ENTRIES;
export const OUTCOME_WINDOW_MS = DATASET_WINDOW_MS;

/** Remove outcome entries older than the rolling window. */
export function evictExpiredOutcomeEntries(
  entries: RoutingOutcomeRecord[],
  windowMs: number = OUTCOME_WINDOW_MS,
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

/** Make room for one more outcome entry before append. */
export function makeOutcomeRoom(
  entries: RoutingOutcomeRecord[],
  maxEntries: number = OUTCOME_MAX_ENTRIES,
  windowMs: number = OUTCOME_WINDOW_MS,
): void {
  evictExpiredOutcomeEntries(entries, windowMs);
  while (entries.length >= maxEntries) {
    entries.shift();
  }
}
