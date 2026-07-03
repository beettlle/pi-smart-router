/**
 * In-memory persistence store — fallback when SQLite is unavailable.
 *
 * Implements StorePort for process-local state. Data does not survive
 * process restart. Used as a safety net per FR-025: when the SQLite
 * state store is unavailable, degrade to in-memory rather than crash.
 */

import type { ModelProfile, PriceCatalog, SessionPin } from '../../domain/types/entities.js';
import type { StorePort } from '../../domain/types/store-port.js';

export class MemoryStore implements StorePort {
  private readonly pins = new Map<string, SessionPin>();
  private readonly models: readonly ModelProfile[];
  private priceCatalog: PriceCatalog | null = null;

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
}
