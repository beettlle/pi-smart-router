import { describe, expect, it } from 'vitest';

import type { RoutingDatasetRecord } from '../../src/domain/types/index.js';
import {
  DATASET_MAX_ENTRIES,
  DATASET_WINDOW_DAYS,
  DATASET_WINDOW_MS,
  evictExpiredDatasetEntries,
  makeDatasetRoom,
} from '../../src/infrastructure/telemetry/dataset-limits.js';
import { DEFAULT_CONTEXT_FIT_DATASET_FIELDS } from '../../src/infrastructure/telemetry/routing-telemetry.js';

function makeDatasetRecord(timestamp: string): RoutingDatasetRecord {
  return {
    request_id: 'req-1',
    timestamp,
    turn_type: 'main_loop',
    stage: 'hydra_match',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'gpt-5-mini',
    tier: 'economical-cloud',
    candidates_json: null,
    prompt_length_chars: 10,
    estimated_input_tokens: null,
    message_count: 1,
    has_tool_context: false,
    compaction_flag: false,
    triage_verdict: null,
    triage_reason_code: null,
    triage_cyclomatic_score: null,
    triage_trivial_hits: null,
    triage_complex_hits: null,
    triage_sanitized_length_delta: null,
    requirement_reasoning: null,
    requirement_code_gen: null,
    requirement_tool_use: null,
    routing_latency_ms: 1,
    estimated_cost_usd: null,
    prompt_fingerprint: null,
    ...DEFAULT_CONTEXT_FIT_DATASET_FIELDS,
  };
}

describe('dataset-limits', () => {
  it('exports 30-day / 10k row retention constants', () => {
    expect(DATASET_WINDOW_DAYS).toBe(30);
    expect(DATASET_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(DATASET_MAX_ENTRIES).toBe(10_000);
  });

  it('evicts expired dataset entries', () => {
    const entries = [
      makeDatasetRecord(new Date(Date.now() - DATASET_WINDOW_MS - 1_000).toISOString()),
      makeDatasetRecord(new Date().toISOString()),
    ];

    evictExpiredDatasetEntries(entries);

    expect(entries).toHaveLength(1);
  });

  it('trims oldest rows to make room before append', () => {
    const entries = Array.from({ length: DATASET_MAX_ENTRIES }, (_, index) =>
      makeDatasetRecord(`2026-07-04T00:00:${String(index).padStart(2, '0')}.000Z`),
    );
    const newest = makeDatasetRecord('2026-07-04T01:00:00.000Z');

    makeDatasetRoom(entries);
    entries.push(newest);

    expect(entries).toHaveLength(DATASET_MAX_ENTRIES);
    expect(entries[0]?.timestamp).toBe('2026-07-04T00:00:01.000Z');
    expect(entries.at(-1)).toEqual(newest);
  });
});
