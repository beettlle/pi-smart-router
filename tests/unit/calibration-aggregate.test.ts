import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  aggregateContribRecords,
  assertContribRecordSafe,
  collectContribFromDir,
  countEmbeddingRows,
  countLabelProvenance,
  enrichContribRecordWithFailureLabels,
  filterShipEligibleRecords,
  formatContribJsonl,
  getLabelProvenance,
  hasEmbeddingVector,
  isShipEligibleProvenance,
  LABEL_PROVENANCE_VALUES,
  MINIMUM_TRAINING_SAMPLES,
  parseContribJsonl,
  sanitizeContribRecord,
} from '../../scripts/calibration-aggregate.js';

function validContribRecord(): Record<string, unknown> {
  return {
    timestamp: '2026-07-07T12:00:00.000Z',
    session_id_hash: 'a'.repeat(64),
    turn_type: 'main_loop',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'gpt-4o-mini',
    routing_latency_ms: 12,
    requirement_reasoning: 0.5,
    requirement_code_gen: 0.4,
    requirement_tool_use: 0.2,
  };
}

describe('calibration aggregate (SP-116)', () => {
  it('documents minimum training sample thresholds', () => {
    expect(MINIMUM_TRAINING_SAMPLES.p_success_weights).toBe(30);
    expect(MINIMUM_TRAINING_SAMPLES.hydra_projection).toBeGreaterThanOrEqual(100);
    expect(MINIMUM_TRAINING_SAMPLES.triage_thresholds).toBeGreaterThanOrEqual(50);
    expect(MINIMUM_TRAINING_SAMPLES.routing_centroids).toBeGreaterThanOrEqual(10);
  });

  it('accepts valid privacy-safe contrib rows', () => {
    const record = validContribRecord();
    expect(() => assertContribRecordSafe(record)).not.toThrow();
    expect(sanitizeContribRecord(record)).toEqual(record);
  });

  it('rejects prompt text and message keys in contrib payloads', () => {
    expect(() =>
      assertContribRecordSafe({ ...validContribRecord(), prompt_text: 'secret' }),
    ).toThrow(/Tainted contrib record rejected/);

    expect(() =>
      assertContribRecordSafe({
        ...validContribRecord(),
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).toThrow(/forbidden keys/);

    expect(() =>
      assertContribRecordSafe({
        nested: { prompt_body: 'never' },
      }),
    ).toThrow(/prompt_body/);
  });

  it('strips install-local pepper fields from otherwise valid rows', () => {
    const withPepper = {
      ...validContribRecord(),
      dataset_key: 'install-local-key',
      pepper: 'local-pepper',
      request_id: 'req-secret',
    };

    const scrubbed = sanitizeContribRecord(withPepper);
    expect(scrubbed).not.toHaveProperty('dataset_key');
    expect(scrubbed).not.toHaveProperty('pepper');
    expect(scrubbed).not.toHaveProperty('request_id');
    expect(scrubbed.requirement_reasoning).toBe(0.5);

    const jsonl = formatContribJsonl([withPepper]);
    const parsed = parseContribJsonl(jsonl.trimEnd(), 'fixture');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).not.toHaveProperty('dataset_key');
    expect(parsed[0]).not.toHaveProperty('pepper');
    expect(parsed[0]).not.toHaveProperty('request_id');
    expect(parsed[0]?.requirement_reasoning).toBe(0.5);

    const dir = mkdtempSync(join(tmpdir(), 'sp116-pepper-'));
    try {
      writeFileSync(join(dir, 'contrib.jsonl'), jsonl);
      const result = collectContribFromDir(dir);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).not.toHaveProperty('dataset_key');
      expect(result.records[0]?.requirement_reasoning).toBe(0.5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses JSONL and aggregates contrib files from a directory', () => {
    const jsonl = formatContribJsonl([
      validContribRecord(),
      { ...validContribRecord(), selected_model_id: 'gpt-4o' },
    ]);

    const parsed = parseContribJsonl(jsonl.trimEnd(), 'fixture');
    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.selected_model_id).toBe('gpt-4o');

    const dir = mkdtempSync(join(tmpdir(), 'sp116-contrib-'));
    try {
      writeFileSync(join(dir, 'alpha.jsonl'), formatContribJsonl([validContribRecord()]));
      writeFileSync(
        join(dir, 'beta.json'),
        JSON.stringify({ ...validContribRecord(), routing_latency_ms: 20 }),
      );

      const result = collectContribFromDir(dir);
      expect(result.records).toHaveLength(2);
      expect(result.source_files).toHaveLength(2);
      expect(result.records.some((row) => row.routing_latency_ms === 20)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('maps telemetry scalars to privacy-safe failure proxies (SP-131)', () => {
    const enriched = enrichContribRecordWithFailureLabels({
      ...validContribRecord(),
      consecutive_tool_failures: 2,
      stop_reason: 'length',
      reprompt_count: 2,
      turn_index_in_session: 3,
      prompt_length_delta: 4_800,
    });

    expect(enriched.tool_failure_chain_count).toBe(2);
    expect(enriched.stop_reason_invalid).toBe(true);
    expect(enriched.reprompt_rate).toBeCloseTo(2 / 3);
    expect(enriched.edit_distance_proxy).toBeCloseTo(0.6);
    expect(enriched.success_label).toBe(false);
    expect(enriched.outcome_signals).toEqual(
      expect.arrayContaining([
        'tool_failure_chain',
        'stop_reason_invalid',
        'reprompt_detected',
        'high_edit_distance',
      ]),
    );
    expect(enriched).not.toHaveProperty('stop_reason');
    expect(enriched).not.toHaveProperty('consecutive_tool_failures');
    expect(enriched).not.toHaveProperty('prompt_text');
  });

  it('enriches JSONL rows during parse without raw prompt fields', () => {
    const jsonl = formatContribJsonl([
      {
        ...validContribRecord(),
        consecutive_tool_failures: 3,
        stop_reason: 'max_tokens',
      },
    ]);

    const parsed = parseContribJsonl(jsonl.trimEnd(), 'fixture');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.tool_failure_chain_count).toBe(3);
    expect(parsed[0]?.stop_reason_invalid).toBe(true);
    expect(parsed[0]?.success_label).toBe(false);
    expect(parsed[0]?.outcome_signals).toContain('tool_failure_chain');
    expect(parsed[0]).not.toHaveProperty('stop_reason');
  });
});

describe('label provenance floors (SP-281 / #168)', () => {
  it('documents the provenance vocabulary and ship-eligible grades', () => {
    expect(LABEL_PROVENANCE_VALUES).toEqual([
      'human_feedback',
      'llm_judge',
      'scripted_intent',
    ]);
    for (const grade of ['human_feedback', 'llm_judge'] as const) {
      expect(isShipEligibleProvenance({ label_provenance: grade })).toBe(true);
    }
    expect(isShipEligibleProvenance({ label_provenance: 'scripted_intent' })).toBe(false);
    // Untagged (legacy/unknown) rows are never ship-eligible — floors require
    // explicit verifier-grade provenance; it is never invented.
    expect(isShipEligibleProvenance(validContribRecord())).toBe(false);
    expect(getLabelProvenance(validContribRecord())).toBeNull();
    expect(getLabelProvenance({ label_provenance: null })).toBeNull();
  });

  it('preserves label_provenance through parse and enrichment', () => {
    const jsonl = formatContribJsonl([
      { ...validContribRecord(), label_provenance: 'human_feedback' },
      { ...validContribRecord(), label_provenance: 'scripted_intent' },
    ]);

    const parsed = parseContribJsonl(jsonl.trimEnd(), 'fixture');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.label_provenance).toBe('human_feedback');
    expect(parsed[1]?.label_provenance).toBe('scripted_intent');
  });

  it('rejects unknown label_provenance values instead of guessing a grade', () => {
    expect(() =>
      assertContribRecordSafe({ ...validContribRecord(), label_provenance: 'banana' }),
    ).toThrow(/Invalid label_provenance rejected.*banana/);

    expect(() =>
      parseContribJsonl(
        `${JSON.stringify({ ...validContribRecord(), label_provenance: 42 })}\n`,
        'fixture',
      ),
    ).toThrow(/Invalid label_provenance rejected.*42/);

    // Absent and explicit null stay allowed (legacy rows are untagged, not invalid).
    expect(() => assertContribRecordSafe(validContribRecord())).not.toThrow();
    expect(() =>
      assertContribRecordSafe({ ...validContribRecord(), label_provenance: null }),
    ).not.toThrow();
  });

  it('counts ship-eligible floors ignoring scripted_intent and untagged rows', () => {
    const records = [
      { ...validContribRecord(), label_provenance: 'human_feedback' },
      { ...validContribRecord(), label_provenance: 'llm_judge' },
      { ...validContribRecord(), label_provenance: 'llm_judge' },
      // Quarantined gather rows — must never count toward ship floors.
      { ...validContribRecord(), label_provenance: 'scripted_intent' },
      { ...validContribRecord(), label_provenance: 'scripted_intent' },
      { ...validContribRecord(), label_provenance: 'scripted_intent' },
      // Legacy untagged rows — not ship-eligible either.
      validContribRecord(),
    ];

    const counts = countLabelProvenance(records);
    expect(counts).toEqual({
      human_feedback: 1,
      llm_judge: 2,
      scripted_intent: 3,
      untagged: 1,
      total: 7,
      ship_eligible: 3,
    });

    // 40 scripted rows + 0 ship-grade → floors still unmet (never padded).
    const scriptedOnly = Array.from({ length: 40 }, () => ({
      ...validContribRecord(),
      label_provenance: 'scripted_intent',
    }));
    expect(countLabelProvenance(scriptedOnly).ship_eligible).toBe(0);
    expect(countLabelProvenance(scriptedOnly).ship_eligible).toBeLessThan(
      MINIMUM_TRAINING_SAMPLES.p_success_weights,
    );
  });

  it('filters ship-grade rows for verifier-grade trains (--ship-grade-only)', () => {
    const records = [
      { ...validContribRecord(), label_provenance: 'human_feedback' },
      { ...validContribRecord(), label_provenance: 'llm_judge' },
      { ...validContribRecord(), label_provenance: 'scripted_intent' },
      validContribRecord(), // untagged
    ];

    const filtered = filterShipEligibleRecords(records);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((row) => row.label_provenance)).toEqual([
      'human_feedback',
      'llm_judge',
    ]);
  });
});

describe('calibration aggregate — SP-285 embedding rows + stable row ids (#170)', () => {
  it('accepts count-only fields and opt-in embedding rows on ingest', () => {
    const record = {
      ...validContribRecord(),
      row_id: 'b'.repeat(64),
      prompt_length_chars: 1234,
      message_count: 3,
      embedding: Array.from({ length: 384 }, (_, i) => i / 384),
    };

    expect(() => assertContribRecordSafe(record)).not.toThrow();

    const jsonl = formatContribJsonl([record]);
    const parsed = parseContribJsonl(jsonl.trimEnd(), 'fixture');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.prompt_length_chars).toBe(1234);
    expect(parsed[0]?.message_count).toBe(3);
    expect((parsed[0]?.embedding as number[]).length).toBe(384);
    expect(parsed[0]?.row_id).toBe('b'.repeat(64));
  });

  it('still rejects prompt-content keys alongside count fields', () => {
    expect(() =>
      assertContribRecordSafe({
        ...validContribRecord(),
        prompt_length_chars: 10,
        prompt_preview: 'never',
      }),
    ).toThrow(/prompt_preview/);
  });

  it('dedupes aggregate rows by stable row_id across overlapping exports', () => {
    const rowA = { ...validContribRecord(), row_id: 'a'.repeat(64) };
    const rowB = { ...validContribRecord(), row_id: 'b'.repeat(64) };

    const aggregated = aggregateContribRecords([
      [rowA, rowB],
      [rowA, { ...rowB, routing_latency_ms: 99 }],
    ]);

    expect(aggregated).toHaveLength(2);
    expect(aggregated.filter((row) => row.row_id === 'a'.repeat(64))).toHaveLength(1);
    // First occurrence wins — re-exported duplicates are dropped.
    expect(
      aggregated.find((row) => row.row_id === 'b'.repeat(64))?.routing_latency_ms,
    ).toBe(12);
  });

  it('keeps rows without row_id untouched (never deduped)', () => {
    const aggregated = aggregateContribRecords([
      [validContribRecord(), validContribRecord()],
    ]);
    expect(aggregated).toHaveLength(2);
  });

  it('counts embedding rows against the hydra_projection floor', () => {
    const withEmbedding = {
      ...validContribRecord(),
      embedding: new Array<number>(384).fill(0.5),
    };

    expect(countEmbeddingRows([withEmbedding, validContribRecord()])).toBe(1);
    expect(countEmbeddingRows([validContribRecord()])).toBe(0);
    expect(hasEmbeddingVector(withEmbedding)).toBe(true);
    expect(hasEmbeddingVector({ ...validContribRecord(), embedding: [] })).toBe(false);
    expect(hasEmbeddingVector(validContribRecord())).toBe(false);
  });
});
