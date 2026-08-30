/**
 * Persistence port for routing state.
 * Implementations live in infrastructure/ (SQLite, in-memory for tests).
 *
 * SP-234 / #142 — sync semantics: the SQLite implementation (SqliteStore) is
 * backed by better-sqlite3, whose calls are SYNCHRONOUS even on methods
 * declared `async` (the body runs on the event loop before the promise is
 * returned). Callers must not assume `void store.putSessionPin(p).catch(...)`
 * moves work off the hot path. Write batching/off-loading is handled by the
 * bounded write queue (docs/sqlite-write-queue-design.md; SP-235 wiring).
 *
 * SP-236 / #142 — caller contract for hot-path writes:
 * 1. Write methods (`putSessionPin`, `deleteSessionPin`, `appendTelemetry`,
 *    `appendDatasetRecord`, `appendOutcomeRecord`) are NON-BLOCKING ENQUEUE
 *    operations on SqliteStore. The returned promise settles after the
 *    in-memory enqueue; the SQLite write lands in the next flush transaction
 *    (≤ flushIntervalMs, default 250 ms).
 * 2. Hot-path write promises MUST NOT reject asynchronously. Implementations
 *    surface write failures through their own channel (write-queue flush
 *    logging + stats), so sync callers may deliberately discard the promise
 *    with `void` and no `.catch()` — attaching `.catch()` to a synchronous
 *    better-sqlite3 body never moved work off the event loop anyway.
 * 3. Reads (`getSessionPin`, `list*`, `getPriceCatalog`, `getModelProfiles`)
 *    flush pending writes first (read-your-writes) and stay synchronous.
 */

import type { ModelProfile, PriceCatalog, RoutingDatasetRecord, RoutingOutcomeRecord, RoutingTelemetry, RoutingUsageActuals, SessionPin } from './entities.js';

export interface ListTelemetryOptions {
  readonly limit?: number;
  readonly sessionId?: string;
}

export interface ListDatasetOptions {
  readonly limit?: number;
}

export interface ListOutcomeOptions {
  readonly limit?: number;
  readonly requestId?: string;
  readonly sessionId?: string;
}

export interface StorePort {
  /** Retrieve an active session pin, or null if unpinned. */
  getSessionPin(sessionId: string): Promise<SessionPin | null>;

  /**
   * Upsert a session pin (create or replace).
   * Sync semantics (SP-236): non-blocking enqueue on the bounded write queue
   * (DURABLE class — never dropped; a full queue forces a synchronous flush).
   * The promise settles after the enqueue and must not reject asynchronously;
   * failures surface at flush time via the write queue. Sync callers use
   * `void store.putSessionPin(pin)` with no `.catch()`.
   */
  putSessionPin(pin: SessionPin): Promise<void>;

  /**
   * Delete a session pin (e.g. on explicit unpin).
   * Sync semantics (SP-236): same queue/async boundary as putSessionPin —
   * non-blocking DURABLE enqueue; the promise must not reject asynchronously.
   */
  deleteSessionPin(sessionId: string): Promise<void>;

  /** Load the full model fleet catalog. */
  getModelProfiles(): Promise<readonly ModelProfile[]>;

  /** Load the current price catalog. */
  getPriceCatalog(): Promise<PriceCatalog | null>;

  /** Persist an updated price catalog. */
  putPriceCatalog(catalog: PriceCatalog): Promise<void>;

  /**
   * Append a routing telemetry audit record (sync hot path).
   * Sync semantics (SP-236): non-blocking enqueue (LOSSY class — drop-oldest
   * under backpressure); INSERT + eviction run once per flush batch.
   */
  appendTelemetry(entry: RoutingTelemetry): void;

  /** List recent telemetry rows, newest first. */
  listTelemetry(options?: ListTelemetryOptions): Promise<readonly RoutingTelemetry[]>;

  /**
   * Attach post-turn usage actuals to the newest telemetry row for a request
   * (SP-241, #164). Optional: stores without update support omit it and
   * callers must fail open (`store.updateTelemetryUsageActuals?.(...)`) so a
   * missing capability never fails the route.
   */
  updateTelemetryUsageActuals?(requestId: string, actuals: RoutingUsageActuals): void;

  /**
   * Append a privacy-safe routing dataset record (sync hot path).
   * Sync semantics (SP-236): non-blocking LOSSY enqueue, as appendTelemetry.
   */
  appendDatasetRecord(entry: RoutingDatasetRecord): void;

  /** List recent dataset rows, newest first. */
  listDatasetRecords(options?: ListDatasetOptions): Promise<readonly RoutingDatasetRecord[]>;

  /**
   * Append a behavioral outcome label (sync hot path).
   * Sync semantics (SP-236): non-blocking LOSSY enqueue, as appendTelemetry.
   */
  appendOutcomeRecord(entry: RoutingOutcomeRecord): void;

  /** List recent outcome rows, newest first. */
  listOutcomeRecords(options?: ListOutcomeOptions): Promise<readonly RoutingOutcomeRecord[]>;
}
