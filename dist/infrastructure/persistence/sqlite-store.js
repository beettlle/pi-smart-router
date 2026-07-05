/**
 * SQLite-backed persistence store for routing state.
 *
 * Implements StorePort from domain types, plus token-bucket rate limiting.
 * Uses WAL journal mode for concurrent reads and BEGIN IMMEDIATE for
 * atomic token-bucket operations (prevents TOCTOU on rate_limits table).
 *
 * Maps to T013 in the routing pipeline spec.
 */
import { renameSync } from 'node:fs';
import Database from 'better-sqlite3';
import { MemoryStore } from './memory-store.js';
import { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT, TELEMETRY_MAX_ENTRIES, TELEMETRY_WINDOW_MS, } from '../telemetry/telemetry-limits.js';
// ─── Schema version & migrations ────────────────────────────────────────────
const CURRENT_SCHEMA_VERSION = 1;
const MIGRATION_V1 = `
  CREATE TABLE IF NOT EXISTS pins (
    session_id TEXT PRIMARY KEY,
    pinned_model_id TEXT NOT NULL,
    pin_reason TEXT NOT NULL CHECK (pin_reason IN ('initial','user_forced','loop_escalation','compaction','cache_economics')),
    has_ever_switched INTEGER NOT NULL DEFAULT 0,
    consecutive_upstream_errors INTEGER NOT NULL DEFAULT 0,
    consecutive_tool_failures INTEGER NOT NULL DEFAULT 0,
    last_tool_failure_signature TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key TEXT PRIMARY KEY,
    tokens REAL NOT NULL,
    max_tokens REAL NOT NULL,
    refill_rate REAL NOT NULL,
    last_refill_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    registry_snapshot TEXT NOT NULL,
    user_overrides TEXT NOT NULL,
    last_updated TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('override','registry','yaml_fallback'))
  );

  CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    turn_type TEXT NOT NULL,
    stage TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    selected_model_id TEXT NOT NULL,
    estimated_cost_usd REAL NOT NULL,
    routing_latency_ms REAL NOT NULL,
    pin_reason TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry(session_id);
  CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp);
`;
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
export function createResilientStore(options) {
    if (options.dbPath === ':memory:') {
        return { store: new SqliteStore(options), degraded: false };
    }
    try {
        return { store: new SqliteStore(options), degraded: false };
    }
    catch (firstError) {
        console.warn('SQLite store open failed; attempting corrupt-DB recovery', firstError);
        try {
            const corruptPath = `${options.dbPath}.corrupt.${Date.now()}`;
            renameSync(options.dbPath, corruptPath);
        }
        catch {
            // Rename may fail if the file doesn't exist or permissions issue — continue to recreate attempt
        }
        try {
            return { store: new SqliteStore(options), degraded: false };
        }
        catch {
            return { store: new MemoryStore(options.models), degraded: true };
        }
    }
}
// ─── SqliteStore ────────────────────────────────────────────────────────────
export class SqliteStore {
    db;
    models;
    consumeTokenTx;
    constructor(options) {
        this.db = new Database(options.dbPath);
        this.models = options.models;
        this.initialize();
        this.consumeTokenTx = this.buildConsumeTokenTx();
    }
    // ─── StorePort: SessionPin ──────────────────────────────────────────────
    async getSessionPin(sessionId) {
        const row = this.db
            .prepare('SELECT * FROM pins WHERE session_id = ?')
            .get(sessionId);
        return row ? pinRowToEntity(row) : null;
    }
    async putSessionPin(pin) {
        this.db
            .prepare(`INSERT INTO pins (
          session_id, pinned_model_id, pin_reason,
          has_ever_switched, consecutive_upstream_errors,
          consecutive_tool_failures, last_tool_failure_signature,
          created_at, updated_at
        ) VALUES (
          @session_id, @pinned_model_id, @pin_reason,
          @has_ever_switched, @consecutive_upstream_errors,
          @consecutive_tool_failures, @last_tool_failure_signature,
          @created_at, @updated_at
        )
        ON CONFLICT(session_id) DO UPDATE SET
          pinned_model_id = excluded.pinned_model_id,
          pin_reason = excluded.pin_reason,
          has_ever_switched = excluded.has_ever_switched,
          consecutive_upstream_errors = excluded.consecutive_upstream_errors,
          consecutive_tool_failures = excluded.consecutive_tool_failures,
          last_tool_failure_signature = excluded.last_tool_failure_signature,
          updated_at = excluded.updated_at`)
            .run({
            session_id: pin.session_id,
            pinned_model_id: pin.pinned_model_id,
            pin_reason: pin.pin_reason,
            has_ever_switched: pin.has_ever_switched ? 1 : 0,
            consecutive_upstream_errors: pin.consecutive_upstream_errors,
            consecutive_tool_failures: pin.consecutive_tool_failures,
            last_tool_failure_signature: pin.last_tool_failure_signature,
            created_at: pin.created_at,
            updated_at: pin.updated_at,
        });
    }
    async deleteSessionPin(sessionId) {
        this.db.prepare('DELETE FROM pins WHERE session_id = ?').run(sessionId);
    }
    // ─── StorePort: ModelProfile (read-only, from fleet catalog) ────────────
    async getModelProfiles() {
        return this.models;
    }
    // ─── StorePort: PriceCatalog ────────────────────────────────────────────
    async getPriceCatalog() {
        const row = this.db
            .prepare('SELECT * FROM price_cache WHERE id = 1')
            .get();
        if (!row)
            return null;
        return {
            registry_snapshot: JSON.parse(row.registry_snapshot),
            user_overrides: JSON.parse(row.user_overrides),
            last_updated: row.last_updated,
            source: row.source,
        };
    }
    async putPriceCatalog(catalog) {
        this.db
            .prepare(`INSERT INTO price_cache (id, registry_snapshot, user_overrides, last_updated, source)
         VALUES (1, @registry_snapshot, @user_overrides, @last_updated, @source)
         ON CONFLICT(id) DO UPDATE SET
           registry_snapshot = excluded.registry_snapshot,
           user_overrides = excluded.user_overrides,
           last_updated = excluded.last_updated,
           source = excluded.source`)
            .run({
            registry_snapshot: JSON.stringify(catalog.registry_snapshot),
            user_overrides: JSON.stringify(catalog.user_overrides),
            last_updated: catalog.last_updated,
            source: catalog.source,
        });
    }
    // ─── Telemetry (append-only) ────────────────────────────────────────────
    appendTelemetry(entry) {
        this.db
            .prepare(`INSERT INTO telemetry (
          timestamp, session_id, request_id, turn_type,
          stage, reason_code, selected_model_id,
          estimated_cost_usd, routing_latency_ms, pin_reason
        ) VALUES (
          @timestamp, @session_id, @request_id, @turn_type,
          @stage, @reason_code, @selected_model_id,
          @estimated_cost_usd, @routing_latency_ms, @pin_reason
        )`)
            .run(entry);
        this.evictTelemetryRows();
    }
    async listTelemetry(options) {
        const limit = clampHistoryLimit(options?.limit);
        const sessionId = options?.sessionId;
        const rows = sessionId
            ? this.db
                .prepare(`SELECT * FROM telemetry
             WHERE session_id = ?
             ORDER BY id DESC
             LIMIT ?`)
                .all(sessionId, limit)
            : this.db
                .prepare(`SELECT * FROM telemetry
             ORDER BY id DESC
             LIMIT ?`)
                .all(limit);
        return rows.map(telemetryRowToEntity);
    }
    evictTelemetryRows() {
        const cutoff = new Date(Date.now() - TELEMETRY_WINDOW_MS).toISOString();
        this.db.prepare('DELETE FROM telemetry WHERE timestamp < ?').run(cutoff);
        const countRow = this.db
            .prepare('SELECT COUNT(*) AS count FROM telemetry')
            .get();
        const excess = countRow.count - TELEMETRY_MAX_ENTRIES;
        if (excess <= 0) {
            return;
        }
        this.db
            .prepare(`DELETE FROM telemetry
         WHERE id IN (
           SELECT id FROM telemetry
           ORDER BY id ASC
           LIMIT ?
         )`)
            .run(excess);
    }
    // ─── Token bucket (BEGIN IMMEDIATE) ─────────────────────────────────────
    /**
     * Initialize a token bucket. Idempotent — existing buckets are unchanged.
     */
    initBucket(key, maxTokens, refillRate) {
        this.db
            .prepare(`INSERT OR IGNORE INTO rate_limits (bucket_key, tokens, max_tokens, refill_rate, last_refill_at)
         VALUES (?, ?, ?, ?, ?)`)
            .run(key, maxTokens, maxTokens, refillRate, new Date().toISOString());
    }
    /**
     * Atomically attempt to consume tokens from a bucket.
     *
     * Uses BEGIN IMMEDIATE to acquire a reserved lock before reading,
     * preventing TOCTOU races between concurrent consumers.
     */
    consumeToken(key, cost = 1) {
        return this.consumeTokenTx(key, cost);
    }
    /** Run PRAGMA integrity_check. Returns true if the database is healthy. */
    checkHealth() {
        try {
            const result = this.db.pragma('integrity_check', { simple: true });
            return result === 'ok';
        }
        catch {
            return false;
        }
    }
    /** Close the database connection. */
    close() {
        this.db.close();
    }
    // ─── Internals ──────────────────────────────────────────────────────────
    initialize() {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.pragma('foreign_keys = ON');
        this.runMigrations();
    }
    runMigrations() {
        const currentVersion = this.db.pragma('user_version', { simple: true });
        if (currentVersion < CURRENT_SCHEMA_VERSION) {
            this.db.exec(MIGRATION_V1);
            this.db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
        }
    }
    buildConsumeTokenTx() {
        const selectBucket = this.db.prepare('SELECT * FROM rate_limits WHERE bucket_key = ?');
        const updateBucket = this.db.prepare('UPDATE rate_limits SET tokens = ?, last_refill_at = ? WHERE bucket_key = ?');
        return this.db.transaction((key, cost) => {
            const row = selectBucket.get(key);
            if (!row) {
                throw new SqliteStoreError(`Token bucket not found: ${key}`);
            }
            const now = Date.now();
            const lastRefill = new Date(row.last_refill_at).getTime();
            const elapsedSeconds = Math.max(0, (now - lastRefill) / 1000);
            const refilled = Math.min(row.max_tokens, row.tokens + elapsedSeconds * row.refill_rate);
            if (refilled >= cost) {
                const remaining = refilled - cost;
                updateBucket.run(remaining, new Date(now).toISOString(), key);
                return { allowed: true, remaining, retryAfterSeconds: null };
            }
            updateBucket.run(refilled, new Date(now).toISOString(), key);
            const deficit = cost - refilled;
            const retryAfterSeconds = Math.ceil(deficit / row.refill_rate);
            return { allowed: false, remaining: refilled, retryAfterSeconds };
        }).immediate;
    }
}
// ─── Error type ───────────────────────────────────────────────────────────
export class SqliteStoreError extends Error {
    name = 'SqliteStoreError';
    constructor(message, options) {
        super(message, options);
    }
}
// ─── Row mappers ──────────────────────────────────────────────────────────
function clampHistoryLimit(limit) {
    if (limit === undefined) {
        return DEFAULT_HISTORY_LIMIT;
    }
    return Math.min(Math.max(1, Math.floor(limit)), MAX_HISTORY_LIMIT);
}
function telemetryRowToEntity(row) {
    return {
        timestamp: row.timestamp,
        session_id: row.session_id,
        request_id: row.request_id,
        turn_type: row.turn_type,
        stage: row.stage,
        reason_code: row.reason_code,
        selected_model_id: row.selected_model_id,
        estimated_cost_usd: row.estimated_cost_usd,
        routing_latency_ms: row.routing_latency_ms,
        pin_reason: row.pin_reason,
    };
}
function pinRowToEntity(row) {
    return {
        session_id: row.session_id,
        pinned_model_id: row.pinned_model_id,
        pin_reason: row.pin_reason,
        has_ever_switched: row.has_ever_switched === 1,
        consecutive_upstream_errors: row.consecutive_upstream_errors,
        consecutive_tool_failures: row.consecutive_tool_failures,
        last_tool_failure_signature: row.last_tool_failure_signature,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
//# sourceMappingURL=sqlite-store.js.map