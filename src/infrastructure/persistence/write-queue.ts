/**
 * Bounded in-memory write queue for SQLite hot-path writes — SP-234 / #142.
 *
 * STATUS: implemented in SP-235 and wired into `SqliteStore` — hot-path
 * pin/telemetry/dataset/outcome writes enqueue here and are applied in one
 * transaction per flush. SP-236 removes the `void … .catch()` fire-and-forget
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
 * Factory owning the flush timer; calls the sink once per flush with the
 * drained batch (applied in one transaction by SqliteStore).
 */
export type WriteBatchSink = (batch: readonly WriteOp[]) => void;

/**
 * SP-235: bounded write queue.
 *
 * - FIFO pending buffer; interval + size-triggered flush into one sink call
 *   (the sink applies the whole batch in a single SQLite transaction).
 * - Backpressure: a full queue drops the OLDEST lossy op (telemetry/dataset/
 *   outcome audit rows) and counts it in stats.dropped; durable pin ops are
 *   never dropped — a queue full of durable ops forces a synchronous flush.
 * - flush() propagates sink errors to explicit callers (fail loud); the
 *   interval timer catches and warns instead (zero-crash resilience).
 */
class BoundedWriteQueue implements WriteQueue {
  private pending: WriteOp[] = [];
  private readonly timer: ReturnType<typeof setInterval>;
  private closed = false;
  private enqueuedCount = 0;
  private droppedCount = 0;
  private flushedCount = 0;
  private flushCycles = 0;
  private readonly maxBatchSize: number;
  private readonly capacity: number;

  constructor(
    private readonly sink: WriteBatchSink,
    options?: WriteQueueOptions,
  ) {
    const flushIntervalMs = options?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.maxBatchSize = options?.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    this.capacity = options?.capacity ?? DEFAULT_QUEUE_CAPACITY;

    this.timer = setInterval(() => {
      try {
        this.flush();
      } catch (error: unknown) {
        console.warn('Write queue interval flush failed', { error });
      }
    }, flushIntervalMs);
    // Never keep the pi host process alive for pending writes.
    this.timer.unref();
  }

  enqueue(op: WriteOp): boolean {
    const durable = DURABLE_OP_KINDS.has(op.kind);

    if (this.closed) {
      // Post-teardown writes are a caller bug, but never crash the host:
      // lossy ops drop; durable ops get one best-effort immediate write.
      if (!durable) {
        this.droppedCount++;
        return false;
      }
      try {
        this.sink([op]);
        this.flushedCount++;
        this.flushCycles++;
      } catch (error: unknown) {
        console.warn('Write queue post-close durable write failed', {
          kind: op.kind,
          error,
        });
      }
      return true;
    }

    if (this.pending.length >= this.capacity) {
      if (durable) {
        // Never drop pin state — block once and flush synchronously.
        this.flush();
      } else {
        const oldestLossy = this.pending.findIndex(
          (queued) => !DURABLE_OP_KINDS.has(queued.kind),
        );
        if (oldestLossy === -1) {
          // Queue is entirely durable ops — flush instead of dropping.
          this.flush();
        } else {
          this.pending.splice(oldestLossy, 1);
          this.droppedCount++;
        }
      }
    }

    this.pending.push(op);
    this.enqueuedCount++;

    // Size trigger: a burst cannot accumulate a full-interval backlog.
    if (this.pending.length >= this.maxBatchSize) {
      this.flush();
    }

    return true;
  }

  flush(): void {
    if (this.pending.length === 0) {
      return;
    }
    const batch = this.pending;
    this.pending = [];
    // If the sink throws, the drained batch is lost but the error propagates
    // to the explicit caller (fail fast, fail loud).
    this.sink(batch);
    this.flushedCount += batch.length;
    this.flushCycles++;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.timer);
    this.flush();
  }

  get stats(): WriteQueueStats {
    return {
      enqueued: this.enqueuedCount,
      dropped: this.droppedCount,
      flushed: this.flushedCount,
      flushCount: this.flushCycles,
    };
  }
}

export function createWriteQueue(
  sink: WriteBatchSink,
  options?: WriteQueueOptions,
): WriteQueue {
  return new BoundedWriteQueue(sink, options);
}
