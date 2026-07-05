/**
 * In-memory persistence store — fallback when SQLite is unavailable.
 *
 * Implements StorePort for process-local state. Data does not survive
 * process restart. Used as a safety net per FR-025: when the SQLite
 * state store is unavailable, degrade to in-memory rather than crash.
 */

import type { ModelProfile, PriceCatalog, RoutingDatasetRecord, RoutingOutcomeRecord, RoutingTelemetry, SessionPin } from '../../domain/types/entities.js';
import type { ListDatasetOptions, ListOutcomeOptions, ListTelemetryOptions, StorePort } from '../../domain/types/store-port.js';
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  TELEMETRY_MAX_ENTRIES,
  makeTelemetryRoom,
} from '../telemetry/telemetry-limits.js';
import {
  makeDatasetRoom,
} from '../telemetry/dataset-limits.js';
import {
  makeOutcomeRoom,
} from '../telemetry/outcome-limits.js';

export class MemoryStore implements StorePort {
  private readonly pins = new Map<string, SessionPin>();
  private readonly models: readonly ModelProfile[];
  private priceCatalog: PriceCatalog | null = null;
  private readonly telemetry: RoutingTelemetry[] = [];
  private readonly dataset: RoutingDatasetRecord[] = [];
  private readonly outcomes: RoutingOutcomeRecord[] = [];

  constructor(models: readonly ModelProfile[] = []) {
    this.models = models;
  }

  async getSessionPin(sessionId: string): Promise<SessionPin | null> {
    return this.pins.get(sessionId) ?? null;
  }

  async putSessionPin(pin: SessionPin): Promise<void> {
    this.pins.set(pin.session_id, pin);
  }

  async deleteSessionPin(sessionId: string): Promise<void> {
    this.pins.delete(sessionId);
  }

  async getModelProfiles(): Promise<readonly ModelProfile[]> {
    return this.models;
  }

  async getPriceCatalog(): Promise<PriceCatalog | null> {
    return this.priceCatalog;
  }

  async putPriceCatalog(catalog: PriceCatalog): Promise<void> {
    this.priceCatalog = catalog;
  }

  appendTelemetry(entry: RoutingTelemetry): void {
    makeTelemetryRoom(this.telemetry, TELEMETRY_MAX_ENTRIES);
    this.telemetry.push(entry);
  }

  async listTelemetry(options?: ListTelemetryOptions): Promise<readonly RoutingTelemetry[]> {
    const limit = clampHistoryLimit(options?.limit);
    const sessionId = options?.sessionId;

    const filtered = sessionId
      ? this.telemetry.filter((entry) => entry.session_id === sessionId)
      : this.telemetry;

    return [...filtered]
      .reverse()
      .slice(0, limit);
  }

  appendDatasetRecord(entry: RoutingDatasetRecord): void {
    makeDatasetRoom(this.dataset);
    this.dataset.push(entry);
  }

  async listDatasetRecords(
    options?: ListDatasetOptions,
  ): Promise<readonly RoutingDatasetRecord[]> {
    const limit = clampHistoryLimit(options?.limit);

    return [...this.dataset]
      .reverse()
      .slice(0, limit);
  }

  appendOutcomeRecord(entry: RoutingOutcomeRecord): void {
    makeOutcomeRoom(this.outcomes);
    this.outcomes.push(entry);
  }

  async listOutcomeRecords(
    options?: ListOutcomeOptions,
  ): Promise<readonly RoutingOutcomeRecord[]> {
    const limit = clampHistoryLimit(options?.limit);
    const requestId = options?.requestId;
    const sessionId = options?.sessionId;

    const filtered = requestId
      ? this.outcomes.filter((entry) => entry.request_id === requestId)
      : sessionId
        ? this.outcomes.filter((entry) => entry.session_id === sessionId)
        : this.outcomes;

    return [...filtered]
      .reverse()
      .slice(0, limit);
  }
}

function clampHistoryLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_HISTORY_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(limit)), MAX_HISTORY_LIMIT);
}
