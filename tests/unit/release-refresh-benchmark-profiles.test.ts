import { describe, expect, it } from 'vitest';

import {
  listDirtyReleaseProfilePaths,
  shouldSkipLiveRefresh,
} from '../../scripts/release-refresh-benchmark-profiles.ts';

describe('release-refresh-benchmark-profiles (SP-180 release gate)', () => {
  it('skips live refresh when env skip flag is set', () => {
    expect(
      shouldSkipLiveRefresh({ SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH: '1' }),
    ).toBe(true);
  });

  it('skips live refresh on tag refs', () => {
    expect(shouldSkipLiveRefresh({ GITHUB_REF: 'refs/tags/v0.9.0' })).toBe(true);
  });

  it('runs live refresh on normal main checkout', () => {
    expect(shouldSkipLiveRefresh({ GITHUB_REF: 'refs/heads/main' })).toBe(false);
  });

  it('lists dirty profile and recorded snapshot paths from porcelain', () => {
    const porcelain = [
      ' M config/benchmark-profiles.json',
      '?? tests/fixtures/benchmark-leaderboards/recorded/bfcl.json',
      ' M README.md',
      'R  tests/fixtures/benchmark-leaderboards/recorded/old.json -> tests/fixtures/benchmark-leaderboards/recorded/new.json',
    ].join('\n');
    expect(listDirtyReleaseProfilePaths(porcelain)).toEqual([
      'config/benchmark-profiles.json',
      'tests/fixtures/benchmark-leaderboards/recorded/bfcl.json',
      'tests/fixtures/benchmark-leaderboards/recorded/new.json',
    ]);
  });
});
