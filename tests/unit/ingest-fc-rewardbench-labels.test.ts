import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FC_REWARDBENCH_PINNED_REVISION,
  convertFcRewardBenchRow,
  extractFcRewardBenchSuccess,
  ingestFcRewardBenchFile,
  ingestFcRewardBenchJsonl,
  parseFcRewardBenchIngestArgs,
} from '../../scripts/ingest-fc-rewardbench-labels.js';
import {
  formatLabelPackJsonl,
  loadLabelPackJsonl,
  serializedPackContainsPromptLeakage,
} from '../../scripts/lib/label-pack-schema.js';

const FIXTURE = join(
  process.cwd(),
  'tests/eval/corpus/label-packs/fc-rewardbench/ci-fixture.jsonl',
);

describe('ingest-fc-rewardbench-labels (SP-190)', () => {
  it('exports pinned revision for provenance', () => {
    expect(FC_REWARDBENCH_PINNED_REVISION).toMatch(/^[a-f0-9]{40}$/);
  });

  it('converts preference pairs + flat rows into schema-valid pack documents', () => {
    const result = ingestFcRewardBenchFile(FIXTURE);
    // 2 pairs → 4 rows; 2 flat → 2 rows; 2 skipped
    expect(result.accepted).toBe(6);
    expect(result.skipped).toBe(2);

    const jsonl = formatLabelPackJsonl(result.rows);
    expect(serializedPackContainsPromptLeakage(jsonl)).toBe(false);
    expect(jsonl).not.toContain('PLACEHOLDER_NOT_FOR_PACK');
    expect(jsonl).not.toContain('PLACEHOLDER_GCD_QUERY');
    expect(jsonl).not.toMatch(/"conversation"\s*:/);
    expect(jsonl).not.toMatch(/"chosen_output"\s*:/);
    expect(jsonl).not.toMatch(/"rejected_output"\s*:/);
    expect(jsonl).not.toMatch(/"messages"\s*:/);

    const loaded = loadLabelPackJsonl(jsonl, 'fc-rewardbench-pack');
    expect(loaded.accepted).toBe(6);
    expect(loaded.rows.every((row) => row.source === 'fc-rewardbench')).toBe(true);
    expect(loaded.rows.filter((row) => row.success)).toHaveLength(3);
    expect(loaded.rows.filter((row) => !row.success)).toHaveLength(3);
  });

  it('honors --limit and never invents outcomes', () => {
    const limited = ingestFcRewardBenchFile(FIXTURE, { limit: 3 });
    expect(limited.accepted).toBe(3);
    expect(limited.limited).toBe(true);

    expect(convertFcRewardBenchRow({ test_id: 'x', features: { a: 1 } }, 0)).toEqual([]);
    expect(
      convertFcRewardBenchRow(
        {
          sample_id: 'y',
          label: 'correct',
          features: { requirement_tool_use: 0.9 },
        },
        0,
      )[0]?.success,
    ).toBe(true);
    expect(extractFcRewardBenchSuccess({ label: 'incorrect' })).toBe(false);
    expect(extractFcRewardBenchSuccess({})).toBeNull();
  });

  it('rejects tainted fields if present on a candidate pack row path', () => {
    // Upstream may carry conversation/prompt; converter must not emit them.
    const rows = convertFcRewardBenchRow(
      {
        test_id: 'taint-check',
        conversation: [{ role: 'user', content: 'SECRET_PROMPT_TEXT' }],
        tools: [{ name: 'fn' }],
        chosen_output: [{ fn: { a: 1 } }],
        rejected_output: [{ fn: { a: 2 } }],
        prompt: 'MUST_NOT_APPEAR',
        messages: [{ role: 'user', content: 'MUST_NOT_APPEAR' }],
      },
      0,
    );
    expect(rows).toHaveLength(2);
    const jsonl = formatLabelPackJsonl(rows);
    expect(jsonl).not.toContain('SECRET_PROMPT_TEXT');
    expect(jsonl).not.toContain('MUST_NOT_APPEAR');
    expect(serializedPackContainsPromptLeakage(jsonl)).toBe(false);
  });

  it('parses CLI --limit', () => {
    const args = parseFcRewardBenchIngestArgs([
      '--input',
      'in.jsonl',
      '--output',
      'out.jsonl',
      '--limit',
      '5',
    ]);
    expect(args.limit).toBe(5);
    expect(args.input).toBe('in.jsonl');
    expect(args.output).toBe('out.jsonl');
  });

  it('skips empty preference arms that lack structural features', () => {
    const result = ingestFcRewardBenchJsonl(
      `${JSON.stringify({ chosen_output: null, rejected_output: null })}\n`,
    );
    expect(result.accepted).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
