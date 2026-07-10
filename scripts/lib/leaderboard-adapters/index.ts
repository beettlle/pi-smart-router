/**
 * Leaderboard adapter registry — SP-181 / GitHub #104.
 *
 * Maps each BenchmarkId to a stub or native adapter.
 * SP-182–SP-185 replace stubs with native parsers without reworking orchestration.
 */

import {
  BENCHMARK_IDS,
  type BenchmarkId,
} from '../../ingest-benchmark-profiles.js';

import { bfclStubAdapter } from './bfcl-stub.js';
import { livecodebenchStubAdapter } from './livecodebench-stub.js';
import { swebenchVerifiedAdapter } from './swebench-verified.js';
import { terminalBenchAdapter } from './terminal-bench.js';
import type { LeaderboardAdapter } from './types.js';

export type {
  AdapterFetchContext,
  LeaderboardAdapter,
  LeaderboardFetchFn,
  LeaderboardLoadSource,
} from './types.js';

/**
 * Registry of adapters keyed by benchmark id.
 * swebench_verified: native (SP-182); terminal_bench: operator-mirror native (SP-185);
 * livecodebench / bfcl remain stubs until SP-183 / SP-184.
 */
export const LEADERBOARD_ADAPTERS: Readonly<Record<BenchmarkId, LeaderboardAdapter>> = {
  swebench_verified: swebenchVerifiedAdapter,
  livecodebench: livecodebenchStubAdapter,
  bfcl: bfclStubAdapter,
  terminal_bench: terminalBenchAdapter,
};

export function getLeaderboardAdapter(benchmark: BenchmarkId): LeaderboardAdapter {
  return LEADERBOARD_ADAPTERS[benchmark];
}

/**
 * Default live fetch URLs from the registry (stubs omit these).
 * Distinct from human provenance URLs in {@link BENCHMARK_SOURCE_URLS}.
 */
export function getDefaultLiveFetchUrls(): Readonly<Partial<Record<BenchmarkId, string>>> {
  const urls: Partial<Record<BenchmarkId, string>> = {};
  for (const id of BENCHMARK_IDS) {
    const live = LEADERBOARD_ADAPTERS[id].liveFetchUrl;
    if (live !== undefined && live.length > 0) {
      urls[id] = live;
    }
  }
  return urls;
}
