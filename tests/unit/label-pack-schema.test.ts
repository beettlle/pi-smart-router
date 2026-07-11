import { describe, expect, it } from 'vitest';

import {
  LABEL_PACK_SCHEMA_VERSION,
  assertLabelPackRecordSafe,
  formatLabelPackJsonl,
  loadLabelPackJsonl,
  parseLabelPackRow,
  serializedPackContainsPromptLeakage,
  type LabelPackRow,
} from '../../scripts/lib/label-pack-schema.js';

function cleanRow(overrides: Partial<LabelPackRow> = {}): LabelPackRow {
  return {
    schema_version: LABEL_PACK_SCHEMA_VERSION,
    sample_id: 'swe-gym:fixture-001',
    source: 'swe-gym',
    features: {
      prompt_length_norm: 0.42,
      estimated_input_tokens_norm: 0.31,
      triage_cyclomatic_score: 0.55,
      requirement_reasoning: 0.7,
      requirement_code_gen: 0.8,
      requirement_tool_use: 0.6,
      has_tool_context: 1,
      compaction_flag: 0,
      routing_latency_norm: 0.1,
      economical_tier: 1,
    },
    success: true,
    tier: 'economical-cloud',
    outcome_signals: ['verifier_resolved'],
    ...overrides,
  };
}

describe('label-pack schema (SP-189)', () => {
  it('accepts a clean privacy-safe pack row', () => {
    const row = cleanRow();
    expect(() => assertLabelPackRecordSafe(row)).not.toThrow();
    expect(parseLabelPackRow(row)).toEqual(row);
  });

  it('rejects prompt / message / content keys at any nesting level', () => {
    expect(() =>
      assertLabelPackRecordSafe({ ...cleanRow(), prompt: 'leak' }),
    ).toThrow(/forbidden keys.*prompt/);

    expect(() =>
      assertLabelPackRecordSafe({
        ...cleanRow(),
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).toThrow(/messages/);

    expect(() =>
      assertLabelPackRecordSafe({
        schema_version: 1,
        sample_id: 'x',
        source: 'swe-gym',
        success: false,
        features: { requirement_reasoning: 0.1 },
        nested: { prompt_text: 'never' },
      }),
    ).toThrow(/prompt_text/);

    expect(() =>
      parseLabelPackRow({
        ...cleanRow(),
        features: {
          requirement_reasoning: 0.2,
          user_content: 1,
        },
      }),
    ).toThrow(/user_content/);
  });

  it('serialized artifacts never contain raw prompt text keys', () => {
    const jsonl = formatLabelPackJsonl([cleanRow(), cleanRow({ sample_id: 'b', success: false })]);
    expect(serializedPackContainsPromptLeakage(jsonl)).toBe(false);
    expect(jsonl).not.toMatch(/"prompt"\s*:/);
    expect(jsonl).not.toMatch(/"messages"\s*:/);
    expect(jsonl).not.toMatch(/"prompt_text"\s*:/);
    expect(jsonl).not.toMatch(/"content"\s*:/);

    const loaded = loadLabelPackJsonl(jsonl, 'fixture');
    expect(loaded.accepted).toBe(2);
    expect(loaded.rows[0]?.success).toBe(true);
    expect(loaded.rows[1]?.success).toBe(false);
  });

  it('loadLabelPackJsonl fails closed on a tainted line', () => {
    const good = JSON.stringify(cleanRow());
    const bad = JSON.stringify({ ...cleanRow({ sample_id: 'bad' }), prompt_text: 'nope' });
    expect(() => loadLabelPackJsonl(`${good}\n${bad}\n`, 'mixed')).toThrow(/Tainted/);
  });
});
