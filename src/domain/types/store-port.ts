/**
 * Persistence port for routing state.
 * Implementations live in infrastructure/ (SQLite, in-memory for tests).
 */

import type { ModelProfile, PriceCatalog, RoutingDatasetRecord, RoutingTelemetry, SessionPin } from './entities.js';

export interface ListTelemetryOptions {
  readonly limit?: number;
  readonly sessionId?: string;
}

export interface ListDatasetOptions {
  readonly limit?: number;
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
}
