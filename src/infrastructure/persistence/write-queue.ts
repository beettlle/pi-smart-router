/**
 * Bounded in-memory write queue for SQLite hot-path writes — SP-234 / #142.
 *
 * STATUS: design stub only. Not wired into production writers — SP-235
 * implements `createWriteQueue` and wires `SqliteStore` (or a decorating
 * store) to enqueue; SP-236 removes the `void … .catch()` fire-and-forget
 * in session-pinner.ts and benchmarks event-loop lag.
 *
 * Full audit + latency tradeoff: docs/sqlite-write-queue-design.md.
 *
 * Why this exists: better-sqlite3 is synchronous. Telemetry/dataset/outcome
 * appends (plus per-call eviction) and pseudo-async pin writes all execute
 * on the Node event loop inside the routing hot path. This queue moves those
 * writes to a single batched transaction per flush interval, trading a
 * bounded write-visibility/durability lag (≤ flushIntervalMs, default 250 ms)
 * for a non-blocking hot path. Rate limiting (`consumeToken`) is deliberately
 * excluded — it is an atomic read-modify-write and must stay synchronous.
 */

import type {
  RoutingDatasetRecord,
  RoutingOutcomeRecord,
  RoutingTelemetry,
  SessionPin,
} from '../../domain/types/entities.js';

// ─── Write operations ───────────────────────────────────────────────────────

/**
 * Durability classes (docs/sqlite-write-queue-design.md §3.3):
 * - durable: pin upsert/delete — never dropped; full queue forces a sync flush.
 * - lossy: telemetry/dataset/outcome appends — drop-oldest under backpressure.
 */
export type WriteOp =
  | { readonly kind: 'put-pin'; readonly pin: SessionPin }
  | { readonly kind: 'delete-pin'; readonly sessionId: string }
  | { readonly kind: 'append-telemetry'; readonly entry: RoutingTelemetry }
  | { readonly kind: 'append-dataset'; readonly entry: RoutingDatasetRecord }
  | { readonly kind: 'append-outcome'; readonly entry: RoutingOutcomeRecord };

/** Ops that must not be silently dropped (durability-relevant pin state). */
export const DURABLE_OP_KINDS: ReadonlySet<WriteOp['kind']> = new Set([
  'put-pin',
  'delete-pin',
]);

export interface WriteQueueStats {
  /** Total ops accepted since creation. */
  readonly enqueued: number;
  /** Lossy ops dropped by backpressure (drop-oldest). */
  readonly dropped: number;
  /** Total ops written to SQLite across all flushes. */
  readonly flushed: number;
  /** Number of flush cycles executed. */
  readonly flushCount: number;
}

export interface WriteQueueOptions {
  /**
   * Flush interval in ms. Writes become visible/durable at most this long
   * after enqueue. Default 250. Timer is unref'd — never keeps pi alive.
   */
  readonly flushIntervalMs?: number;
  /** Flush immediately when this many ops are pending. Default 64. */
  readonly maxBatchSize?: number;
  /**
   * Hard capacity. When full, oldest lossy ops are dropped (counted in
   * stats.dropped); a queue full of durable ops forces a synchronous flush
   * (block once rather than lose pin state). Default 1024.
   */
  readonly capacity?: number;
}

export interface WriteQueue {
  /**
   * Enqueue one op, applying backpressure. Returns false when the op was
   * dropped (lossy class only — durable ops always return true, flushing
   * synchronously first if the queue is full).
   */
  enqueue(op: WriteOp): boolean;
  /**
   * Drain all pending ops in a single SQLite transaction. Eviction for the
   * append-only tables runs once per flush, not once per INSERT. Called by
   * the interval timer, the size trigger, and close().
   */
  flush(): void;
  /** Flush synchronously and stop the timer. Call on session teardown. */
  close(): void;
  readonly stats: WriteQueueStats;
}

export const DEFAULT_FLUSH_INTERVAL_MS = 250;
export const DEFAULT_MAX_BATCH_SIZE = 64;
export const DEFAULT_QUEUE_CAPACITY = 1024;

/**
 * SP-235 implementation seam. The factory will own the flush timer and call
 * the provided sink once per flush with the drained batch (to be applied in
 * one transaction by SqliteStore).
 */
export type WriteBatchSink = (batch: readonly WriteOp[]) => void;

export function createWriteQueue(
  sink: WriteBatchSink,
  options?: WriteQueueOptions,
): WriteQueue {
  // Preserve signature for SP-235; stub does not use args yet.
  void sink;
  void options;
  // SP-235: implement bounded queue (timer + size-triggered flush,
  // drop-oldest lossy backpressure, sync-flush durable backpressure).
  throw new Error('write queue not implemented — lands in SP-235 (see docs/sqlite-write-queue-design.md)');
}
