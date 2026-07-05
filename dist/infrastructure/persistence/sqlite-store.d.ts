/**
 * SQLite-backed persistence store for routing state.
 *
 * Implements StorePort from domain types, plus token-bucket rate limiting.
 * Uses WAL journal mode for concurrent reads and BEGIN IMMEDIATE for
 * atomic token-bucket operations (prevents TOCTOU on rate_limits table).
 *
 * Maps to T013 in the routing pipeline spec.
 */
import type { ModelProfile, PriceCatalog, RoutingDatasetRecord, RoutingTelemetry, SessionPin } from '../../domain/types/entities.js';
import type { ListDatasetOptions, ListTelemetryOptions, StorePort } from '../../domain/types/store-port.js';
export interface TokenBucketResult {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly retryAfterSeconds: number | null;
}
export interface SqliteStoreOptions {
    /** Path to SQLite database file, or ':memory:' for tests. */
    readonly dbPath: string;
    /** Fleet catalog (loaded from YAML config, not persisted in SQLite). */
    readonly models: readonly ModelProfile[];
}
export interface CreateStoreResult {
    readonly store: StorePort;
    readonly degraded: boolean;
}
/**
 * Create a persistence store with corrupt-DB recovery.
 *
 * Strategy:
 * 1. Attempt to open the SQLite DB and run migrations.
 * 2. On failure (corrupt/locked): rename the file, try fresh creation.
 * 3. If recreation also fails: fall back to MemoryStore.
 *
 * Never throws — the host agent must not crash due to persistence issues.
 */
export declare function createResilientStore(options: SqliteStoreOptions): CreateStoreResult;
export declare class SqliteStore implements StorePort {
    private readonly db;
    private readonly models;
    private readonly consumeTokenTx;
    constructor(options: SqliteStoreOptions);
    getSessionPin(sessionId: string): Promise<SessionPin | null>;
    putSessionPin(pin: SessionPin): Promise<void>;
    deleteSessionPin(sessionId: string): Promise<void>;
    getModelProfiles(): Promise<readonly ModelProfile[]>;
    getPriceCatalog(): Promise<PriceCatalog | null>;
    putPriceCatalog(catalog: PriceCatalog): Promise<void>;
    appendTelemetry(entry: RoutingTelemetry): void;
    listTelemetry(options?: ListTelemetryOptions): Promise<readonly RoutingTelemetry[]>;
    private evictTelemetryRows;
    appendDatasetRecord(entry: RoutingDatasetRecord): void;
    listDatasetRecords(options?: ListDatasetOptions): Promise<readonly RoutingDatasetRecord[]>;
    private evictDatasetRows;
    /**
     * Initialize a token bucket. Idempotent — existing buckets are unchanged.
     */
    initBucket(key: string, maxTokens: number, refillRate: number): void;
    /**
     * Atomically attempt to consume tokens from a bucket.
     *
     * Uses BEGIN IMMEDIATE to acquire a reserved lock before reading,
     * preventing TOCTOU races between concurrent consumers.
     */
    consumeToken(key: string, cost?: number): TokenBucketResult;
    /** Run PRAGMA integrity_check. Returns true if the database is healthy. */
    checkHealth(): boolean;
    /** Close the database connection. */
    close(): void;
    private initialize;
    private runMigrations;
    private buildConsumeTokenTx;
}
export declare class SqliteStoreError extends Error {
    readonly name = "SqliteStoreError";
    constructor(message: string, options?: ErrorOptions);
}
//# sourceMappingURL=sqlite-store.d.ts.map