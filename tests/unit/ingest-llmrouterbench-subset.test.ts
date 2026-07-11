import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CI_SUBSET_MAX_RECORDS,
  DEFAULT_LRB_FROZEN_CATALOG,
  LLMROUTERBENCH_GIT_COMMIT,
  LLMROUTERBENCH_HF_REVISION,
  UPSTREAM_MODEL_TO_CATALOG,
  convertUpstreamRow,
  hashPrefix,
  hashSessionId,
  ingestLrbToStaticTrack,
  isChatOnlyDataset,
  isCodeToolDataset,
  mapUpstreamModel,
  parseIngestCliArgs,
  runIngestCli,
  type UpstreamLrbRow,
  LLMRouterBenchIngestError,
} from '../../scripts/eval/ingest-llmrouterbench-subset.js';
import { scoreFixtureHarness } from '../../scripts/eval/harness-tracks.js';
import { loadTwinRouterBenchStaticTrack } from '../../scripts/eval/twinrouterbench-adapter.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CI_SUBSET_PATH = join(REPO_ROOT, 'tests/eval/corpus/llmrouterbench/ci-subset.json');
const CI_SUBSET_SHA256 =
  '1647fc918c76936e08cb70d4553989aebf7087cbc616c9fa9d1365709cb1fa03';
const SYNTHETIC_PATH = join(
  REPO_ROOT,
  'tests/eval/corpus/llmrouterbench/synthetic-upstream.jsonl',
);

function syntheticRow(overrides: Partial<UpstreamLrbRow> = {}): UpstreamLrbRow {
  return {
    dataset_id: overrides.dataset_id ?? 'livecodebench',
    split: overrides.split ?? 'test',
    model_name: overrides.model_name ?? 'Claude-sonnet-4',
    record_index: overrides.record_index ?? 0,
    origin_query: overrides.origin_query ?? 'Write a function that returns n+1.',
    prompt: overrides.prompt,
    score: overrides.score ?? 1.0,
    cost: overrides.cost ?? 0.001,
    prompt_tokens: overrides.prompt_tokens ?? 32,
    completion_tokens: overrides.completion_tokens ?? 16,
  };
}

