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
import type BetterSqlite3 from 'better-sqlite3';

import type { ModelProfile, PriceCatalog, RoutingDatasetRecord, RoutingOutcomeRecord, RoutingTelemetry, SessionPin } from '../../domain/types/entities.js';
import type { ListDatasetOptions, ListOutcomeOptions, ListTelemetryOptions, StorePort } from '../../domain/types/store-port.js';
import { MemoryStore } from './memory-store.js';
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  TELEMETRY_MAX_ENTRIES,
  TELEMETRY_WINDOW_MS,
} from '../telemetry/telemetry-limits.js';
import {
  DATASET_MAX_ENTRIES,
  DATASET_WINDOW_MS,
} from '../telemetry/dataset-limits.js';
import {
  OUTCOME_MAX_ENTRIES,
  OUTCOME_WINDOW_MS,
} from '../telemetry/outcome-limits.js';

// ─── Schema version & migrations ────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 5;

const MIGRATION_V1 = `
  CREATE TABLE IF NOT EXISTS pins (
    session_id TEXT PRIMARY KEY,
    pinned_model_id TEXT NOT NULL,
    pin_reason TEXT NOT NULL CHECK (pin_reason IN ('initial','user_forced','loop_escalation','compaction','cache_economics','context_overflow')),
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

const MIGRATION_V2 = `
  CREATE TABLE IF NOT EXISTS dataset (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    turn_type TEXT NOT NULL,
    stage TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    selected_model_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    candidates_json TEXT,
    prompt_length_chars INTEGER NOT NULL,
    estimated_input_tokens INTEGER,
    message_count INTEGER NOT NULL,
    has_tool_context INTEGER NOT NULL,
    compaction_flag INTEGER NOT NULL,
    triage_verdict TEXT,
    triage_reason_code TEXT,
    triage_cyclomatic_score REAL,
    triage_trivial_hits INTEGER,
    triage_complex_hits INTEGER,
    triage_sanitized_length_delta INTEGER,
    requirement_reasoning REAL,
    requirement_code_gen REAL,
    requirement_tool_use REAL,
    routing_latency_ms REAL NOT NULL,
    estimated_cost_usd REAL
  );

  CREATE INDEX IF NOT EXISTS idx_dataset_timestamp ON dataset(timestamp);
  CREATE INDEX IF NOT EXISTS idx_dataset_request ON dataset(request_id);
`;

const MIGRATION_V3 = `
  ALTER TABLE dataset ADD COLUMN prompt_fingerprint TEXT;
`;

const MIGRATION_V4 = `
  CREATE TABLE IF NOT EXISTS outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    signal_type TEXT NOT NULL CHECK (signal_type IN ('model_override','compaction_pin_break','feedback_good','feedback_bad')),
    routed_model_id TEXT,
    override_model_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp ON outcomes(timestamp);
  CREATE INDEX IF NOT EXISTS idx_outcomes_request ON outcomes(request_id);
  CREATE INDEX IF NOT EXISTS idx_outcomes_session ON outcomes(session_id);
