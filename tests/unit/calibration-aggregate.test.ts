import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  assertContribRecordSafe,
  collectContribFromDir,
  formatContribJsonl,
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
});
