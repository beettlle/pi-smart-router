/**
 * Live leaderboard fetch + recorded snapshot I/O — SP-179 / GitHub #100.
 *
 * Adapters pull fixture-shaped JSON from public (or override) URLs.
 * HTML leaderboard pages are rejected with a clear error — scores are never invented.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BENCHMARK_IDS,
  BENCHMARK_SOURCE_URLS,
  BenchmarkIngestError,
  DEFAULT_RECORDED_LEADERBOARDS_DIR,
  parseBenchmarkLeaderboardFixture,
  type BenchmarkId,
  type BenchmarkLeaderboardFixture,
} from '../ingest-benchmark-profiles.js';

export { DEFAULT_RECORDED_LEADERBOARDS_DIR };

export type LeaderboardFetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export interface LiveLeaderboardFetchOptions {
  readonly fetchFn?: LeaderboardFetchFn;
  readonly scrapeDate?: string;
  /** Per-benchmark URL overrides (operators / CI mirrors). */
  readonly sourceUrls?: Readonly<Partial<Record<BenchmarkId, string>>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_LIVE_TIMEOUT_MS = 30_000;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetch one benchmark leaderboard as fixture-shaped JSON.
 * Network and parse failures throw {@link BenchmarkIngestError}.
 */
export async function fetchLiveLeaderboardSnapshot(
  benchmark: BenchmarkId,
  options: LiveLeaderboardFetchOptions = {},
): Promise<BenchmarkLeaderboardFixture> {
  const url = options.sourceUrls?.[benchmark] ?? BENCHMARK_SOURCE_URLS[benchmark];
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const scrapeDate = options.scrapeDate ?? todayIsoDate();
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = (): void => {
    controller.abort();
  };
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });

  let response: Response;
  try {
    response = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new BenchmarkIngestError(
      `Live fetch failed for ${benchmark} (${url}): ${detail}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    throw new BenchmarkIngestError(
      `Live fetch HTTP ${response.status} for ${benchmark} (${url})`,
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    throw new BenchmarkIngestError(
      `Live fetch body read failed for ${benchmark} (${url})`,
      { cause: err },
    );
  }

  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new BenchmarkIngestError(`Live fetch returned empty body for ${benchmark} (${url})`);
  }
  if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
    throw new BenchmarkIngestError(
      `Live fetch for ${benchmark} returned HTML, not fixture-shaped JSON (${url}). ` +
        'Point --live-url at a JSON mirror matching the leaderboard fixture schema, ' +
        'or place recorded snapshots under --record-dir / --recorded.',
    );
  }

  const fixture = parseBenchmarkLeaderboardFixture(trimmed, `live:${benchmark}`);
  if (fixture.benchmark !== benchmark) {
    throw new BenchmarkIngestError(
      `Live snapshot benchmark mismatch for ${benchmark}: got ${fixture.benchmark}`,
    );
  }

  return {
    ...fixture,
    source_url: fixture.source_url || url,
    scrape_date: scrapeDate,
  };
}

/** Fetch all four benchmark leaderboards; fails fast on the first error. */
export async function fetchAllLiveLeaderboards(
  options: LiveLeaderboardFetchOptions = {},
): Promise<BenchmarkLeaderboardFixture[]> {
  const fixtures: BenchmarkLeaderboardFixture[] = [];
  for (const benchmark of BENCHMARK_IDS) {
    fixtures.push(await fetchLiveLeaderboardSnapshot(benchmark, options));
  }
  return fixtures;
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
