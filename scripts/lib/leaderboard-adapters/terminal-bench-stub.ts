/**
 * Terminal-Bench stub adapter — SP-181 (native parser: SP-185).
 */

import { BENCHMARK_SOURCE_URLS } from '../../ingest-benchmark-profiles.js';

import { createFixtureShapedStubAdapter } from './fixture-shaped-stub.js';
import type { LeaderboardAdapter } from './types.js';

export const terminalBenchStubAdapter: LeaderboardAdapter = createFixtureShapedStubAdapter({
  id: 'terminal_bench',
  provenanceUrl: BENCHMARK_SOURCE_URLS.terminal_bench,
  // liveFetchUrl unset — override via --live-url until SP-185
});
