/**
 * In-memory persistence store — fallback when SQLite is unavailable.
 *
 * Implements StorePort for process-local state. Data does not survive
 * process restart. Used as a safety net per FR-025: when the SQLite
 * state store is unavailable, degrade to in-memory rather than crash.
 */
import type { ModelProfile, PriceCatalog, RoutingTelemetry, SessionPin } from '../../domain/types/entities.js';
import type { ListTelemetryOptions, StorePort } from '../../domain/types/store-port.js';
export declare class MemoryStore implements StorePort {
    private readonly pins;
    private readonly models;
    private priceCatalog;
    private readonly telemetry;
    constructor(models?: readonly ModelProfile[]);
    getSessionPin(sessionId: string): Promise<SessionPin | null>;
    putSessionPin(pin: SessionPin): Promise<void>;
    deleteSessionPin(sessionId: string): Promise<void>;
    getModelProfiles(): Promise<readonly ModelProfile[]>;
    getPriceCatalog(): Promise<PriceCatalog | null>;
    putPriceCatalog(catalog: PriceCatalog): Promise<void>;
    appendTelemetry(entry: RoutingTelemetry): void;
    listTelemetry(options?: ListTelemetryOptions): Promise<readonly RoutingTelemetry[]>;
}
//# sourceMappingURL=memory-store.d.ts.map