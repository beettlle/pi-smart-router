/**
 * LiveCodeBench stub adapter — SP-181 (native parser: SP-183).
 */

import { BENCHMARK_SOURCE_URLS } from '../../ingest-benchmark-profiles.js';

import { createFixtureShapedStubAdapter } from './fixture-shaped-stub.js';
import type { LeaderboardAdapter } from './types.js';

export const livecodebenchStubAdapter: LeaderboardAdapter = createFixtureShapedStubAdapter({
  id: 'livecodebench',
  provenanceUrl: BENCHMARK_SOURCE_URLS.livecodebench,
  // liveFetchUrl unset — override via --live-url until SP-183
});
