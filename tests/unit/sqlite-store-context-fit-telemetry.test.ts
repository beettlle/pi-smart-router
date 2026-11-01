import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type { RoutingTelemetry } from '../../src/domain/types/entities.js';
import { SqliteStore } from '../../src/infrastructure/persistence/sqlite-store.js';
import {
  DEFAULT_BREAKEVEN_TELEMETRY_FIELDS,
  DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
  DEFAULT_PIN_ONLY_FALLBACK_TELEMETRY_FIELDS,
  DEFAULT_PLANNING_DELEGATE_TELEMETRY_FIELDS,
  DEFAULT_SAAR_TELEMETRY_FIELDS,
  DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
} from '../../src/infrastructure/telemetry/routing-telemetry.js';

function makeTelemetryEntry(overrides: Partial<RoutingTelemetry> = {}): RoutingTelemetry {
  return {
    timestamp: new Date().toISOString(),
    session_id: 'sess-fit',
    request_id: 'req-fit',
    turn_type: 'main_loop',
    stage: 'context_fit',
    reason_code: 'context_fit_viable',
    selected_model_id: 'gpt-4o-mini',
    estimated_cost_usd: 0.001,
    routing_latency_ms: 4,
    pin_reason: null,
    ...DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
    ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
    ...DEFAULT_BREAKEVEN_TELEMETRY_FIELDS,
    ...DEFAULT_SAAR_TELEMETRY_FIELDS,
    ...DEFAULT_PLANNING_DELEGATE_TELEMETRY_FIELDS,
    ...DEFAULT_PIN_ONLY_FALLBACK_TELEMETRY_FIELDS,
    ...overrides,
  };
}

/** Minimal v8 database: V1 tables + SP-241 actuals + SP-245 reasoning columns. */
const V8_SCHEMA = `
  CREATE TABLE pins (
    session_id TEXT PRIMARY KEY,
    pinned_model_id TEXT NOT NULL,
    pin_reason TEXT NOT NULL,
    has_ever_switched INTEGER NOT NULL DEFAULT 0,
    consecutive_upstream_errors INTEGER NOT NULL DEFAULT 0,
    consecutive_tool_failures INTEGER NOT NULL DEFAULT 0,
    last_tool_failure_signature TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE rate_limits (
    bucket_key TEXT PRIMARY KEY,
    tokens REAL NOT NULL,
    max_tokens REAL NOT NULL,
    refill_rate REAL NOT NULL,
    last_refill_at TEXT NOT NULL
  );

  CREATE TABLE telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    turn_type TEXT NOT NULL,
    stage TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    selected_model_id TEXT NOT NULL,
    estimated_cost_usd REAL NOT NULL,
    routing_latency_ms INTEGER NOT NULL,
    pin_reason TEXT,
    actual_cost_usd REAL,
    actual_input_tokens INTEGER,
    actual_output_tokens INTEGER,
    actual_cache_read_tokens INTEGER,
    actual_cache_write_tokens INTEGER,
    reasoning_level_requested TEXT,
    reasoning_level_applied TEXT,
    reasoning_reason_code TEXT
  );

  CREATE TABLE dataset (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    request_id TEXT NOT NULL,
    turn_type TEXT NOT NULL,
    hydra_scores_json TEXT NOT NULL,
    features_json TEXT NOT NULL,
    routing_decision_json TEXT NOT NULL,
    outcome_score REAL,
    prompt_length_chars INTEGER NOT NULL DEFAULT 0,
    prompt_fingerprint TEXT NOT NULL DEFAULT '0',
    embedding_json TEXT
  );
`;

const CONTEXT_FIT_COLUMNS = [
  'estimated_input_tokens',
  'context_fit_viable_count',
  'context_fit_rejected_json',
  'context_overflow_pin_break',
  'selected_model_max_input_tokens',
  'context_fit_reason_code',
] as const;

function telemetryColumnNames(db: Database.Database): string[] {
  const columns = db.prepare('PRAGMA table_info(telemetry)').all() as Array<{ name: string }>;
  return columns.map((column) => column.name);
}

