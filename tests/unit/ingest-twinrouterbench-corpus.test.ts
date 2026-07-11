import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TRB_FROZEN_CATALOG,
  TWINROUTERBENCH_PINNED_COMMIT,
  TwinRouterBenchIngestError,
  UPSTREAM_TIER_TO_EVAL_TIER,
  convertUpstreamRow,
  hashPrefixMessages,
  hashSessionId,
  ingestQuestionBankToStaticTrack,
  mapUpstreamTier,
  parseIngestCliArgs,
  runIngestCli,
  type UpstreamQuestionBankRow,
} from '../../scripts/eval/ingest-twinrouterbench-corpus.js';
import { loadTwinRouterBenchStaticTrack } from '../../scripts/eval/twinrouterbench-adapter.js';

function syntheticRow(
  overrides: Partial<UpstreamQuestionBankRow> = {},
): UpstreamQuestionBankRow {
  const targetTier = overrides.target_tier ?? 'low';
  return {
    id: overrides.id ?? 'swebench_django__django-11163_step_1',
    instance_id: overrides.instance_id ?? 'django__django-11163',
    step_index: overrides.step_index ?? 1,
    messages: overrides.messages ?? [
      { role: 'system', content: 'You are a coding agent.' },
      { role: 'user', content: 'Fix the bug in django.' },
    ],
    target_tier: targetTier,
    target_tier_id: overrides.target_tier_id ?? UPSTREAM_TIER_ID[targetTier],
    benchmark: overrides.benchmark ?? 'swebench',
    scenario: overrides.scenario ?? 'code_swe',
    pipeline_stage: overrides.pipeline_stage ?? 'ground_truth_ready',
  };
}

const UPSTREAM_TIER_ID: Record<string, number> = {
  low: 0,
  mid: 1,
  mid_high: 2,
  high: 3,
};

