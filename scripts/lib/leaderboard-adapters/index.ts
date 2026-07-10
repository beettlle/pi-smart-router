/**
 * Leaderboard adapter registry — SP-181 / GitHub #104.
 *
 * Maps each BenchmarkId to a stub or native adapter.
<<<<<<< HEAD
 * SP-182–SP-185 replace stubs with native parsers without reworking orchestration.
=======
 * SP-182–SP-185 replace remaining stubs without reworking orchestration.
>>>>>>> task/spine-lane-3-20260710T232232
 */

import {
  BENCHMARK_IDS,
  type BenchmarkId,
} from '../../ingest-benchmark-profiles.js';

<<<<<<< HEAD
import { bfclStubAdapter } from './bfcl-stub.js';
import { livecodebenchAdapter } from './livecodebench.js';
import { swebenchVerifiedAdapter } from './swebench-verified.js';
import { terminalBenchAdapter } from './terminal-bench.js';
=======
import { bfclAdapter } from './bfcl.js';
import { livecodebenchStubAdapter } from './livecodebench-stub.js';
import { swebenchVerifiedStubAdapter } from './swebench-stub.js';
import { terminalBenchStubAdapter } from './terminal-bench-stub.js';
>>>>>>> task/spine-lane-3-20260710T232232
import type { LeaderboardAdapter } from './types.js';

export type {
  AdapterFetchContext,
  LeaderboardAdapter,
  LeaderboardFetchFn,
  LeaderboardLoadSource,
} from './types.js';

<<<<<<< HEAD
/**
 * Registry of adapters keyed by benchmark id.
 * swebench_verified (SP-182), livecodebench (SP-183), terminal_bench (SP-185) native;
 * bfcl remains stub until SP-184 merges.
 */
export const LEADERBOARD_ADAPTERS: Readonly<Record<BenchmarkId, LeaderboardAdapter>> = {
  swebench_verified: swebenchVerifiedAdapter,
  livecodebench: livecodebenchAdapter,
  bfcl: bfclStubAdapter,
  terminal_bench: terminalBenchAdapter,
=======
/** Registry of adapters keyed by benchmark id (native BFCL; stubs until SP-182/183/185). */
export const LEADERBOARD_ADAPTERS: Readonly<Record<BenchmarkId, LeaderboardAdapter>> = {
  swebench_verified: swebenchVerifiedStubAdapter,
  livecodebench: livecodebenchStubAdapter,
  bfcl: bfclAdapter,
  terminal_bench: terminalBenchStubAdapter,
>>>>>>> task/spine-lane-3-20260710T232232
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
