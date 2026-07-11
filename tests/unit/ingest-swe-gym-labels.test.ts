import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SWE_GYM_PINNED_REVISION,
  SWE_GYM_VERIFIER_TRAJECTORIES_PINNED_REVISION,
  convertSweGymVerifierRow,
  ingestSweGymVerifierFile,
  ingestSweGymVerifierJsonl,
  parseSweGymIngestArgs,
} from '../../scripts/ingest-swe-gym-labels.js';
import {
  loadLabelPackJsonl,
  serializedPackContainsPromptLeakage,
  formatLabelPackJsonl,
} from '../../scripts/lib/label-pack-schema.js';

const FIXTURE = join(
  process.cwd(),
  'tests/eval/corpus/label-packs/swe-gym/ci-fixture.jsonl',
);

describe('ingest-swe-gym-labels (SP-189)', () => {
  it('exports pinned revisions for provenance', () => {
    expect(SWE_GYM_PINNED_REVISION).toMatch(/^[a-f0-9]{40}$/);
    expect(SWE_GYM_VERIFIER_TRAJECTORIES_PINNED_REVISION).toMatch(/^[a-f0-9]{40}$/);
  });

  it('converts synthetic upstream rows into schema-valid pack documents', () => {
    const result = ingestSweGymVerifierFile(FIXTURE);
    // 4 mappable rows; 2 skipped (no outcome / garbage)
    expect(result.accepted).toBe(4);
    expect(result.skipped).toBe(2);

    const jsonl = formatLabelPackJsonl(result.rows);
    expect(serializedPackContainsPromptLeakage(jsonl)).toBe(false);
    expect(jsonl).not.toContain('PLACEHOLDER_NOT_FOR_PACK');
    expect(jsonl).not.toMatch(/"messages"\s*:/);

    const loaded = loadLabelPackJsonl(jsonl, 'swe-gym-pack');
    expect(loaded.accepted).toBe(4);
    expect(loaded.rows.every((row) => row.source === 'swe-gym')).toBe(true);
    expect(loaded.rows.filter((row) => row.success)).toHaveLength(2);
    expect(loaded.rows.filter((row) => !row.success)).toHaveLength(2);
  });

  it('honors --limit and never invents outcomes', () => {
    const limited = ingestSweGymVerifierFile(FIXTURE, { limit: 2 });
    expect(limited.accepted).toBe(2);
    expect(limited.limited).toBe(true);

    expect(convertSweGymVerifierRow({ instance_id: 'x', features: { a: 1 } }, 0)).toBeNull();
    expect(
      convertSweGymVerifierRow(
        { instance_id: 'y', resolved: true, features: { requirement_reasoning: 0.5 } },
        0,
      )?.success,
    ).toBe(true);
  });

  it('parses CLI --limit', () => {
    const args = parseSweGymIngestArgs([
      '--input',
      'in.jsonl',
      '--output',
      'out.jsonl',
      '--limit',
      '3',
    ]);
    expect(args.limit).toBe(3);
    expect(args.input).toBe('in.jsonl');
    expect(args.output).toBe('out.jsonl');
  });

  it('skips message-only rows that lack resolvable features when empty', () => {
    const result = ingestSweGymVerifierJsonl(
      `${JSON.stringify({ resolved: true, messages: [] })}\n`,
    );
    expect(result.accepted).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