`;

const MIGRATION_V5 = `
  CREATE TABLE pins_v5 (
    session_id TEXT PRIMARY KEY,
    pinned_model_id TEXT NOT NULL,
    pin_reason TEXT NOT NULL CHECK (pin_reason IN ('initial','user_forced','loop_escalation','compaction','cache_economics','context_overflow')),
    has_ever_switched INTEGER NOT NULL DEFAULT 0,
    consecutive_upstream_errors INTEGER NOT NULL DEFAULT 0,
    consecutive_tool_failures INTEGER NOT NULL DEFAULT 0,
    last_tool_failure_signature TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  INSERT INTO pins_v5 (
    session_id, pinned_model_id, pin_reason,
    has_ever_switched, consecutive_upstream_errors,
    consecutive_tool_failures, last_tool_failure_signature,
    created_at, updated_at
  )
  SELECT
    session_id, pinned_model_id, pin_reason,
    has_ever_switched, consecutive_upstream_errors,
    consecutive_tool_failures, last_tool_failure_signature,
    created_at, updated_at
  FROM pins;

  DROP TABLE pins;
  ALTER TABLE pins_v5 RENAME TO pins;
`;

// ─── Token bucket result ────────────────────────────────────────────────────

export interface TokenBucketResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number | null;
}

// ─── SqliteStore options ────────────────────────────────────────────────────

export interface SqliteStoreOptions {
  /** Path to SQLite database file, or ':memory:' for tests. */
  readonly dbPath: string;
  /** Fleet catalog (loaded from YAML config, not persisted in SQLite). */
  readonly models: readonly ModelProfile[];
}

// ─── Factory with resilient fallback (FR-025, T013b) ─────────────────────────

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
export function createResilientStore(options: SqliteStoreOptions): CreateStoreResult {
  if (options.dbPath === ':memory:') {
    return { store: new SqliteStore(options), degraded: false };
  }

  try {
    return { store: new SqliteStore(options), degraded: false };
  } catch (firstError: unknown) {
    console.warn(
      'SQLite store open failed; attempting corrupt-DB recovery',
      firstError,
    );
    try {
      const corruptPath = `${options.dbPath}.corrupt.${Date.now()}`;
      renameSync(options.dbPath, corruptPath);
    } catch {
      // Rename may fail if the file doesn't exist or permissions issue — continue to recreate attempt
    }

    try {
      return { store: new SqliteStore(options), degraded: false };
    } catch {
      return { store: new MemoryStore(options.models), degraded: true };
    }
  }
}

// ─── SqliteStore ────────────────────────────────────────────────────────────

export class SqliteStore implements StorePort {
  private readonly db: BetterSqlite3.Database;
  private readonly models: readonly ModelProfile[];
  private readonly consumeTokenTx: (key: string, cost: number) => TokenBucketResult;

  constructor(options: SqliteStoreOptions) {
    this.db = new Database(options.dbPath);
    this.models = options.models;
    this.initialize();
    this.consumeTokenTx = this.buildConsumeTokenTx();
  }

  // ─── StorePort: SessionPin ──────────────────────────────────────────────

  async getSessionPin(sessionId: string): Promise<SessionPin | null> {
    const row = this.db
      .prepare('SELECT * FROM pins WHERE session_id = ?')
      .get(sessionId) as PinRow | undefined;

    return row ? pinRowToEntity(row) : null;
  }

  async putSessionPin(pin: SessionPin): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO pins (
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
          updated_at = excluded.updated_at`,
      )
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

  async deleteSessionPin(sessionId: string): Promise<void> {
    this.db.prepare('DELETE FROM pins WHERE session_id = ?').run(sessionId);
  }

  // ─── StorePort: ModelProfile (read-only, from fleet catalog) ────────────

  async getModelProfiles(): Promise<readonly ModelProfile[]> {
    return this.models;
  }

  // ─── StorePort: PriceCatalog ────────────────────────────────────────────

  async getPriceCatalog(): Promise<PriceCatalog | null> {
    const row = this.db
      .prepare('SELECT * FROM price_cache WHERE id = 1')
      .get() as PriceCacheRow | undefined;

    if (!row) return null;

    return {
      registry_snapshot: JSON.parse(row.registry_snapshot) as Record<string, number>,
      user_overrides: JSON.parse(row.user_overrides) as Record<string, number>,
      last_updated: row.last_updated,
      source: row.source as PriceCatalog['source'],
    };
  }

  async putPriceCatalog(catalog: PriceCatalog): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO price_cache (id, registry_snapshot, user_overrides, last_updated, source)
         VALUES (1, @registry_snapshot, @user_overrides, @last_updated, @source)
         ON CONFLICT(id) DO UPDATE SET
           registry_snapshot = excluded.registry_snapshot,
           user_overrides = excluded.user_overrides,
           last_updated = excluded.last_updated,
           source = excluded.source`,
      )
      .run({
        registry_snapshot: JSON.stringify(catalog.registry_snapshot),
        user_overrides: JSON.stringify(catalog.user_overrides),
        last_updated: catalog.last_updated,
        source: catalog.source,
      });
  }

  // ─── Telemetry (append-only) ────────────────────────────────────────────

  appendTelemetry(entry: RoutingTelemetry): void {
    this.db
      .prepare(
        `INSERT INTO telemetry (
          timestamp, session_id, request_id, turn_type,
          stage, reason_code, selected_model_id,
          estimated_cost_usd, routing_latency_ms, pin_reason
        ) VALUES (
          @timestamp, @session_id, @request_id, @turn_type,
          @stage, @reason_code, @selected_model_id,
          @estimated_cost_usd, @routing_latency_ms, @pin_reason
        )`,
      )
      .run(entry);

    this.evictTelemetryRows();
  }

  async listTelemetry(options?: ListTelemetryOptions): Promise<readonly RoutingTelemetry[]> {
    const limit = clampHistoryLimit(options?.limit);
    const sessionId = options?.sessionId;

    const rows = sessionId
      ? (this.db
          .prepare(
            `SELECT * FROM telemetry
             WHERE session_id = ?
             ORDER BY id DESC
             LIMIT ?`,
          )
          .all(sessionId, limit) as TelemetryRow[])
      : (this.db
          .prepare(
            `SELECT * FROM telemetry
             ORDER BY id DESC
             LIMIT ?`,
          )
          .all(limit) as TelemetryRow[]);

    return rows.map(telemetryRowToEntity);
  }

  private evictTelemetryRows(): void {
    const cutoff = new Date(Date.now() - TELEMETRY_WINDOW_MS).toISOString();
    this.db.prepare('DELETE FROM telemetry WHERE timestamp < ?').run(cutoff);

    const countRow = this.db
      .prepare('SELECT COUNT(*) AS count FROM telemetry')
      .get() as { count: number };

    const excess = countRow.count - TELEMETRY_MAX_ENTRIES;
    if (excess <= 0) {
      return;
    }

    this.db
      .prepare(
        `DELETE FROM telemetry
         WHERE id IN (
           SELECT id FROM telemetry
           ORDER BY id ASC
           LIMIT ?
         )`,
      )
      .run(excess);
  }

  // ─── Dataset (append-only, privacy-safe) ────────────────────────────────

  appendDatasetRecord(entry: RoutingDatasetRecord): void {
    this.db
      .prepare(
        `INSERT INTO dataset (
          request_id, timestamp, turn_type, stage, reason_code,
          selected_model_id, tier, candidates_json,
          prompt_length_chars, estimated_input_tokens, message_count,
          has_tool_context, compaction_flag,
          triage_verdict, triage_reason_code, triage_cyclomatic_score,
          triage_trivial_hits, triage_complex_hits, triage_sanitized_length_delta,
          requirement_reasoning, requirement_code_gen, requirement_tool_use,
          routing_latency_ms, estimated_cost_usd, prompt_fingerprint
        ) VALUES (
          @request_id, @timestamp, @turn_type, @stage, @reason_code,
          @selected_model_id, @tier, @candidates_json,
          @prompt_length_chars, @estimated_input_tokens, @message_count,
          @has_tool_context, @compaction_flag,
          @triage_verdict, @triage_reason_code, @triage_cyclomatic_score,
          @triage_trivial_hits, @triage_complex_hits, @triage_sanitized_length_delta,
          @requirement_reasoning, @requirement_code_gen, @requirement_tool_use,
          @routing_latency_ms, @estimated_cost_usd, @prompt_fingerprint
        )`,
      )
      .run({
        request_id: entry.request_id,
        timestamp: entry.timestamp,
        turn_type: entry.turn_type,
        stage: entry.stage,
        reason_code: entry.reason_code,
        selected_model_id: entry.selected_model_id,
        tier: entry.tier,
        candidates_json: entry.candidates_json,
        prompt_length_chars: entry.prompt_length_chars,
        estimated_input_tokens: entry.estimated_input_tokens,
        message_count: entry.message_count,
        has_tool_context: entry.has_tool_context ? 1 : 0,
        compaction_flag: entry.compaction_flag ? 1 : 0,
        triage_verdict: entry.triage_verdict,
        triage_reason_code: entry.triage_reason_code,
        triage_cyclomatic_score: entry.triage_cyclomatic_score,
        triage_trivial_hits: entry.triage_trivial_hits,
        triage_complex_hits: entry.triage_complex_hits,
        triage_sanitized_length_delta: entry.triage_sanitized_length_delta,
        requirement_reasoning: entry.requirement_reasoning,
        requirement_code_gen: entry.requirement_code_gen,
        requirement_tool_use: entry.requirement_tool_use,
        routing_latency_ms: entry.routing_latency_ms,
        estimated_cost_usd: entry.estimated_cost_usd,
        prompt_fingerprint: entry.prompt_fingerprint,
      });

    this.evictDatasetRows();
  }

  async listDatasetRecords(
    options?: ListDatasetOptions,
  ): Promise<readonly RoutingDatasetRecord[]> {
    const limit = clampHistoryLimit(options?.limit);

    const rows = this.db
      .prepare(
        `SELECT * FROM dataset
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(limit) as DatasetRow[];

    return rows.map(datasetRowToEntity);
  }

  private evictDatasetRows(): void {
    const cutoff = new Date(Date.now() - DATASET_WINDOW_MS).toISOString();
    this.db.prepare('DELETE FROM dataset WHERE timestamp < ?').run(cutoff);

    const countRow = this.db
      .prepare('SELECT COUNT(*) AS count FROM dataset')
      .get() as { count: number };

    const excess = countRow.count - DATASET_MAX_ENTRIES;
    if (excess <= 0) {
      return;
    }

    this.db
      .prepare(
        `DELETE FROM dataset
         WHERE id IN (
           SELECT id FROM dataset
           ORDER BY id ASC
           LIMIT ?
         )`,
      )
      .run(excess);
  }

  // ─── Outcomes (append-only, privacy-safe) ───────────────────────────────

  appendOutcomeRecord(entry: RoutingOutcomeRecord): void {
    this.db
      .prepare(
        `INSERT INTO outcomes (
          request_id, session_id, timestamp, signal_type,
          routed_model_id, override_model_id
        ) VALUES (
          @request_id, @session_id, @timestamp, @signal_type,
          @routed_model_id, @override_model_id
        )`,
      )
      .run({
        request_id: entry.request_id,
        session_id: entry.session_id,
        timestamp: entry.timestamp,
        signal_type: entry.signal_type,
        routed_model_id: entry.routed_model_id,
        override_model_id: entry.override_model_id,
      });

    this.evictOutcomeRows();
  }

  async listOutcomeRecords(
    options?: ListOutcomeOptions,
  ): Promise<readonly RoutingOutcomeRecord[]> {
    const limit = clampHistoryLimit(options?.limit);
    const requestId = options?.requestId;
    const sessionId = options?.sessionId;

    const rows = requestId
      ? (this.db
          .prepare(
            `SELECT * FROM outcomes
             WHERE request_id = ?
             ORDER BY id DESC
             LIMIT ?`,
          )
          .all(requestId, limit) as OutcomeRow[])
      : sessionId
        ? (this.db
            .prepare(
              `SELECT * FROM outcomes
               WHERE session_id = ?
               ORDER BY id DESC
               LIMIT ?`,
            )
            .all(sessionId, limit) as OutcomeRow[])
        : (this.db
            .prepare(
              `SELECT * FROM outcomes
               ORDER BY id DESC
               LIMIT ?`,
            )
            .all(limit) as OutcomeRow[]);

    return rows.map(outcomeRowToEntity);
  }

  private evictOutcomeRows(): void {
    const cutoff = new Date(Date.now() - OUTCOME_WINDOW_MS).toISOString();
    this.db.prepare('DELETE FROM outcomes WHERE timestamp < ?').run(cutoff);

    const countRow = this.db
      .prepare('SELECT COUNT(*) AS count FROM outcomes')
      .get() as { count: number };

    const excess = countRow.count - OUTCOME_MAX_ENTRIES;
    if (excess <= 0) {
      return;
    }

    this.db
      .prepare(
        `DELETE FROM outcomes
         WHERE id IN (
           SELECT id FROM outcomes
           ORDER BY id ASC
           LIMIT ?
         )`,
      )
      .run(excess);
  }

  // ─── Token bucket (BEGIN IMMEDIATE) ─────────────────────────────────────

  /**
   * Initialize a token bucket. Idempotent — existing buckets are unchanged.
   */
  initBucket(key: string, maxTokens: number, refillRate: number): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO rate_limits (bucket_key, tokens, max_tokens, refill_rate, last_refill_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(key, maxTokens, maxTokens, refillRate, new Date().toISOString());
  }

  /**
   * Atomically attempt to consume tokens from a bucket.
   *
   * Uses BEGIN IMMEDIATE to acquire a reserved lock before reading,
   * preventing TOCTOU races between concurrent consumers.
   */
  consumeToken(key: string, cost: number = 1): TokenBucketResult {
    return this.consumeTokenTx(key, cost);
  }

  /** Run PRAGMA integrity_check. Returns true if the database is healthy. */
  checkHealth(): boolean {
    try {
      const result = this.db.pragma('integrity_check', { simple: true }) as string;
      return result === 'ok';
    } catch {
      return false;
    }
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private initialize(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
  }

  private runMigrations(): void {
    let version = this.db.pragma('user_version', { simple: true }) as number;

    if (version < 1) {
      this.db.exec(MIGRATION_V1);
      version = 1;
      this.db.pragma('user_version = 1');
    }

    if (version < 2) {
      this.db.exec(MIGRATION_V2);
      version = 2;
      this.db.pragma('user_version = 2');
    }

    if (version < 3) {
      this.db.exec(MIGRATION_V3);
      version = 3;
      this.db.pragma('user_version = 3');
    }

    if (version < 4) {
      this.db.exec(MIGRATION_V4);
      version = 4;
      this.db.pragma('user_version = 4');
    }

    if (version < 5) {
      this.db.exec(MIGRATION_V5);
      this.db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
    }
  }

  private buildConsumeTokenTx(): (key: string, cost: number) => TokenBucketResult {
    const selectBucket = this.db.prepare('SELECT * FROM rate_limits WHERE bucket_key = ?');
    const updateBucket = this.db.prepare(
      'UPDATE rate_limits SET tokens = ?, last_refill_at = ? WHERE bucket_key = ?',
    );

    return this.db.transaction((key: string, cost: number): TokenBucketResult => {
      const row = selectBucket.get(key) as RateLimitRow | undefined;

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
  override readonly name = 'SqliteStoreError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

// ─── Internal row types ───────────────────────────────────────────────────

interface PinRow {
  session_id: string;
  pinned_model_id: string;
  pin_reason: string;
  has_ever_switched: number;
  consecutive_upstream_errors: number;
  consecutive_tool_failures: number;
  last_tool_failure_signature: string | null;
  created_at: string;
  updated_at: string;
}

interface PriceCacheRow {
  id: number;
  registry_snapshot: string;
  user_overrides: string;
  last_updated: string;
  source: string;
}

interface RateLimitRow {
  bucket_key: string;
  tokens: number;
  max_tokens: number;
  refill_rate: number;
  last_refill_at: string;
}

interface TelemetryRow {
  id: number;
  timestamp: string;
  session_id: string;
  request_id: string;
  turn_type: string;
  stage: string;
  reason_code: string;
  selected_model_id: string;
  estimated_cost_usd: number;
  routing_latency_ms: number;
  pin_reason: string | null;
}

interface DatasetRow {
  id: number;
  request_id: string;
  timestamp: string;
  turn_type: string;
  stage: string;
  reason_code: string;
  selected_model_id: string;
  tier: string;
  candidates_json: string | null;
  prompt_length_chars: number;
  estimated_input_tokens: number | null;
  message_count: number;
  has_tool_context: number;
  compaction_flag: number;
  triage_verdict: string | null;
  triage_reason_code: string | null;
  triage_cyclomatic_score: number | null;
  triage_trivial_hits: number | null;
  triage_complex_hits: number | null;
  triage_sanitized_length_delta: number | null;
  requirement_reasoning: number | null;
  requirement_code_gen: number | null;
  requirement_tool_use: number | null;
  routing_latency_ms: number;
  estimated_cost_usd: number | null;
  prompt_fingerprint: string | null;
}

interface OutcomeRow {
  id: number;
  request_id: string;
  session_id: string;
  timestamp: string;
  signal_type: string;
  routed_model_id: string | null;
  override_model_id: string | null;
}

// ─── Row mappers ──────────────────────────────────────────────────────────

function clampHistoryLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_HISTORY_LIMIT;
  }
  return Math.min(Math.max(1, Math.floor(limit)), MAX_HISTORY_LIMIT);
}

function telemetryRowToEntity(row: TelemetryRow): RoutingTelemetry {
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

function datasetRowToEntity(row: DatasetRow): RoutingDatasetRecord {
  return {
    request_id: row.request_id,
    timestamp: row.timestamp,
    turn_type: row.turn_type,
    stage: row.stage,
    reason_code: row.reason_code,
    selected_model_id: row.selected_model_id,
    tier: row.tier as RoutingDatasetRecord['tier'],
    candidates_json: row.candidates_json,
    prompt_length_chars: row.prompt_length_chars,
    estimated_input_tokens: row.estimated_input_tokens,
    message_count: row.message_count,
    has_tool_context: row.has_tool_context === 1,
    compaction_flag: row.compaction_flag === 1,
    triage_verdict: row.triage_verdict,
    triage_reason_code: row.triage_reason_code,
    triage_cyclomatic_score: row.triage_cyclomatic_score,
    triage_trivial_hits: row.triage_trivial_hits,
    triage_complex_hits: row.triage_complex_hits,
    triage_sanitized_length_delta: row.triage_sanitized_length_delta,
    requirement_reasoning: row.requirement_reasoning,
    requirement_code_gen: row.requirement_code_gen,
    requirement_tool_use: row.requirement_tool_use,
    routing_latency_ms: row.routing_latency_ms,
    estimated_cost_usd: row.estimated_cost_usd,
    prompt_fingerprint: row.prompt_fingerprint,
  };
}

function outcomeRowToEntity(row: OutcomeRow): RoutingOutcomeRecord {
  return {
    request_id: row.request_id,
    session_id: row.session_id,
    timestamp: row.timestamp,
    signal_type: row.signal_type as RoutingOutcomeRecord['signal_type'],
    routed_model_id: row.routed_model_id,
    override_model_id: row.override_model_id,
  };
}

function pinRowToEntity(row: PinRow): SessionPin {
  return {
    session_id: row.session_id,
    pinned_model_id: row.pinned_model_id,
    pin_reason: row.pin_reason as SessionPin['pin_reason'],
    has_ever_switched: row.has_ever_switched === 1,
    consecutive_upstream_errors: row.consecutive_upstream_errors,
    consecutive_tool_failures: row.consecutive_tool_failures,
    last_tool_failure_signature: row.last_tool_failure_signature,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
