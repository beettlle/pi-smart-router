import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  aggregateBenchmarkProfiles,
  BENCHMARK_PROFILES_VERSION,
  BenchmarkIngestError,
  DEFAULT_BENCHMARK_FIXTURES_DIR,
  ingestBenchmarkProfilesFromDir,
  isToolUseBenchmark,
  normalizeBenchmarkScore,
  parseBenchmarkLeaderboardFixture,
  parseBenchmarkProfilesArtifact,
  serializeBenchmarkProfilesArtifact,
  type BenchmarkLeaderboardFixture,
  type SkippedToolCallEntry,
} from '../../scripts/ingest-benchmark-profiles.js';

function fixture(
  benchmark: BenchmarkLeaderboardFixture['benchmark'],
  entries: BenchmarkLeaderboardFixture['entries'],
): BenchmarkLeaderboardFixture {
  return {
    benchmark,
    source_url: `https://example.com/${benchmark}`,
    scrape_date: '2026-07-09',
    entries,
  };
}

function fullFixtureSet(): BenchmarkLeaderboardFixture[] {
  const models = ['claude-opus-4-5', 'gpt-5.3-codex'];
  return [
    fixture(
      'swebench_verified',
      models.map((model_id, index) => ({ model_id, score: 80 + index })),
    ),
    fixture(
      'terminal_bench',
      models.map((model_id, index) => ({ model_id, score: 70 + index })),
    ),
    fixture(
      'livecodebench',
      models.map((model_id, index) => ({ model_id, score: 75 + index })),
    ),
    fixture('bfcl', models.map((model_id, index) => ({ model_id, score: 85 + index }))),
  ];
}

