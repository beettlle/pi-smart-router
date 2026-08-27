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
 */

import type { ModelProfile, PriceCatalog, RoutingDatasetRecord, RoutingOutcomeRecord, RoutingTelemetry, SessionPin } from './entities.js';

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

  /** Upsert a session pin (create or replace). */
  putSessionPin(pin: SessionPin): Promise<void>;

  /** Delete a session pin (e.g. on explicit unpin). */
  deleteSessionPin(sessionId: string): Promise<void>;

  /** Load the full model fleet catalog. */
  getModelProfiles(): Promise<readonly ModelProfile[]>;

  /** Load the current price catalog. */
  getPriceCatalog(): Promise<PriceCatalog | null>;

  /** Persist an updated price catalog. */
  putPriceCatalog(catalog: PriceCatalog): Promise<void>;

  /** Append a routing telemetry audit record (sync hot path). */
  appendTelemetry(entry: RoutingTelemetry): void;

  /** List recent telemetry rows, newest first. */
  listTelemetry(options?: ListTelemetryOptions): Promise<readonly RoutingTelemetry[]>;

  /** Append a privacy-safe routing dataset record (sync hot path). */
  appendDatasetRecord(entry: RoutingDatasetRecord): void;

  /** List recent dataset rows, newest first. */
  listDatasetRecords(options?: ListDatasetOptions): Promise<readonly RoutingDatasetRecord[]>;

  /** Append a behavioral outcome label (sync hot path). */
  appendOutcomeRecord(entry: RoutingOutcomeRecord): void;

  /** List recent outcome rows, newest first. */
  listOutcomeRecords(options?: ListOutcomeOptions): Promise<readonly RoutingOutcomeRecord[]>;
}
