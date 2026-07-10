import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  aggregateBenchmarkProfiles,
  BENCHMARK_IDS,
  BENCHMARK_PROFILES_VERSION,
  BENCHMARK_SOURCE_URLS,
  BenchmarkIngestError,
  buildUsageText,
  DEFAULT_BENCHMARK_FIXTURES_DIR,
  DEFAULT_RECORDED_LEADERBOARDS_DIR,
  ingestBenchmarkProfilesFromDir,
  isToolUseBenchmark,
  normalizeBenchmarkScore,
  parseBenchmarkLeaderboardFixture,
  parseBenchmarkProfilesArtifact,
  parseIngestCliArgs,
  runIngestCli,
  serializeBenchmarkProfilesArtifact,
  type BenchmarkLeaderboardFixture,
  type SkippedToolCallEntry,
} from '../../scripts/ingest-benchmark-profiles.js';
import {
  fetchAllLiveLeaderboards,
  fetchLiveLeaderboardSnapshot,
  writeRecordedLeaderboardSnapshots,
} from '../../scripts/lib/benchmark-leaderboard-fetch.js';
import {
  getDefaultLiveFetchUrls,
  getLeaderboardAdapter,
  LEADERBOARD_ADAPTERS,
} from '../../scripts/lib/leaderboard-adapters/index.js';

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

