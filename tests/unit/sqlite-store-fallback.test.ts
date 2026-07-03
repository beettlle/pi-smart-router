import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ModelProfile } from '../../src/domain/types/entities.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import { createResilientStore, SqliteStore } from '../../src/infrastructure/persistence/sqlite-store.js';

const TEST_MODELS: readonly ModelProfile[] = [
  {
    id: 'claude-sonnet',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
    pricing: { fallback_cost_per_1m: 3.0 },
  },
];

describe('createResilientStore', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sp009-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('opens a healthy database without degradation', () => {
    const dbPath = join(tempDir, 'state.db');
    const { store, degraded } = createResilientStore({ dbPath, models: TEST_MODELS });
    expect(degraded).toBe(false);
    expect(store).toBeInstanceOf(SqliteStore);
    (store as SqliteStore).close();
  });

  it('recreates the database when the file is corrupt', () => {
    const dbPath = join(tempDir, 'state.db');
    writeFileSync(dbPath, 'this is not a valid sqlite file');

    const { store, degraded } = createResilientStore({ dbPath, models: TEST_MODELS });

    expect(degraded).toBe(false);
    expect(store).toBeInstanceOf(SqliteStore);

    const files = readdirSync(tempDir);
    const corruptFiles = files.filter((f) => f.includes('.corrupt.'));
    expect(corruptFiles.length).toBe(1);

    (store as SqliteStore).close();
  });

  it('falls back to MemoryStore when recreation also fails', () => {
    const dbPath = join(tempDir, 'nowrite', 'state.db');
    mkdirSync(join(tempDir, 'nowrite'), { mode: 0o444 });

    const { store, degraded } = createResilientStore({ dbPath, models: TEST_MODELS });

    expect(degraded).toBe(true);
    expect(store).toBeInstanceOf(MemoryStore);
  });

  it(':memory: path always returns SqliteStore without degradation', () => {
    const { store, degraded } = createResilientStore({ dbPath: ':memory:', models: TEST_MODELS });
    expect(degraded).toBe(false);
    expect(store).toBeInstanceOf(SqliteStore);
    (store as SqliteStore).close();
  });
});

describe('SqliteStore.checkHealth', () => {
  it('returns true for a healthy in-memory database', () => {
    const store = new SqliteStore({ dbPath: ':memory:', models: [] });
    expect(store.checkHealth()).toBe(true);
    store.close();
  });
});

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(TEST_MODELS);
  });

  it('returns null for non-existent pin', async () => {
    expect(await store.getSessionPin('x')).toBeNull();
  });

  it('puts and retrieves a session pin', async () => {
    const pin = {
      session_id: 's1',
      pinned_model_id: 'claude-sonnet',
      pin_reason: 'initial' as const,
      has_ever_switched: false,
      consecutive_upstream_errors: 0,
      consecutive_tool_failures: 0,
      last_tool_failure_signature: null,
      created_at: '2026-07-02T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
    };
    await store.putSessionPin(pin);
    expect(await store.getSessionPin('s1')).toEqual(pin);
  });

  it('deletes a session pin', async () => {
    const pin = {
      session_id: 's1',
      pinned_model_id: 'claude-sonnet',
      pin_reason: 'initial' as const,
      has_ever_switched: false,
      consecutive_upstream_errors: 0,
      consecutive_tool_failures: 0,
      last_tool_failure_signature: null,
      created_at: '2026-07-02T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
    };
    await store.putSessionPin(pin);
    await store.deleteSessionPin('s1');
    expect(await store.getSessionPin('s1')).toBeNull();
  });

  it('returns injected models', async () => {
    expect(await store.getModelProfiles()).toEqual(TEST_MODELS);
  });

  it('returns null for missing price catalog', async () => {
    expect(await store.getPriceCatalog()).toBeNull();
  });

  it('puts and retrieves a price catalog', async () => {
    const catalog = {
      registry_snapshot: { 'claude-sonnet': 3.0 },
      user_overrides: {},
      last_updated: '2026-07-02T00:00:00.000Z',
      source: 'registry' as const,
    };
    await store.putPriceCatalog(catalog);
    expect(await store.getPriceCatalog()).toEqual(catalog);
  });
});
