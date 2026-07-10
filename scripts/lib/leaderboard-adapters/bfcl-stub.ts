/**
 * BFCL stub adapter — SP-181 (native parser: SP-184).
 */

import { BENCHMARK_SOURCE_URLS } from '../../ingest-benchmark-profiles.js';

import { createFixtureShapedStubAdapter } from './fixture-shaped-stub.js';
import type { LeaderboardAdapter } from './types.js';

export const bfclStubAdapter: LeaderboardAdapter = createFixtureShapedStubAdapter({
  id: 'bfcl',
  provenanceUrl: BENCHMARK_SOURCE_URLS.bfcl,
  // liveFetchUrl unset — override via --live-url until SP-184
});