describe('ingest-benchmark-profiles live/recorded (SP-179 / SP-181)', () => {
  it('documents --live, --recorded, and --record-dir in CLI help', () => {
    const help = buildUsageText();
    expect(help).toContain('--live');
    expect(help).toContain('--recorded');
    expect(help).toContain('--record-dir');
    expect(help).toContain('--live-url');
    expect(help).toMatch(/default = checked-in fixtures/i);
    expect(help).toMatch(/fallback/i);
  });

  it('defaults CLI mode to fixtures with no network flags', () => {
    const parsed = parseIngestCliArgs([]);
    expect(parsed.mode).toBe('fixtures');
    expect(parsed.fixturesDir).toBe(DEFAULT_BENCHMARK_FIXTURES_DIR);
  });

  it('parses --recorded to the checked-in recorded snapshot directory', () => {
    const parsed = parseIngestCliArgs(['--recorded']);
    expect(parsed.mode).toBe('recorded');
    expect(parsed.fixturesDir).toBe(DEFAULT_RECORDED_LEADERBOARDS_DIR);
  });

  it('replays checked-in recorded live snapshots offline with provenance', () => {
    const artifact = ingestBenchmarkProfilesFromDir(DEFAULT_RECORDED_LEADERBOARDS_DIR, {
      catalogFreezeDate: '2026-07-10',
      scrapeDate: '2026-07-10',
    });

    expect(artifact.models.length).toBeGreaterThanOrEqual(5);
    expect(artifact.provenance.scrape_date).toBe('2026-07-10');
    expect(artifact.provenance.source_urls.swebench_verified).toBe(
      BENCHMARK_SOURCE_URLS.swebench_verified,
    );
    expect(artifact.aliases?.['claude-opus-4']).toBe('claude-opus-4-5');
    expect(artifact.aliases?.['cursor/auto']).toBe('gpt-5.3-codex');

    for (const benchmark of BENCHMARK_IDS) {
      const text = readFileSync(
        join(DEFAULT_RECORDED_LEADERBOARDS_DIR, `${benchmark}.json`),
        'utf8',
      );
      const recorded = parseBenchmarkLeaderboardFixture(text, `${benchmark}.json`);
      expect(recorded.scrape_date).toBe('2026-07-10');
      expect(recorded.source_url).toMatch(/^https?:\/\//);
      expect(recorded.entries.length).toBeGreaterThan(0);
    }
  });

  it('registry has four adapters with provenance URLs; bfcl has native live URL (SP-184)', () => {
    expect(Object.keys(LEADERBOARD_ADAPTERS).sort()).toEqual([...BENCHMARK_IDS].sort());
    expect(getDefaultLiveFetchUrls()).toEqual({
      bfcl: 'https://raw.githubusercontent.com/ShishirPatil/gorilla/gh-pages/data_overall.csv',
    });
    for (const benchmark of BENCHMARK_IDS) {
      const adapter = getLeaderboardAdapter(benchmark);
      expect(adapter.id).toBe(benchmark);
      expect(adapter.provenanceUrl).toBe(BENCHMARK_SOURCE_URLS[benchmark]);
      if (benchmark === 'bfcl') {
        expect(adapter.liveFetchUrl).toBe(
          'https://raw.githubusercontent.com/ShishirPatil/gorilla/gh-pages/data_overall.csv',
        );
      } else {
        expect(adapter.liveFetchUrl).toBeUndefined();
      }
    }
  });

  it('HTML live falls back to recorded/fixtures without corrupting output when all live fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp181-html-fallback-'));
    const outputPath = join(dir, 'benchmark-profiles.json');
    const recordDir = join(dir, 'recorded');
    writeFileSync(outputPath, '{"sentinel":true}\n', 'utf8');

    try {
      await runIngestCli(
        [
          '--live',
          '--record-dir',
          recordDir,
          '--output',
          outputPath,
          '--catalog-freeze-date',
          '2026-07-10',
          '--scrape-date',
          '2026-07-10',
        ],
        {
          fetchFn: async () =>
            new Response('<!DOCTYPE html><html><body>leaderboard</body></html>', {
              status: 200,
            }),
        },
      );

      const artifact = parseBenchmarkProfilesArtifact(JSON.parse(readFileSync(outputPath, 'utf8')));
      expect(artifact.provenance.scrape_date).toBe('2026-07-10');
      expect(artifact.models.length).toBeGreaterThan(0);
      const recordedFiles = readdirSync(recordDir).filter((name) => name.endsWith('.json')).sort();
      expect(recordedFiles).toEqual([
        'bfcl.json',
        'livecodebench.json',
        'swebench_verified.json',
        'terminal_bench.json',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('live with --live-url records snapshots; empty fallback dirs fail without corrupting output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp181-live-'));
    const outputPath = join(dir, 'benchmark-profiles.json');
    const recordDir = join(dir, 'recorded');
    const emptyFallback = join(dir, 'empty-fallback');
    writeFileSync(outputPath, '{"sentinel":true}\n', 'utf8');

    const mirrorBase = 'https://mirror.example/leaderboards';
    const liveUrlArgs = BENCHMARK_IDS.flatMap((benchmark) => [
      '--live-url',
      `${benchmark}=${mirrorBase}/${benchmark}.json`,
    ]);

    try {
      await expect(
        runIngestCli(
          ['--live', '--record-dir', recordDir, '--output', outputPath, ...liveUrlArgs],
          {
            fetchFn: async () =>
              new Response('<!DOCTYPE html><html><body>leaderboard</body></html>', {
                status: 200,
              }),
            liveFetchOptions: {
              recordedDir: emptyFallback,
              fixturesDir: emptyFallback,
            },
          },
        ),
      ).rejects.toThrow(/No leaderboard snapshot|HTML|Failed to resolve/);

      expect(readFileSync(outputPath, 'utf8')).toContain('sentinel');
      expect(() => readdirSync(recordDir)).toThrow();

      const bodies = new Map<string, string>(
        BENCHMARK_IDS.map((benchmark) => {
          if (benchmark === 'bfcl') {
            // SP-184 native adapter expects Gorilla CSV, not fixture-shaped JSON
            const csv = [
              'Rank,Overall Acc,Model,Organization',
              '1,80%,Claude-Opus-4-5-20251101 (FC),Anthropic',
              '2,82%,gpt-5.3-codex (FC),OpenAI',
            ].join('\n');
            return [`${mirrorBase}/${benchmark}.json`, csv];
          }
          const payload: BenchmarkLeaderboardFixture = {
            benchmark,
            source_url: BENCHMARK_SOURCE_URLS[benchmark],
            scrape_date: '2026-07-10',
            entries: [
              { model_id: 'claude-opus-4-5', score: 80 },
              { model_id: 'gpt-5.3-codex', score: 82 },
            ],
          };
          return [`${mirrorBase}/${benchmark}.json`, JSON.stringify(payload)];
        }),
      );

      await runIngestCli(
        [
          '--live',
          '--record-dir',
          recordDir,
          '--output',
          outputPath,
          '--catalog-freeze-date',
          '2026-07-10',
          '--scrape-date',
          '2026-07-10',
          ...liveUrlArgs,
        ],
        {
          fetchFn: async (url) => {
            const body = bodies.get(url);
            if (body === undefined) {
              return new Response('not found', { status: 404 });
            }
            return new Response(body, {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          },
          liveFetchOptions: {
            recordedDir: emptyFallback,
            fixturesDir: emptyFallback,
          },
        },
      );

      const recordedFiles = readdirSync(recordDir).filter((name) => name.endsWith('.json')).sort();
      expect(recordedFiles).toEqual([
        'bfcl.json',
        'livecodebench.json',
        'swebench_verified.json',
        'terminal_bench.json',
      ]);
      const recorded = parseBenchmarkLeaderboardFixture(
        readFileSync(join(recordDir, 'swebench_verified.json'), 'utf8'),
        'recorded',
      );
      expect(recorded.scrape_date).toBe('2026-07-10');
      expect(recorded.source_url).toBe(BENCHMARK_SOURCE_URLS.swebench_verified);

      const artifact = parseBenchmarkProfilesArtifact(JSON.parse(readFileSync(outputPath, 'utf8')));
      expect(artifact.provenance.scrape_date).toBe('2026-07-10');
      expect(artifact.models.length).toBe(2);
      expect(artifact.aliases?.['claude-opus-4']).toBe('claude-opus-4-5');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('mixed live success + live fail falls back per benchmark; siblings still present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp181-mixed-'));
    const recordDir = join(dir, 'out-recorded');
    const mirrorBase = 'https://mirror.example/mixed';

    try {
      const result = await fetchAllLiveLeaderboards({
        scrapeDate: '2026-07-10',
        sourceUrls: {
          swebench_verified: `${mirrorBase}/swebench_verified.json`,
          livecodebench: `${mirrorBase}/livecodebench.json`,
          bfcl: `${mirrorBase}/bfcl.json`,
          terminal_bench: `${mirrorBase}/terminal_bench.json`,
        },
        recordedDir: DEFAULT_RECORDED_LEADERBOARDS_DIR,
        fixturesDir: DEFAULT_BENCHMARK_FIXTURES_DIR,
        fetchFn: async (url) => {
          if (url.endsWith('/swebench_verified.json')) {
            const payload: BenchmarkLeaderboardFixture = {
              benchmark: 'swebench_verified',
              source_url: BENCHMARK_SOURCE_URLS.swebench_verified,
              scrape_date: '2026-07-10',
              entries: [{ model_id: 'claude-opus-4-5', score: 91 }],
            };
            return new Response(JSON.stringify(payload), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response('<!DOCTYPE html><html></html>', { status: 200 });
        },
      });

      expect(result.fixtures).toHaveLength(4);
      expect(result.loads.map((load) => load.benchmark).sort()).toEqual([...BENCHMARK_IDS].sort());

      const byId = Object.fromEntries(
        result.loads.map((load) => [load.benchmark, load] as const),
      );
      expect(byId.swebench_verified?.source).toBe('live');
      expect(byId.swebench_verified?.fixture.entries[0]?.score).toBe(91);
      expect(byId.livecodebench?.source).not.toBe('live');
      expect(byId.bfcl?.source).not.toBe('live');
      expect(byId.terminal_bench?.source).not.toBe('live');
      expect(byId.livecodebench?.fixture.entries.length).toBeGreaterThan(0);

      writeRecordedLeaderboardSnapshots(result.fixtures, recordDir);
      expect(readdirSync(recordDir).filter((n) => n.endsWith('.json'))).toHaveLength(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fetchLiveLeaderboardSnapshot rejects network errors clearly', async () => {
    await expect(
      fetchLiveLeaderboardSnapshot('bfcl', {
        sourceUrls: { bfcl: 'https://mirror.example/bfcl.json' },
        fetchFn: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    ).rejects.toThrow(/Live fetch failed for bfcl.*ECONNREFUSED/);
  });

  it('writeRecordedLeaderboardSnapshots persists scrape_date and source_url', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp179-record-'));
    try {
      const fixtures = BENCHMARK_IDS.map((benchmark) => ({
        benchmark,
        source_url: BENCHMARK_SOURCE_URLS[benchmark],
        scrape_date: '2026-07-10',
        entries: [{ model_id: 'gpt-5.3-codex', score: 80 }],
      }));
      const written = writeRecordedLeaderboardSnapshots(fixtures, dir);
      expect(written).toHaveLength(4);
      const parsed = parseBenchmarkLeaderboardFixture(
        readFileSync(join(dir, 'terminal_bench.json'), 'utf8'),
        'terminal_bench.json',
      );
      expect(parsed.scrape_date).toBe('2026-07-10');
      expect(parsed.source_url).toBe(BENCHMARK_SOURCE_URLS.terminal_bench);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
