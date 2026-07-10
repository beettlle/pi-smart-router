/**
 * Leaderboard adapter contract — SP-181 / GitHub #104.
 *
 * Native adapters (SP-182–SP-185) replace stubs without changing orchestration.
 * Stubs accept fixture-shaped JSON only (preserve `--live-url` JSON mirrors).
 */

import type {
  BenchmarkId,
  BenchmarkLeaderboardFixture,
} from '../../ingest-benchmark-profiles.js';

/** Injectable fetch for tests / offline mirrors. */
export type LeaderboardFetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/** Context passed to {@link LeaderboardAdapter.fetchAndNormalize}. */
export interface AdapterFetchContext {
  readonly url: string;
  readonly fetchFn: LeaderboardFetchFn;
  readonly scrapeDate: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
}

/**
 * Converts a live (or override) payload into a fixture-shaped snapshot.
 * Never invents scores — parse failures must throw.
 */
export interface LeaderboardAdapter {
  readonly id: BenchmarkId;
  /** Human-facing provenance URL (HTML docs / leaderboard page). */
  readonly provenanceUrl: string;
  /**
   * Default machine-readable live endpoint (JSON/CSV).
   * `undefined` for stubs until a native adapter lands (override via `--live-url`).
   */
  readonly liveFetchUrl: string | undefined;
  fetchAndNormalize(ctx: AdapterFetchContext): Promise<BenchmarkLeaderboardFixture>;
}

/** Which source supplied a per-benchmark snapshot during live orchestration. */
export type LeaderboardLoadSource = 'live' | 'recorded' | 'fixture';
