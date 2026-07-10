/**
 * Unit tests for per-benchmark live fallback orchestration — SP-181.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  BENCHMARK_IDS,
  BENCHMARK_SOURCE_URLS,
  DEFAULT_BENCHMARK_FIXTURES_DIR,
  DEFAULT_RECORDED_LEADERBOARDS_DIR,
  type BenchmarkLeaderboardFixture,
} from '../../scripts/ingest-benchmark-profiles.js';
import {
  fetchAllLiveLeaderboards,
  fetchLiveLeaderboardSnapshot,
  resolveBenchmarkLeaderboardWithFallback,
  type PerBenchmarkLeaderboardLoad,
} from '../../scripts/lib/benchmark-leaderboard-fetch.js';
import {
  getDefaultLiveFetchUrls,
  LEADERBOARD_ADAPTERS,
} from '../../scripts/lib/leaderboard-adapters/index.js';

function loadsById(
  loads: readonly PerBenchmarkLeaderboardLoad[],
): Record<string, PerBenchmarkLeaderboardLoad> {
  return Object.fromEntries(loads.map((load) => [load.benchmark, load]));
}

describe('benchmark-leaderboard-fetch (SP-181)', () => {
  it('exposes an adapter registry for all four benchmarks', () => {
    expect(Object.keys(LEADERBOARD_ADAPTERS)).toHaveLength(4);
    // SP-184 registers bfcl live URL; remaining stubs omit defaults until SP-182/183/185
    expect(getDefaultLiveFetchUrls()).toEqual({
      bfcl: 'https://raw.githubusercontent.com/ShishirPatil/gorilla/gh-pages/data_overall.csv',
    });
  });

  it('fetchLiveLeaderboardSnapshot requires a live URL when stub has none', async () => {
    await expect(
      fetchLiveLeaderboardSnapshot('terminal_bench', {
        fetchFn: async () => new Response('{}', { status: 200 }),
      }),
    ).rejects.toThrow(/No live fetch URL for terminal_bench/);
  });

  it('resolves live → recorded → fixture independently per benchmark', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp181-fetch-'));
    const recordedDir = join(dir, 'recorded');
    const fixturesDir = join(dir, 'fixtures');
    mkdirSync(recordedDir, { recursive: true });
    mkdirSync(fixturesDir, { recursive: true });

    try {
      writeFileSync(
        join(recordedDir, 'bfcl.json'),
        `${JSON.stringify({
          benchmark: 'bfcl',
          source_url: BENCHMARK_SOURCE_URLS.bfcl,
          scrape_date: '2026-07-01',
          entries: [{ model_id: 'recorded-bfcl', score: 55 }],
        })}\n`,
        'utf8',
      );

      for (const benchmark of BENCHMARK_IDS) {
        if (benchmark === 'bfcl') continue;
        writeFileSync(
          join(fixturesDir, `${benchmark}.json`),
          `${JSON.stringify({
            benchmark,
            source_url: BENCHMARK_SOURCE_URLS[benchmark],
            scrape_date: '2026-07-01',
            entries: [{ model_id: `fixture-${benchmark}`, score: 40 }],
          })}\n`,
          'utf8',
        );
      }

      const result = await fetchAllLiveLeaderboards({
        scrapeDate: '2026-07-10',
        sourceUrls: {
          swebench_verified: 'https://mirror.example/swe.json',
        },
        recordedDir,
        fixturesDir,
        fetchFn: async (url) => {
          if (url.includes('swe.json')) {
            const payload: BenchmarkLeaderboardFixture = {
              benchmark: 'swebench_verified',
              source_url: BENCHMARK_SOURCE_URLS.swebench_verified,
              scrape_date: '2026-07-10',
              entries: [{ model_id: 'live-swe', score: 99 }],
            };
            return new Response(JSON.stringify(payload), { status: 200 });
          }
          return new Response('nope', { status: 500 });
        },
      });

      const byId = loadsById(result.loads);
      expect(byId.swebench_verified?.source).toBe('live');
      expect(byId.swebench_verified?.fixture.entries[0]?.model_id).toBe('live-swe');
      expect(byId.bfcl?.source).toBe('recorded');
      expect(byId.bfcl?.fixture.entries[0]?.model_id).toBe('recorded-bfcl');
      expect(byId.livecodebench?.source).toBe('fixture');
      expect(byId.terminal_bench?.source).toBe('fixture');
      expect(result.fixtures).toHaveLength(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to checked-in recorded when live is skipped (no URL)', async () => {
    const load = await resolveBenchmarkLeaderboardWithFallback('livecodebench', {
      scrapeDate: '2026-07-10',
      recordedDir: DEFAULT_RECORDED_LEADERBOARDS_DIR,
      fixturesDir: DEFAULT_BENCHMARK_FIXTURES_DIR,
    });
    expect(load.source).toBe('recorded');
    expect(load.fixture.benchmark).toBe('livecodebench');
    expect(load.fixture.entries.length).toBeGreaterThan(0);
  });
});