describe('ingest-llmrouterbench-subset (SP-192)', () => {
  it('documents the pinned HF revision and git schema commit', () => {
    expect(LLMROUTERBENCH_HF_REVISION).toBe('0e5af1b84bf73437a01a1849c0f1d2468baa93fc');
    expect(LLMROUTERBENCH_GIT_COMMIT).toBe('c77cb0506949d8f959e97967d2fefca0e8ff1b05');
  });

  it('classifies code/tool vs chat-only datasets', () => {
    expect(isCodeToolDataset('livecodebench')).toBe(true);
    expect(isCodeToolDataset('swe-bench')).toBe(true);
    expect(isCodeToolDataset('humaneval')).toBe(true);
    expect(isCodeToolDataset('tau2')).toBe(true);
    expect(isCodeToolDataset('mtbench')).toBe(false);
    expect(isCodeToolDataset('aime')).toBe(false);
    expect(isChatOnlyDataset('mtbench')).toBe(true);
    expect(isChatOnlyDataset('arenahard')).toBe(true);
    expect(isChatOnlyDataset('livecodebench')).toBe(false);
  });

  it('maps only known upstream models; never invents stand-ins', () => {
    expect(mapUpstreamModel('Claude-sonnet-4')).toEqual({
      model_id: 'claude-sonnet-4',
      tier: 'frontier-cloud',
    });
    expect(mapUpstreamModel('gpt-4o-mini')?.tier).toBe('economical-cloud');
    expect(mapUpstreamModel('Llama-3.1-8B-Instruct')?.model_id).toBe('ollama/llama3.2:3b');
    expect(mapUpstreamModel('Gemini-2.5-pro')).toBeUndefined();
    expect(mapUpstreamModel('GPT-5')).toBeUndefined();
    expect(Object.keys(UPSTREAM_MODEL_TO_CATALOG).length).toBeGreaterThan(0);
  });

  it('hashes session and prefix deterministically', () => {
    const row = syntheticRow();
    const session = hashSessionId(row);
    expect(session).toHaveLength(64);
    expect(hashSessionId(row)).toBe(session);
    const prefix = hashPrefix(row);
    expect(prefix).toHaveLength(64);
    expect(hashPrefix({ origin_query: 'other', prompt: '' })).not.toBe(prefix);
  });

  it('converts a synthetic code/tool row into a loadable static-track document', () => {
    const row = syntheticRow();
    const track = ingestLrbToStaticTrack(JSON.stringify(row), { preferCodeTool: true });

    expect(track.schema_version).toBe('1.0.0');
    expect(track.track).toBe('static');
    expect(track.frozen_catalog.catalog_id).toBe(DEFAULT_LRB_FROZEN_CATALOG.catalog_id);
    expect(track.frozen_catalog.checkpoint_date).toBe('2026-07-01');
    expect(track.records).toHaveLength(1);
    expect(track.records[0]!.verified_target_tier).toBe('frontier-cloud');
    expect(track.records[0]!.verified_target_model_id).toBe('claude-sonnet-4');
    expect(track.records[0]!.downgrade_cascade_verified).toBe(true);
    expect(track.records[0]!.benchmark_source).toBe('custom');

    const fixtures = loadTwinRouterBenchStaticTrack(track);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]!.session.steps[0]!.step_outcome.min_tier).toBe('frontier-cloud');
  });

  it('skips chat-only rows when preferCodeTool is set', () => {
    const code = syntheticRow({ dataset_id: 'livecodebench', record_index: 1 });
    const chat = syntheticRow({
      dataset_id: 'mtbench',
      record_index: 2,
      origin_query: 'Tell me a joke.',
    });
    const track = ingestLrbToStaticTrack(
      `${JSON.stringify(chat)}\n${JSON.stringify(code)}\n`,
      { preferCodeTool: true, limit: 10 },
    );
    expect(track.records).toHaveLength(1);
    expect(track.records[0]!.trace_id).toContain('livecodebench');
    expect(parseIngestCliArgs(['--prefer-code-tool']).preferCodeTool).toBe(true);
  });

  it('skips unmappable models without inventing catalog IDs', () => {
    const good = syntheticRow({ model_name: 'gpt-4o-mini', record_index: 1 });
    const bad = syntheticRow({
      model_name: 'Gemini-2.5-pro',
      record_index: 2,
    });
    const track = ingestLrbToStaticTrack(
      `${JSON.stringify(bad)}\n${JSON.stringify(good)}\n`,
      { preferCodeTool: true },
    );
    expect(track.records).toHaveLength(1);
    expect(track.records[0]!.verified_target_model_id).toBe('gpt-4o-mini');

    const converted = convertUpstreamRow(bad);
    expect(converted.ok).toBe(false);
    if (!converted.ok) {
      expect(converted.reason).toBe('unmappable_model');
    }
  });

  it('marks failed scores as not cascade-verified', () => {
    const row = syntheticRow({
      score: 0,
      model_name: 'Llama-3.1-8B-Instruct',
      dataset_id: 'humaneval',
    });
    const track = ingestLrbToStaticTrack(JSON.stringify(row), { preferCodeTool: true });
    expect(track.records[0]!.downgrade_cascade_verified).toBe(false);
    expect(track.records[0]!.verified_tool_progression).toBe(false);
    expect(track.records[0]!.verified_target_tier).toBe('zero-tier');
  });

  it('maps swe-bench to swe-bench-verified and tau2 to tool_result', () => {
    const swe = syntheticRow({ dataset_id: 'swe-bench', model_name: 'gpt-4o-mini' });
    const tau = syntheticRow({
      dataset_id: 'tau2',
      model_name: 'Claude-sonnet-4',
      record_index: 9,
    });
    const track = ingestLrbToStaticTrack(
      `${JSON.stringify(swe)}\n${JSON.stringify(tau)}\n`,
      { preferCodeTool: true },
    );
    expect(track.records[0]!.benchmark_source).toBe('swe-bench-verified');
    expect(track.records[1]!.turn_type).toBe('tool_result');
    expect(track.records[1]!.verified_tool_progression).toBe(true);
  });

  it('respects --limit on emitted records', () => {
    const lines = [0, 1, 2].map((i) =>
      JSON.stringify(syntheticRow({ record_index: i, model_name: 'gpt-4o-mini' })),
    );
    const track = ingestLrbToStaticTrack(lines.join('\n'), {
      preferCodeTool: true,
      limit: 2,
    });
    expect(track.records).toHaveLength(2);
  });

  it('fails clearly on schema mismatch', () => {
    expect(() => ingestLrbToStaticTrack('{"dataset_id":"x"}\n')).toThrow(
      LLMRouterBenchIngestError,
    );
    expect(() => ingestLrbToStaticTrack('{"dataset_id":"x"}\n')).toThrow(/Schema mismatch/);
  });

  it('CLI writes adapter-valid JSON and parses flags', () => {
    expect(parseIngestCliArgs(['--help']).help).toBe(true);
    expect(() => parseIngestCliArgs(['--limit', '0'])).toThrow(/Invalid --limit/);

    const dir = mkdtempSync(join(tmpdir(), 'lrb-ingest-'));
    try {
      const input = join(dir, 'sample.jsonl');
      const output = join(dir, 'out.json');
      writeFileSync(input, `${JSON.stringify(syntheticRow())}\n`, 'utf8');
      const code = runIngestCli([
        '--input',
        input,
        '--output',
        output,
        '--limit',
        '1',
        '--prefer-code-tool',
      ]);
      expect(code).toBe(0);
      const written = JSON.parse(readFileSync(output, 'utf8'));
      expect(loadTwinRouterBenchStaticTrack(written)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('LLMRouterBench CI subset (SP-192)', () => {
  it('vendors a bounded offline subset that loads and scores without network', () => {
    expect(CI_SUBSET_MAX_RECORDS).toBe(20);

    const buf = readFileSync(CI_SUBSET_PATH);
    const sha = createHash('sha256').update(buf).digest('hex');
    expect(sha).toBe(CI_SUBSET_SHA256);

    const track = JSON.parse(buf.toString('utf8')) as { records: unknown[] };
    expect(track.records.length).toBeGreaterThan(0);
    expect(track.records.length).toBeLessThanOrEqual(CI_SUBSET_MAX_RECORDS);

    const fixtures = loadTwinRouterBenchStaticTrack(track);
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixture of fixtures) {
      const scored = scoreFixtureHarness(fixture);
      expect(scored.capability.step_count).toBeGreaterThan(0);
    }
  });

  it('synthetic upstream filters chat-only and unmappable when converting for CI', () => {
    const jsonl = readFileSync(SYNTHETIC_PATH, 'utf8');
    const track = ingestLrbToStaticTrack(jsonl, { preferCodeTool: true, limit: 20 });
    expect(track.records.length).toBeGreaterThan(0);
    expect(track.records.length).toBeLessThanOrEqual(CI_SUBSET_MAX_RECORDS);
    for (const rec of track.records) {
      expect(rec.trace_id).not.toContain('mtbench');
      expect(rec.trace_id).not.toContain('aime');
      expect(['claude-sonnet-4', 'gpt-4o-mini', 'ollama/llama3.2:3b']).toContain(
        rec.verified_target_model_id,
      );
    }
  });
});