describe('SqliteStore context-fit telemetry (SP-301)', () => {
  it('round-trips context-fit fields through append and list', async () => {
    const store = new SqliteStore({ dbPath: ':memory:', models: [] });
    try {
      const rejected = JSON.stringify([
        { model_id: 'granite-local', estimated_tokens: 45000, max_input_tokens: 4096 },
      ]);
      store.appendTelemetry(
        makeTelemetryEntry({
          request_id: 'req-roundtrip',
          estimated_input_tokens: 45000,
          context_fit_viable_count: 2,
          context_fit_rejected_json: rejected,
          context_overflow_pin_break: true,
          selected_model_max_input_tokens: 128000,
          context_fit_reason_code: 'pin_break_context_overflow',
        }),
      );

      const rows = await store.listTelemetry({ limit: 5 });
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.estimated_input_tokens).toBe(45000);
      expect(row.context_fit_viable_count).toBe(2);
      expect(row.context_fit_rejected_json).toBe(rejected);
      expect(row.context_overflow_pin_break).toBe(true);
      expect(row.selected_model_max_input_tokens).toBe(128000);
      expect(row.context_fit_reason_code).toBe('pin_break_context_overflow');
    } finally {
      store.close();
    }
  });

  it('round-trips null and false context-fit defaults', async () => {
    const store = new SqliteStore({ dbPath: ':memory:', models: [] });
    try {
      store.appendTelemetry(makeTelemetryEntry({ request_id: 'req-defaults' }));

      const rows = await store.listTelemetry({ limit: 5 });
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.estimated_input_tokens).toBeNull();
      expect(row.context_fit_viable_count).toBeNull();
      expect(row.context_fit_rejected_json).toBeNull();
      expect(row.context_overflow_pin_break).toBe(false);
      expect(row.selected_model_max_input_tokens).toBeNull();
      expect(row.context_fit_reason_code).toBeNull();
    } finally {
      store.close();
    }
  });

  it('persists context-fit fields across a store restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sqlite-context-fit-'));
    const dbPath = join(dir, 'router.db');
    try {
      const first = new SqliteStore({ dbPath, models: [] });
      try {
        first.appendTelemetry(
          makeTelemetryEntry({
            request_id: 'req-restart',
            estimated_input_tokens: 12000,
            context_fit_viable_count: 5,
            context_overflow_pin_break: false,
            selected_model_max_input_tokens: 32768,
            context_fit_reason_code: 'context_fit_ok',
          }),
        );
      } finally {
        first.close();
      }

      const second = new SqliteStore({ dbPath, models: [] });
      try {
        const rows = await second.listTelemetry({ limit: 5 });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.estimated_input_tokens).toBe(12000);
        expect(rows[0]?.context_fit_viable_count).toBe(5);
        expect(rows[0]?.context_overflow_pin_break).toBe(false);
        expect(rows[0]?.selected_model_max_input_tokens).toBe(32768);
        expect(rows[0]?.context_fit_reason_code).toBe('context_fit_ok');
      } finally {
        second.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates an old (v8) database additively and idempotently without data loss', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sqlite-context-fit-migration-'));
    const dbPath = join(dir, 'router.db');
    try {
      // Simulate a pre-SP-301 database: v8 schema, user_version = 8, one legacy row.
      const legacy = new Database(dbPath);
      legacy.exec(V8_SCHEMA);
      legacy.pragma('user_version = 8');
      legacy
        .prepare(
          `INSERT INTO telemetry (
            timestamp, session_id, request_id, turn_type,
            stage, reason_code, selected_model_id,
            estimated_cost_usd, routing_latency_ms, pin_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          // Must stay inside TELEMETRY_WINDOW_MS or appendTelemetry evicts it.
          new Date().toISOString(),
          'sess-legacy',
          'req-legacy',
          'main_loop',
          'context_fit',
          'context_fit_viable',
          'gpt-4o-mini',
          0.001,
          4,
          null,
        );
      legacy.close();

      // First open: applies MIGRATION_V9 on top of the v8 schema.
      const first = new SqliteStore({ dbPath, models: [] });
      try {
        const check = new Database(dbPath);
        try {
          expect(check.pragma('user_version', { simple: true })).toBe(9);
          const names = telemetryColumnNames(check);
          for (const column of CONTEXT_FIT_COLUMNS) {
            expect(names).toContain(column);
          }
        } finally {
          check.close();
        }

        // Legacy row survives with null/false context-fit defaults.
        const rows = await first.listTelemetry({ limit: 5 });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.request_id).toBe('req-legacy');
        expect(rows[0]?.estimated_input_tokens).toBeNull();
        expect(rows[0]?.context_fit_viable_count).toBeNull();
        expect(rows[0]?.context_fit_rejected_json).toBeNull();
        expect(rows[0]?.context_overflow_pin_break).toBe(false);
        expect(rows[0]?.selected_model_max_input_tokens).toBeNull();
        expect(rows[0]?.context_fit_reason_code).toBeNull();

        // New writes on the migrated DB persist context-fit fields.
        first.appendTelemetry(
          makeTelemetryEntry({
            request_id: 'req-after-migration',
            estimated_input_tokens: 9000,
            context_fit_viable_count: 3,
            context_fit_reason_code: 'context_fit_ok',
          }),
        );
        const after = await first.listTelemetry({ limit: 5 });
        const written = after.find((row) => row.request_id === 'req-after-migration');
        expect(written?.estimated_input_tokens).toBe(9000);
        expect(written?.context_fit_viable_count).toBe(3);
      } finally {
        first.close();
      }

      // Second open: migrations are idempotent (no duplicate-column error).
      const second = new SqliteStore({ dbPath, models: [] });
      try {
        const rows = await second.listTelemetry({ limit: 5 });
        expect(rows).toHaveLength(2);
        const check = new Database(dbPath);
        try {
          expect(check.pragma('user_version', { simple: true })).toBe(9);
        } finally {
          check.close();
        }
      } finally {
        second.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
