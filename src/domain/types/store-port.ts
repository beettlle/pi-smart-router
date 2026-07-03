/**
 * Persistence port for routing state.
 * Implementations live in infrastructure/ (SQLite, in-memory for tests).
 */

import type { ModelProfile, PriceCatalog, SessionPin } from './entities.js';

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
}
