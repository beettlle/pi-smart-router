import { describe, expect, it } from 'vitest';

import type { RoutingDatasetRecord, RoutingOutcomeRecord } from '../../src/domain/types/entities.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';

function makeDatasetRecord(overrides: Partial<RoutingDatasetRecord> = {}): RoutingDatasetRecord {
  return {
    request_id: 'req-1',
    timestamp: '2026-07-04T00:00:00.000Z',
    turn_type: 'main_loop',
    stage: 'hydra_match',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'claude-sonnet',
    tier: 'frontier-cloud',
    candidates_json: null,
    prompt_length_chars: 500,
    estimated_input_tokens: 120,
    message_count: 2,
    has_tool_context: false,
    compaction_flag: false,
    triage_verdict: 'trivial',
    triage_reason_code: 'keyword_economical',
    triage_cyclomatic_score: 1,
    triage_trivial_hits: 2,
    triage_complex_hits: 0,
    triage_sanitized_length_delta: 0,
    requirement_reasoning: 0.3,
    requirement_code_gen: 0.4,
    requirement_tool_use: 0.2,
    routing_latency_ms: 8,
    estimated_cost_usd: 0.001,
    prompt_fingerprint: null,
    ...overrides,
  };
}

describe('MemoryStore dataset', () => {
  it('appends and lists dataset records newest first', async () => {
    const store = new MemoryStore();

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
    const store = new MemoryStore();
    const record = makeDatasetRecord();

    store.appendDatasetRecord(record);

    const rows = await store.listDatasetRecords({ limit: 1 });
    expect(rows[0]).toEqual(record);
  });

  it('evicts oldest rows beyond max entry count', async () => {
    const store = new MemoryStore();

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

  it('stores metadata only — no prompt fields on record type', () => {
    const record = makeDatasetRecord();
    expect(record).not.toHaveProperty('prompt_text');
    expect(record).not.toHaveProperty('messages');
  });
});

describe('MemoryStore outcomes', () => {
  it('appends and lists outcome records', async () => {
    const store = new MemoryStore();
    const outcome: RoutingOutcomeRecord = {
      request_id: 'req-1',
      session_id: 'sess-1',
      timestamp: '2026-07-05T00:00:00.000Z',
      signal_type: 'feedback_good',
      routed_model_id: 'gpt-5-mini',
      override_model_id: null,
    };

    store.appendOutcomeRecord(outcome);

    const rows = await store.listOutcomeRecords({ limit: 1 });
    expect(rows[0]).toEqual(outcome);
  });
});
