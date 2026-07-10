/**
 * Live leaderboard fetch + recorded snapshot I/O — SP-179 / SP-181 / GitHub #100 / #104.
 *
 * Per-benchmark orchestration: live adapter → recorded dir → checked-in fixtures.
 * One failing live source never aborts siblings; scores are never invented.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BENCHMARK_IDS,
  BenchmarkIngestError,
  DEFAULT_BENCHMARK_FIXTURES_DIR,
  DEFAULT_RECORDED_LEADERBOARDS_DIR,
  parseBenchmarkLeaderboardFixture,
  type BenchmarkId,
  type BenchmarkLeaderboardFixture,
} from '../ingest-benchmark-profiles.js';
import {
  getLeaderboardAdapter,
  type LeaderboardFetchFn,
  type LeaderboardLoadSource,
} from './leaderboard-adapters/index.js';

export { DEFAULT_RECORDED_LEADERBOARDS_DIR };
export type { LeaderboardFetchFn, LeaderboardLoadSource };

export interface LiveLeaderboardFetchOptions {
  readonly fetchFn?: LeaderboardFetchFn;
  readonly scrapeDate?: string;
  /** Per-benchmark URL overrides (operators / CI mirrors). */
  readonly sourceUrls?: Readonly<Partial<Record<BenchmarkId, string>>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** Recorded snapshots directory for per-benchmark fallback. */
  readonly recordedDir?: string;
  /** Checked-in fixtures directory for final fallback. */
  readonly fixturesDir?: string;
}

export interface PerBenchmarkLeaderboardLoad {
  readonly benchmark: BenchmarkId;
  readonly fixture: BenchmarkLeaderboardFixture;
  readonly source: LeaderboardLoadSource;
  /** URL or filesystem path that supplied the snapshot. */
  readonly detail: string;
}

export interface FetchAllLiveLeaderboardsResult {
  readonly fixtures: BenchmarkLeaderboardFixture[];
  readonly loads: readonly PerBenchmarkLeaderboardLoad[];
}

const DEFAULT_LIVE_TIMEOUT_MS = 30_000;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveLiveFetchUrl(
  benchmark: BenchmarkId,
  sourceUrls: Readonly<Partial<Record<BenchmarkId, string>>> | undefined,
): string | undefined {
  const override = sourceUrls?.[benchmark];
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return getLeaderboardAdapter(benchmark).liveFetchUrl;
}

/**
 * Fetch one benchmark leaderboard via its registry adapter.
 * Network and parse failures throw {@link BenchmarkIngestError}.
 * Requires a live URL (adapter default or `--live-url` override).
 */