describe('ingest-benchmark-profiles (SP-134)', () => {
  it('normalizes percentage and fractional benchmark scores', () => {
    expect(normalizeBenchmarkScore(80.9)).toBeCloseTo(0.809);
    expect(normalizeBenchmarkScore(0.809)).toBeCloseTo(0.809);
    expect(normalizeBenchmarkScore(100)).toBe(1);
    expect(normalizeBenchmarkScore(0)).toBe(0);
  });

  it('rejects out-of-range benchmark scores', () => {
    expect(() => normalizeBenchmarkScore(101)).toThrow(/<= 100/);
    expect(() => normalizeBenchmarkScore(-1)).toThrow(/>= 0/);
  });

  it('parses leaderboard fixture JSON with required fields', () => {
    const parsed = parseBenchmarkLeaderboardFixture(
      JSON.stringify(fullFixtureSet()[0]),
      'fixture.json',
    );
    expect(parsed.benchmark).toBe('swebench_verified');
    expect(parsed.entries).toHaveLength(2);
  });

  it('aggregates fixtures into normalized capability profiles with provenance', () => {
    const artifact = aggregateBenchmarkProfiles(fullFixtureSet(), {
      catalogFreezeDate: '2026-07-09',
      scrapeDate: '2026-07-09',
    });

    expect(artifact.version).toBe(BENCHMARK_PROFILES_VERSION);
    expect(artifact.provenance.catalog_freeze_date).toBe('2026-07-09');
    expect(artifact.provenance.scrape_date).toBe('2026-07-09');
    expect(artifact.provenance.source_urls.swebench_verified).toContain('swebench.com');
    expect(artifact.models).toHaveLength(2);

    const opus = artifact.models.find((row) => row.model_id === 'claude-opus-4-5');
    expect(opus).toBeDefined();
    expect(opus!.capabilities.reasoning).toBeGreaterThan(0);
    expect(opus!.capabilities.code_gen).toBeGreaterThan(0);
    expect(opus!.capabilities.tool_use).toBeGreaterThan(0);
    expect(opus!.benchmark_sources.swebench_verified?.normalized).toBeCloseTo(0.8);
    expect(opus!.benchmark_sources.bfcl?.normalized).toBeCloseTo(0.85);
  });

  it('loads checked-in fixture snapshots from the default directory', () => {
    const artifact = ingestBenchmarkProfilesFromDir(DEFAULT_BENCHMARK_FIXTURES_DIR, {
      catalogFreezeDate: '2026-07-09',
    });

    expect(artifact.models.length).toBeGreaterThanOrEqual(5);
    for (const row of artifact.models) {
      expect(row.capabilities.reasoning).toBeLessThanOrEqual(1);
      expect(row.capabilities.code_gen).toBeLessThanOrEqual(1);
      expect(row.capabilities.tool_use).toBeLessThanOrEqual(1);
    }
  });

  it('checked-in artifact matches fixture ingest', () => {
    const checkedIn = readFileSync(join('config', 'benchmark-profiles.json'), 'utf8');
    const parsed = parseBenchmarkProfilesArtifact(JSON.parse(checkedIn));
    const artifact = ingestBenchmarkProfilesFromDir(DEFAULT_BENCHMARK_FIXTURES_DIR, {
      catalogFreezeDate: parsed.provenance.catalog_freeze_date,
      scrapeDate: parsed.provenance.scrape_date,
      ...(parsed.aliases !== undefined ? { aliases: parsed.aliases } : {}),
    });

    expect(serializeBenchmarkProfilesArtifact(artifact)).toBe(checkedIn);
  });

  it('emits default fleet aliases when none are supplied (SP-174)', () => {
    const artifact = ingestBenchmarkProfilesFromDir(DEFAULT_BENCHMARK_FIXTURES_DIR, {
      catalogFreezeDate: '2026-07-09',
      scrapeDate: '2026-07-09',
    });

    expect(artifact.aliases?.['claude-opus-4']).toBe('claude-opus-4-5');
    expect(artifact.aliases?.['cursor/auto']).toBe('gpt-5.3-codex');
    expect(artifact.aliases?.['gemini-2.5-flash-preview']).toBe('gemini-2.5-flash');
  });

  it('preserves custom aliases when provided (SP-174)', () => {
    const artifact = ingestBenchmarkProfilesFromDir(DEFAULT_BENCHMARK_FIXTURES_DIR, {
      catalogFreezeDate: '2026-07-09',
      scrapeDate: '2026-07-09',
      aliases: { 'my-fleet-id': 'claude-opus-4-5' },
    });

    expect(artifact.aliases).toEqual({ 'my-fleet-id': 'claude-opus-4-5' });
  });

  it('validates required capability dimensions and rejects duplicate benchmark rows', () => {
    const incomplete = [
      fixture('swebench_verified', [{ model_id: 'solo-model', score: 70 }]),
      fixture('terminal_bench', [{ model_id: 'solo-model', score: 60 }]),
      fixture('livecodebench', [{ model_id: 'solo-model', score: 65 }]),
      fixture('bfcl', [{ model_id: 'solo-model', score: 55 }]),
    ];
    expect(() =>
      aggregateBenchmarkProfiles(incomplete, { catalogFreezeDate: '2026-07-09' }),
    ).not.toThrow();

    const duplicate = [
      ...fullFixtureSet().slice(0, 3),
      fixture('bfcl', [
        { model_id: 'claude-opus-4-5', score: 88 },
        { model_id: 'claude-opus-4-5', score: 89 },
      ]),
    ];
    expect(() =>
      aggregateBenchmarkProfiles(duplicate, { catalogFreezeDate: '2026-07-09' }),
    ).toThrow(/Duplicate bfcl entry/);
  });

  it('round-trips artifact JSON through schema validation', () => {
    const artifact = aggregateBenchmarkProfiles(fullFixtureSet(), {
      catalogFreezeDate: '2026-07-09',
    });
    const text = serializeBenchmarkProfilesArtifact(artifact);
    const parsed = parseBenchmarkProfilesArtifact(JSON.parse(text));
    expect(parsed.models).toEqual(artifact.models);
  });

  it('requires all four benchmark fixtures in a directory ingest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp134-fixtures-'));
    try {
      writeFileSync(join(dir, 'swebench_verified.json'), JSON.stringify(fullFixtureSet()[0]));
      expect(() => ingestBenchmarkProfilesFromDir(dir)).toThrow(/Missing fixture for benchmark/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('wraps parse failures as BenchmarkIngestError', () => {
    expect(() => parseBenchmarkLeaderboardFixture('{', 'bad.json')).toThrow(BenchmarkIngestError);
  });

  it('identifies tool-use benchmarks for AST validation', () => {
    expect(isToolUseBenchmark('terminal_bench')).toBe(true);
    expect(isToolUseBenchmark('bfcl')).toBe(true);
    expect(isToolUseBenchmark('swebench_verified')).toBe(false);
  });

  it('skips malformed tool_call_snippet rows on tool-use benchmarks with reason codes', () => {
    const skipped: SkippedToolCallEntry[] = [];
    const fixtures: BenchmarkLeaderboardFixture[] = [
      fixture('swebench_verified', [
        { model_id: 'model-a', score: 80 },
        { model_id: 'model-b', score: 78 },
      ]),
      fixture('livecodebench', [
        { model_id: 'model-a', score: 75 },
        { model_id: 'model-b', score: 73 },
      ]),
      fixture('terminal_bench', [
        {
          model_id: 'model-a',
          score: 70,
          tool_call_snippet: JSON.stringify({
            name: 'bash',
            arguments: '{not-json',
          }),
        },
        { model_id: 'model-b', score: 72 },
      ]),
      fixture('bfcl', [
        {
          model_id: 'model-a',
          score: 85,
          tool_call_snippet: JSON.stringify({
            name: 'grep',
            arguments: { pattern: 'error', path: 'src/' },
          }),
        },
        { model_id: 'model-b', score: 88 },
      ]),
    ];

    const artifact = aggregateBenchmarkProfiles(fixtures, {
      catalogFreezeDate: '2026-07-09',
      onSkippedToolCallEntry: (entry) => skipped.push(entry),
    });

    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      benchmark: 'terminal_bench',
      model_id: 'model-a',
      reasonCode: 'invalid_arguments_json',
    });
    expect(artifact.models.find((row) => row.model_id === 'model-a')).toBeDefined();
    expect(artifact.models.find((row) => row.model_id === 'model-b')).toBeDefined();
    const modelA = artifact.models.find((row) => row.model_id === 'model-a');
    expect(modelA?.benchmark_sources.terminal_bench).toBeUndefined();
    expect(modelA?.benchmark_sources.bfcl).toBeDefined();
  });

  it('accepts optional valid tool_call_snippet on tool-use benchmark rows', () => {
    const fixtures: BenchmarkLeaderboardFixture[] = [
      fixture('swebench_verified', [{ model_id: 'solo', score: 80 }]),
      fixture('terminal_bench', [
        {
          model_id: 'solo',
          score: 70,
          tool_call_snippet: JSON.stringify({
            type: 'function',
            function: { name: 'bash', arguments: '{"command":"ls"}' },
          }),
        },
      ]),
      fixture('livecodebench', [{ model_id: 'solo', score: 75 }]),
      fixture('bfcl', [{ model_id: 'solo', score: 85 }]),
    ];

    expect(() =>
      aggregateBenchmarkProfiles(fixtures, { catalogFreezeDate: '2026-07-09' }),
    ).not.toThrow();
  });
});
