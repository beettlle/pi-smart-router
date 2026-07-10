/**
 * SWE-bench Verified stub adapter — SP-181 (native parser: SP-182).
 */

import { BENCHMARK_SOURCE_URLS } from '../../ingest-benchmark-profiles.js';

import { createFixtureShapedStubAdapter } from './fixture-shaped-stub.js';
import type { LeaderboardAdapter } from './types.js';

export const swebenchVerifiedStubAdapter: LeaderboardAdapter = createFixtureShapedStubAdapter({
  id: 'swebench_verified',
  provenanceUrl: BENCHMARK_SOURCE_URLS.swebench_verified,
  // liveFetchUrl unset — override via --live-url until SP-182
});