describe('ingest-twinrouterbench-corpus (SP-186)', () => {
  it('documents the pinned TwinRouterBench commit', () => {
    expect(TWINROUTERBENCH_PINNED_COMMIT).toBe('430acecac71141de77afd8e5e13690d236d58e93');
  });

  it('maps upstream tiers without inventing labels', () => {
    expect(mapUpstreamTier('low')).toBe('zero-tier');
    expect(mapUpstreamTier('mid')).toBe('economical-cloud');
    expect(mapUpstreamTier('mid_high')).toBe('frontier-cloud');
    expect(mapUpstreamTier('high')).toBe('frontier-cloud');
    expect(mapUpstreamTier('ultra')).toBeUndefined();
    expect(Object.keys(UPSTREAM_TIER_TO_EVAL_TIER).sort()).toEqual([
      'high',
      'low',
      'mid',
      'mid_high',
    ]);
  });

  it('hashes session and prefix deterministically', () => {
    const session = hashSessionId('django__django-11163');
    expect(session).toHaveLength(64);
    expect(hashSessionId('django__django-11163')).toBe(session);

    const prefix = hashPrefixMessages([
      { role: 'user', content: 'hello' },
    ]);
    expect(prefix).toHaveLength(64);
    expect(hashPrefixMessages([{ role: 'user', content: 'hello' }])).toBe(prefix);
    expect(hashPrefixMessages([{ role: 'user', content: 'other' }])).not.toBe(prefix);
  });

  it('converts a synthetic upstream row into a loadable static-track document', () => {
    const row = syntheticRow();
    const jsonl = JSON.stringify(row);
    const track = ingestQuestionBankToStaticTrack(jsonl);

    expect(track.schema_version).toBe('1.0.0');
    expect(track.track).toBe('static');
    expect(track.frozen_catalog.catalog_id).toBe(DEFAULT_TRB_FROZEN_CATALOG.catalog_id);
    expect(track.records).toHaveLength(1);
    expect(track.records[0]!.verified_target_tier).toBe('zero-tier');
    expect(track.records[0]!.verified_target_model_id).toBe('ollama/llama3.2:3b');
    expect(track.records[0]!.step_index).toBe(0);
    expect(track.records[0]!.benchmark_source).toBe('swe-bench-verified');
    expect(track.records[0]!.downgrade_cascade_verified).toBe(true);
    expect(track.records[0]!.verified_tool_progression).toBe(true);

    const fixtures = loadTwinRouterBenchStaticTrack(track);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]!.session.steps[0]!.step_outcome.min_tier).toBe('zero-tier');
  });

  it('skips unmappable tiers and never invents verified labels', () => {
    const good = syntheticRow({ id: 'ok_1', target_tier: 'mid', target_tier_id: 1 });
    const bad = {
      ...syntheticRow({ id: 'bad_1', target_tier: 'low' }),
      target_tier: 'not-a-tier',
      target_tier_id: 99,
    };
    const jsonl = `${JSON.stringify(good)}\n${JSON.stringify(bad)}\n`;
    const track = ingestQuestionBankToStaticTrack(jsonl);
    expect(track.records).toHaveLength(1);
    expect(track.records[0]!.verified_target_tier).toBe('economical-cloud');
    expect(track.records[0]!.verified_target_model_id).toBe('gpt-4o-mini');
  });

  it('skips tier_id mismatches without inventing a tier', () => {
    const converted = convertUpstreamRow(
      syntheticRow({ target_tier: 'low', target_tier_id: 3 }),
    );
    expect(converted.ok).toBe(false);
    if (!converted.ok) {
      expect(converted.reason).toBe('tier_id_mismatch');
    }
  });

  it('marks degradation_search_done as cascade-verified but not tool-progression GT', () => {
    const row = syntheticRow({
      pipeline_stage: 'degradation_search_done',
      target_tier: 'high',
      target_tier_id: 3,
    });
    const track = ingestQuestionBankToStaticTrack(JSON.stringify(row));
    expect(track.records[0]!.downgrade_cascade_verified).toBe(true);
    expect(track.records[0]!.verified_tool_progression).toBe(false);
    expect(track.records[0]!.verified_target_tier).toBe('frontier-cloud');
  });

  it('respects --limit on emitted records', () => {
    const lines = [1, 2, 3].map((step) =>
      JSON.stringify(
        syntheticRow({
          id: `row_${step}`,
          instance_id: 'inst-a',
          step_index: step,
          target_tier: 'mid',
          target_tier_id: 1,
        }),
      ),
    );
    const track = ingestQuestionBankToStaticTrack(lines.join('\n'), { limit: 2 });
    expect(track.records).toHaveLength(2);
  });

  it('fails clearly on schema mismatch', () => {
    expect(() => ingestQuestionBankToStaticTrack('{"id":"x"}\n')).toThrow(
      TwinRouterBenchIngestError,
    );
    expect(() => ingestQuestionBankToStaticTrack('{"id":"x"}\n')).toThrow(/Schema mismatch/);
  });

  it('reindexes steps contiguously per session for the adapter', () => {
    const rows = [
      syntheticRow({
        id: 's1',
        instance_id: 'same',
        step_index: 2,
        target_tier: 'low',
        target_tier_id: 0,
        messages: [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' },
          { role: 'tool', content: 'c' },
        ],
      }),
      syntheticRow({
        id: 's0',
        instance_id: 'same',
        step_index: 1,
        target_tier: 'low',
        target_tier_id: 0,
      }),
    ];
    const track = ingestQuestionBankToStaticTrack(rows.map((r) => JSON.stringify(r)).join('\n'));
    expect(track.records.map((r) => r.step_index)).toEqual([0, 1]);
    expect(track.records[0]!.trace_id).toBe('s0');
    expect(track.records[1]!.turn_type).toBe('tool_result');
    expect(() => loadTwinRouterBenchStaticTrack(track)).not.toThrow();
  });

  it('CLI writes adapter-valid JSON and parses --limit', () => {
    expect(parseIngestCliArgs(['--help']).help).toBe(true);
    expect(() => parseIngestCliArgs(['--limit', '0'])).toThrow(/Invalid --limit/);

    const dir = mkdtempSync(join(tmpdir(), 'trb-ingest-'));
    try {
      const input = join(dir, 'sample.jsonl');
      const output = join(dir, 'out.json');
      writeFileSync(input, `${JSON.stringify(syntheticRow())}\n`, 'utf8');
      const code = runIngestCli(['--input', input, '--output', output, '--limit', '1']);
      expect(code).toBe(0);
      const written = JSON.parse(readFileSync(output, 'utf8'));
      expect(loadTwinRouterBenchStaticTrack(written)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
