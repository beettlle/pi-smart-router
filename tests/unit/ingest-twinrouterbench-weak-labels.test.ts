import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  TWINROUTERBENCH_WEAK_LABEL_SOURCE,
  TWINROUTERBENCH_WEAK_OUTCOME_SIGNALS,
  convertTwinRouterBenchStaticRecord,
  ingestTwinRouterBenchWeakFile,
  parseTwinRouterBenchWeakIngestArgs,
  weakSuccessFromTargetTier,
} from '../../scripts/ingest-twinrouterbench-weak-labels.js';
import {
  formatLabelPackJsonl,
  loadLabelPackJsonl,
  serializedPackContainsPromptLeakage,
} from '../../scripts/lib/label-pack-schema.js';
import type { TwinRouterBenchStaticRecord } from '../../scripts/eval/twinrouterbench-adapter.js';

const WEAK_FIXTURE = join(
  process.cwd(),
  'tests/eval/corpus/label-packs/twinrouterbench-weak/ci-fixture.jsonl',
);

const CORPUS_SUBSET = join(
  process.cwd(),
  'tests/eval/corpus/twinrouterbench/ci-subset.json',
);

describe('ingest-twinrouterbench-weak-labels (SP-190)', () => {
  it('maps tier proxy to weak success without inventing labels', () => {
    expect(weakSuccessFromTargetTier('zero-tier')).toBe(true);
    expect(weakSuccessFromTargetTier('economical-cloud')).toBe(true);
    expect(weakSuccessFromTargetTier('frontier-cloud')).toBe(false);
    expect(weakSuccessFromTargetTier(undefined)).toBeNull();
  });

  it('converts flat CI fixture into schema-valid weak pack rows', () => {
    const result = ingestTwinRouterBenchWeakFile(WEAK_FIXTURE);
    expect(result.accepted).toBe(3);
    expect(result.skipped).toBe(2);

    const jsonl = formatLabelPackJsonl(result.rows);
    expect(serializedPackContainsPromptLeakage(jsonl)).toBe(false);
    expect(jsonl).not.toMatch(/"prompt"\s*:/);
    expect(jsonl).not.toMatch(/"messages"\s*:/);

    const loaded = loadLabelPackJsonl(jsonl, 'trb-weak-pack');
    expect(loaded.rows.every((row) => row.source === TWINROUTERBENCH_WEAK_LABEL_SOURCE)).toBe(
      true,
    );
    for (const row of loaded.rows) {
      for (const signal of TWINROUTERBENCH_WEAK_OUTCOME_SIGNALS) {
        expect(row.outcome_signals).toContain(signal);
      }
    }
    expect(loaded.rows.filter((row) => row.success)).toHaveLength(2);
    expect(loaded.rows.filter((row) => !row.success)).toHaveLength(1);
  });

  it('converts TwinRouterBench static-track corpus subset without prompt leakage', () => {
    const result = ingestTwinRouterBenchWeakFile(CORPUS_SUBSET, { limit: 10 });
    expect(result.accepted).toBe(10);
    expect(result.limited).toBe(true);

    const jsonl = formatLabelPackJsonl(result.rows);
    expect(serializedPackContainsPromptLeakage(jsonl)).toBe(false);
    // Corpus uses hashes — pack must not invent prompt bodies.
    expect(jsonl).not.toMatch(/"prefix_text"\s*:/);
    expect(jsonl).not.toMatch(/"content"\s*:/);

    const loaded = loadLabelPackJsonl(jsonl, 'trb-corpus-weak');
    expect(loaded.accepted).toBe(10);
    expect(loaded.rows.every((row) => row.source === TWINROUTERBENCH_WEAK_LABEL_SOURCE)).toBe(
      true,
    );
  });

  it('builds a pack row from a static record', () => {
    const record: TwinRouterBenchStaticRecord = {
      trace_id: 'unit_trace_1',
      session_id_hash: 'abcdef0123456789',
      step_index: 2,
      turn_type: 'tool_result',
      prefix_hash: 'fedcba9876543210',
      prefix_token_estimate: 1200,
      verified_target_tier: 'frontier-cloud',
      verified_target_model_id: 'claude-sonnet-4',
      verified_tool_progression: true,
      downgrade_cascade_verified: true,
      benchmark_source: 'swe-bench-verified',
    };
    const row = convertTwinRouterBenchStaticRecord(record);
    expect(row).not.toBeNull();
    expect(row!.success).toBe(false);
    expect(row!.tier).toBe('frontier-cloud');
    expect(row!.outcome_signals).toContain('exclude_from_holdout_ece');
  });

  it('parses CLI --limit', () => {
    const args = parseTwinRouterBenchWeakIngestArgs([
      '--input',
      'track.json',
      '--output',
      'out.jsonl',
      '--limit',
      '8',
    ]);
    expect(args.limit).toBe(8);
    expect(args.input).toBe('track.json');
  });
});