export async function fetchLiveLeaderboardSnapshot(
  benchmark: BenchmarkId,
  options: LiveLeaderboardFetchOptions = {},
): Promise<BenchmarkLeaderboardFixture> {
  const adapter = getLeaderboardAdapter(benchmark);
  const url = resolveLiveFetchUrl(benchmark, options.sourceUrls);
  if (url === undefined) {
    throw new BenchmarkIngestError(
      `No live fetch URL for ${benchmark}: pass --live-url ${benchmark}=URL ` +
        '(stub adapter has no default until the native SP-182+ adapter lands)',
    );
  }

  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const scrapeDate = options.scrapeDate ?? todayIsoDate();
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;

  return adapter.fetchAndNormalize({
    url,
    fetchFn,
    scrapeDate,
    timeoutMs,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}

function tryLoadBenchmarkSnapshotFromDir(
  dir: string,
  benchmark: BenchmarkId,
): { fixture: BenchmarkLeaderboardFixture; path: string } | undefined {
  const path = join(dir, `${benchmark}.json`);
  if (!existsSync(path)) {
    return undefined;
  }
  const text = readFileSync(path, 'utf8');
  const fixture = parseBenchmarkLeaderboardFixture(text, path);
  if (fixture.benchmark !== benchmark) {
    throw new BenchmarkIngestError(
      `Snapshot benchmark mismatch in ${path}: expected ${benchmark}, got ${fixture.benchmark}`,
    );
  }
  return { fixture, path };
}

/**
 * Resolve one benchmark: live adapter → recorded → checked-in fixture.
 * Live failures are swallowed so siblings can still succeed; missing all
 * three sources throws.
 */
export async function resolveBenchmarkLeaderboardWithFallback(
  benchmark: BenchmarkId,
  options: LiveLeaderboardFetchOptions = {},
): Promise<PerBenchmarkLeaderboardLoad> {
  const scrapeDate = options.scrapeDate ?? todayIsoDate();
  const recordedDir = options.recordedDir ?? DEFAULT_RECORDED_LEADERBOARDS_DIR;
  const fixturesDir = options.fixturesDir ?? DEFAULT_BENCHMARK_FIXTURES_DIR;
  const liveErrors: string[] = [];

  const liveUrl = resolveLiveFetchUrl(benchmark, options.sourceUrls);
  if (liveUrl !== undefined) {
    try {
      const fixture = await fetchLiveLeaderboardSnapshot(benchmark, options);
      return {
        benchmark,
        fixture: { ...fixture, scrape_date: scrapeDate },
        source: 'live',
        detail: liveUrl,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      liveErrors.push(detail);
    }
  } else {
    liveErrors.push(
      `No live fetch URL for ${benchmark} (stub default unset; pass --live-url to attempt live)`,
    );
  }

  const recorded = tryLoadBenchmarkSnapshotFromDir(recordedDir, benchmark);
  if (recorded !== undefined) {
    return {
      benchmark,
      fixture: { ...recorded.fixture, scrape_date: scrapeDate },
      source: 'recorded',
      detail: recorded.path,
    };
  }

  const checkedIn = tryLoadBenchmarkSnapshotFromDir(fixturesDir, benchmark);
  if (checkedIn !== undefined) {
    return {
      benchmark,
      fixture: { ...checkedIn.fixture, scrape_date: scrapeDate },
      source: 'fixture',
      detail: checkedIn.path,
    };
  }

  const liveNote =
    liveErrors.length > 0 ? ` Live attempts: ${liveErrors.join('; ')}` : '';
  throw new BenchmarkIngestError(
    `No leaderboard snapshot for ${benchmark}: live failed or skipped, ` +
      `recorded missing under ${recordedDir}, fixture missing under ${fixturesDir}.${liveNote}`,
  );
}

/**
 * Fetch/resolve all four benchmark leaderboards independently.
 * Fail-fast-all-four behavior is removed — one live failure does not block siblings.
 */
export async function fetchAllLiveLeaderboards(
  options: LiveLeaderboardFetchOptions = {},
): Promise<FetchAllLiveLeaderboardsResult> {
  const loads: PerBenchmarkLeaderboardLoad[] = [];
  const errors: string[] = [];

  for (const benchmark of BENCHMARK_IDS) {
    try {
      loads.push(await resolveBenchmarkLeaderboardWithFallback(benchmark, options));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      errors.push(detail);
    }
  }

  if (errors.length > 0) {
    throw new BenchmarkIngestError(
      `Failed to resolve ${errors.length} benchmark leaderboard(s):\n- ${errors.join('\n- ')}`,
    );
  }

  return {
    fixtures: loads.map((load) => load.fixture),
    loads,
  };
}

/** Serialize a leaderboard fixture with stable formatting. */
export function serializeLeaderboardFixture(fixture: BenchmarkLeaderboardFixture): string {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

/**
 * Write recorded live-style snapshots under `recordDir` (`<benchmark>.json`).
 * Creates the directory when missing.
 */
export function writeRecordedLeaderboardSnapshots(
  fixtures: readonly BenchmarkLeaderboardFixture[],
  recordDir: string,
): string[] {
  mkdirSync(recordDir, { recursive: true });
  const written: string[] = [];
  for (const fixture of fixtures) {
    const path = join(recordDir, `${fixture.benchmark}.json`);
    writeFileSync(path, serializeLeaderboardFixture(fixture), 'utf8');
    written.push(path);
  }
  return written;
}
