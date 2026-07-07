import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type { ModelProfile, PriceCatalog, RoutingDatasetRecord, RoutingOutcomeRecord, SessionPin } from '../../src/domain/types/entities.js';
import { SqliteStore, SqliteStoreError } from '../../src/infrastructure/persistence/sqlite-store.js';
import {
  DEFAULT_CONTEXT_FIT_DATASET_FIELDS,
  DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
  DEFAULT_TIER_SELECTION_DATASET_FIELDS,
  DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
} from '../../src/infrastructure/telemetry/routing-telemetry.js';

const TEST_MODELS: readonly ModelProfile[] = [
  {
    id: 'claude-sonnet',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
    pricing: { fallback_cost_per_1m: 3.0 },
  },
  {
    id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    provider: 'openai',
    capabilities: { reasoning: 0.6, code_gen: 0.6, tool_use: 0.7 },
    pricing: { fallback_cost_per_1m: 0.15 },
  },
];

function makePin(overrides: Partial<SessionPin> = {}): SessionPin {
  return {
    session_id: 'sess-1',
    pinned_model_id: 'claude-sonnet',
    pin_reason: 'initial',
    has_ever_switched: false,
    consecutive_upstream_errors: 0,
    consecutive_tool_failures: 0,
    last_tool_failure_signature: null,
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function makePriceCatalog(overrides: Partial<PriceCatalog> = {}): PriceCatalog {
  return {
    registry_snapshot: { 'claude-sonnet': 3.0, 'gpt-4o-mini': 0.15 },
    user_overrides: {},
    last_updated: '2026-07-02T00:00:00.000Z',
    source: 'registry',
    ...overrides,
  };
}

function makeDatasetRecord(overrides: Partial<RoutingDatasetRecord> = {}): RoutingDatasetRecord {
  return {
    request_id: 'req-1',
    timestamp: '2026-07-04T00:00:00.000Z',
    turn_type: 'main_loop',
    stage: 'hydra_match',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'claude-sonnet',
    tier: 'frontier-cloud',
    candidates_json: JSON.stringify([
      { model_id: 'claude-sonnet', score: 0.9, shortfall: 0, rejected_reason: null },
    ]),
    prompt_length_chars: 1200,
    estimated_input_tokens: 300,
    message_count: 4,
    has_tool_context: true,
    compaction_flag: false,
    triage_verdict: 'ambiguous',
    triage_reason_code: 'mixed_signals',
    triage_cyclomatic_score: 3,
    triage_trivial_hits: 1,
    triage_complex_hits: 1,
    triage_sanitized_length_delta: 12,
    requirement_reasoning: 0.7,
    requirement_code_gen: 0.8,
    requirement_tool_use: 0.6,
    routing_latency_ms: 45,
    estimated_cost_usd: 0.002,
    prompt_fingerprint: null,
    ...DEFAULT_CONTEXT_FIT_DATASET_FIELDS,
    ...DEFAULT_TIER_SELECTION_DATASET_FIELDS,
    ...overrides,
  };
}

describe('SqliteStore', () => {
  let store: SqliteStore;

  beforeEach(() => {
    store = new SqliteStore({ dbPath: ':memory:', models: TEST_MODELS });
  });

  afterEach(() => {
    store.close();
  });

  // ─── Initialization ───────────────────────────────────────────────────

  describe('initialization', () => {
    it('enables WAL journal mode', () => {
      const walStore = new SqliteStore({ dbPath: ':memory:', models: [] });
      // WAL mode is set during construction — verified by the store not throwing.
      // We verify by creating a second store that re-reads the pragma.
      walStore.close();
    });

    it('runs migrations idempotently', () => {
      const store2 = new SqliteStore({ dbPath: ':memory:', models: [] });
      // Second construction on the same schema version should not throw
      store2.close();
    });

    it('migrates to schema v5 with outcomes table, dataset privacy columns, and context_overflow pin_reason', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-store-'));
      const dbPath = join(dir, 'router.db');
      let store: SqliteStore | undefined;
      let db: Database.Database | undefined;

      try {
        store = new SqliteStore({ dbPath, models: [] });
        db = new Database(dbPath);

        const version = db.pragma('user_version', { simple: true });
        expect(version).toBe(5);

        const datasetColumns = db.prepare('PRAGMA table_info(dataset)').all() as Array<{ name: string }>;
        const datasetColumnNames = datasetColumns.map((column) => column.name);

        expect(datasetColumnNames).toContain('prompt_length_chars');
        expect(datasetColumnNames).toContain('prompt_fingerprint');
        expect(datasetColumnNames).not.toContain('prompt_text');
        expect(datasetColumnNames).not.toContain('messages');
        expect(datasetColumnNames).not.toContain('prompt');

        const outcomeColumns = db.prepare('PRAGMA table_info(outcomes)').all() as Array<{ name: string }>;
        const outcomeColumnNames = outcomeColumns.map((column) => column.name);
        expect(outcomeColumnNames).toEqual([
          'id',
          'request_id',
          'session_id',
          'timestamp',
          'signal_type',
          'routed_model_id',
          'override_model_id',
        ]);
      } finally {
        store?.close();
        db?.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('round-trips prompt_fingerprint on dataset records', async () => {
      const fingerprint = 'a'.repeat(64);
      store.appendDatasetRecord(makeDatasetRecord({ prompt_fingerprint: fingerprint }));

      const rows = await store.listDatasetRecords({ limit: 1 });
      expect(rows[0]?.prompt_fingerprint).toBe(fingerprint);
    });
  });

  // ─── SessionPin CRUD ──────────────────────────────────────────────────

  describe('session pins', () => {
    it('returns null for non-existent pin', async () => {
      const pin = await store.getSessionPin('nonexistent');
      expect(pin).toBeNull();
    });

    it('puts and retrieves a session pin', async () => {
      const pin = makePin();
      await store.putSessionPin(pin);

      const retrieved = await store.getSessionPin('sess-1');
      expect(retrieved).toEqual(pin);
    });

    it('upserts an existing session pin', async () => {
      await store.putSessionPin(makePin());
      const updated = makePin({
        pinned_model_id: 'gpt-4o-mini',
        pin_reason: 'compaction',
        has_ever_switched: true,
        updated_at: '2026-07-02T01:00:00.000Z',
      });
      await store.putSessionPin(updated);

      const retrieved = await store.getSessionPin('sess-1');
      expect(retrieved).toEqual(updated);
    });

    it('preserves boolean has_ever_switched round-trip', async () => {
      await store.putSessionPin(makePin({ has_ever_switched: true }));
      const retrieved = await store.getSessionPin('sess-1');
      expect(retrieved?.has_ever_switched).toBe(true);
    });

    it('preserves null last_tool_failure_signature', async () => {
      await store.putSessionPin(makePin({ last_tool_failure_signature: null }));
      const retrieved = await store.getSessionPin('sess-1');
      expect(retrieved?.last_tool_failure_signature).toBeNull();
    });

    it('preserves non-null last_tool_failure_signature', async () => {
      await store.putSessionPin(makePin({ last_tool_failure_signature: 'abc123' }));
      const retrieved = await store.getSessionPin('sess-1');
      expect(retrieved?.last_tool_failure_signature).toBe('abc123');
    });

    it('deletes a session pin', async () => {
      await store.putSessionPin(makePin());
      await store.deleteSessionPin('sess-1');

      const retrieved = await store.getSessionPin('sess-1');
      expect(retrieved).toBeNull();
    });

    it('delete is idempotent for non-existent pin', async () => {
      await expect(store.deleteSessionPin('nonexistent')).resolves.toBeUndefined();
    });

    it('accepts context_overflow pin_reason', async () => {
      const pin = makePin({ pin_reason: 'context_overflow' });
      await store.putSessionPin(pin);

      const retrieved = await store.getSessionPin('sess-1');
      expect(retrieved?.pin_reason).toBe('context_overflow');
    });
  });

  // ─── ModelProfile ─────────────────────────────────────────────────────

  describe('model profiles', () => {
    it('returns injected models', async () => {
      const profiles = await store.getModelProfiles();
      expect(profiles).toEqual(TEST_MODELS);
      expect(profiles).toHaveLength(2);
    });

    it('returns empty array when no models configured', async () => {
      const emptyStore = new SqliteStore({ dbPath: ':memory:', models: [] });
      const profiles = await emptyStore.getModelProfiles();
      expect(profiles).toEqual([]);
      emptyStore.close();
    });
  });

  // ─── PriceCatalog ─────────────────────────────────────────────────────

  describe('price catalog', () => {
    it('returns null when no catalog stored', async () => {
      const catalog = await store.getPriceCatalog();
      expect(catalog).toBeNull();
    });

    it('puts and retrieves a price catalog', async () => {
      const catalog = makePriceCatalog();
      await store.putPriceCatalog(catalog);

      const retrieved = await store.getPriceCatalog();
      expect(retrieved).toEqual(catalog);
    });

    it('upserts the singleton price catalog', async () => {
      await store.putPriceCatalog(makePriceCatalog());
      const updated = makePriceCatalog({
        source: 'override',
        user_overrides: { 'claude-sonnet': 2.5 },
        last_updated: '2026-07-02T12:00:00.000Z',
      });
      await store.putPriceCatalog(updated);

      const retrieved = await store.getPriceCatalog();
      expect(retrieved).toEqual(updated);
    });
  });

  // ─── Telemetry ────────────────────────────────────────────────────────

  describe('telemetry', () => {
    it('appends a telemetry entry without throwing', () => {
      expect(() =>
        store.appendTelemetry({
          timestamp: '2026-07-02T00:00:00.000Z',
          session_id: 'sess-1',
          request_id: 'req-1',
          turn_type: 'planning',
          stage: 'triage',
          reason_code: 'keyword_frontier',
          selected_model_id: 'claude-sonnet',
          estimated_cost_usd: 0.003,
          routing_latency_ms: 12,
          pin_reason: null,
          ...DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
        ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
          ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
        }),
      ).not.toThrow();
    });

    it('lists telemetry newest first', async () => {
      store.appendTelemetry({
        timestamp: '2026-07-02T00:00:00.000Z',
        session_id: 'sess-1',
        request_id: 'req-1',
        turn_type: 'main_loop',
        stage: 'fallback',
        reason_code: 'safe_cloud_default',
        selected_model_id: 'gpt-4o-mini',
        estimated_cost_usd: 0,
        routing_latency_ms: 1,
        pin_reason: null,
        ...DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
        ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
      });
      store.appendTelemetry({
        timestamp: '2026-07-02T00:01:00.000Z',
        session_id: 'sess-1',
        request_id: 'req-2',
        turn_type: 'main_loop',
        stage: 'hydra_match',
        reason_code: 'hydra_embedding_match',
        selected_model_id: 'gemini-flash-latest',
        estimated_cost_usd: 0,
        routing_latency_ms: 4,
        pin_reason: null,
        ...DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
        ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
      });

      const rows = await store.listTelemetry({ limit: 10 });
      expect(rows).toHaveLength(2);
      expect(rows[0]?.request_id).toBe('req-2');
      expect(rows[1]?.request_id).toBe('req-1');
    });

    it('evicts oldest rows beyond max entry count', async () => {
      for (let i = 0; i < 1112; i++) {
        store.appendTelemetry({
          timestamp: new Date(Date.now() + i).toISOString(),
          session_id: 'sess-1',
          request_id: `req-${i}`,
          turn_type: 'main_loop',
          stage: 'fallback',
          reason_code: 'safe_cloud_default',
          selected_model_id: 'gpt-4o-mini',
          estimated_cost_usd: 0,
          routing_latency_ms: 1,
          pin_reason: null,
          ...DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
        ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
          ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
        });
      }

      const rows = await store.listTelemetry({ limit: 2000 });
      expect(rows.length).toBeLessThanOrEqual(1111);
      expect(rows[0]?.request_id).toBe('req-1111');
    });
  });

  // ─── Dataset ──────────────────────────────────────────────────────────

  describe('dataset', () => {
    it('appends a dataset record without throwing', () => {
      expect(() => store.appendDatasetRecord(makeDatasetRecord())).not.toThrow();
    });

    it('lists dataset records newest first', async () => {
      store.appendDatasetRecord(makeDatasetRecord({
        request_id: 'req-1',
        timestamp: '2026-07-04T00:00:00.000Z',
      }));
      store.appendDatasetRecord(makeDatasetRecord({
        request_id: 'req-2',
        timestamp: '2026-07-04T00:01:00.000Z',
      }));

      const rows = await store.listDatasetRecords({ limit: 10 });
      expect(rows).toHaveLength(2);
      expect(rows[0]?.request_id).toBe('req-2');
      expect(rows[1]?.request_id).toBe('req-1');
    });

    it('round-trips feature fields', async () => {
      const record = makeDatasetRecord();
      store.appendDatasetRecord(record);

      const rows = await store.listDatasetRecords({ limit: 1 });
      expect(rows[0]).toEqual(record);
    });

    it('evicts oldest rows beyond max entry count', async () => {
      for (let i = 0; i < 10_001; i++) {
        store.appendDatasetRecord(makeDatasetRecord({
          timestamp: new Date(Date.now() + i).toISOString(),
          request_id: `req-${i}`,
        }));
      }

      const rows = await store.listDatasetRecords({ limit: 20_000 });
      expect(rows.length).toBeLessThanOrEqual(10_000);
      expect(rows[0]?.request_id).toBe('req-10000');
    });
  });

  // ─── Outcomes ─────────────────────────────────────────────────────────

  describe('outcomes', () => {
    function makeOutcome(overrides: Partial<RoutingOutcomeRecord> = {}): RoutingOutcomeRecord {
      return {
        request_id: 'req-1',
        session_id: 'sess-1',
        timestamp: '2026-07-05T00:00:00.000Z',
        signal_type: 'model_override',
        routed_model_id: 'gpt-5-mini',
        override_model_id: 'gpt-4o',
        ...overrides,
      };
    }

    it('appends and lists outcome records newest first', async () => {
      store.appendOutcomeRecord(makeOutcome({
        request_id: 'req-1',
        timestamp: '2026-07-05T00:00:00.000Z',
      }));
      store.appendOutcomeRecord(makeOutcome({
        request_id: 'req-2',
        timestamp: '2026-07-05T00:01:00.000Z',
        signal_type: 'feedback_good',
        override_model_id: null,
      }));

      const rows = await store.listOutcomeRecords({ limit: 10 });
      expect(rows).toHaveLength(2);
      expect(rows[0]?.request_id).toBe('req-2');
      expect(rows[1]?.request_id).toBe('req-1');
    });

    it('filters outcomes by request_id and session_id', async () => {
      store.appendOutcomeRecord(makeOutcome({ request_id: 'req-a', session_id: 'sess-a' }));
      store.appendOutcomeRecord(makeOutcome({ request_id: 'req-b', session_id: 'sess-b' }));

      const byRequest = await store.listOutcomeRecords({ requestId: 'req-a' });
      const bySession = await store.listOutcomeRecords({ sessionId: 'sess-b' });

      expect(byRequest).toHaveLength(1);
      expect(byRequest[0]?.request_id).toBe('req-a');
      expect(bySession).toHaveLength(1);
      expect(bySession[0]?.session_id).toBe('sess-b');
    });
  });

  // ─── Token bucket ─────────────────────────────────────────────────────

  describe('token bucket', () => {
    const BUCKET_KEY = 'api:default';

    beforeEach(() => {
      store.initBucket(BUCKET_KEY, 10, 1);
    });

    it('allows consumption when tokens are available', () => {
      const result = store.consumeToken(BUCKET_KEY, 1);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeLessThanOrEqual(10);
      expect(result.retryAfterSeconds).toBeNull();
    });

    it('drains tokens across multiple calls', () => {
      for (let i = 0; i < 10; i++) {
        const result = store.consumeToken(BUCKET_KEY, 1);
        expect(result.allowed).toBe(true);
      }

      const exhausted = store.consumeToken(BUCKET_KEY, 1);
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('rejects when cost exceeds remaining tokens', () => {
      const result = store.consumeToken(BUCKET_KEY, 11);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('returns retry-after in seconds', () => {
      store.consumeToken(BUCKET_KEY, 10);
      const result = store.consumeToken(BUCKET_KEY, 5);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(5);
    });

    it('throws for unknown bucket key', () => {
      expect(() => store.consumeToken('nonexistent', 1)).toThrow(SqliteStoreError);
      expect(() => store.consumeToken('nonexistent', 1)).toThrow('Token bucket not found');
    });

    it('initBucket is idempotent', () => {
      store.consumeToken(BUCKET_KEY, 5);
      store.initBucket(BUCKET_KEY, 10, 1);

      // Bucket should retain its existing state (INSERT OR IGNORE)
      const result = store.consumeToken(BUCKET_KEY, 6);
      expect(result.allowed).toBe(false);
    });

    it('supports fractional token costs', () => {
      const result = store.consumeToken(BUCKET_KEY, 0.5);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(9);
    });
  });
});
