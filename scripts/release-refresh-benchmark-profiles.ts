#!/usr/bin/env node
/**
 * Pre-tag release gate: live leaderboard ingest (fixture fallback) so every
 * release ships the latest grounded capability profiles on main before
 * `npm version` / tag. Skippable for offline work or when profiles are already
 * frozen in a tag checkout.
 *
 * Env:
 *   SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1 — verify only (no live fetch)
 *   GITHUB_REF=refs/tags/* — verify only (tag publish / immutable checkout)
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Paths that must be committed after a successful live/fixture refresh. */
export const RELEASE_BENCHMARK_PROFILE_PATHS = [
  'config/benchmark-profiles.json',
  'tests/fixtures/benchmark-leaderboards/recorded',
] as const;

export function shouldSkipLiveRefresh(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH === '1') {
    return true;
  }
  const ref = env.GITHUB_REF ?? '';
  if (ref.startsWith('refs/tags/')) {
    return true;
  }
  return false;
}

/** Parse `git status --porcelain` lines into dirty paths under release profile roots. */
export function listDirtyReleaseProfilePaths(
  porcelain: string,
  roots: readonly string[] = RELEASE_BENCHMARK_PROFILE_PATHS,
): string[] {
  const dirty = new Set<string>();
  for (const line of porcelain.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }
    // porcelain: XY PATH or XY ORIG -> PATH
    const pathPart = line.slice(3).split(' -> ').pop()?.trim() ?? '';
    if (pathPart.length === 0) {
      continue;
    }
    for (const root of roots) {
      if (pathPart === root || pathPart.startsWith(`${root}/`)) {
        dirty.add(pathPart);
      }
    }
  }
  return [...dirty].sort();
}

function runNpm(args: readonly string[]): void {
  const result = spawnSync('npm', [...args], {
    cwd: resolve(process.cwd()),
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed with exit ${result.status ?? 'null'}`);
  }
}

function gitPorcelain(): string {
  const result = spawnSync('git', ['status', '--porcelain', '--', ...RELEASE_BENCHMARK_PROFILE_PATHS], {
    cwd: resolve(process.cwd()),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`git status failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
  return result.stdout ?? '';
}

function utcDateYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function refreshLiveWithFixtureFallback(): { mode: 'live' | 'fixtures_fallback' } {
  const freezeDate = utcDateYmd();
  console.log(`Release benchmark refresh: attempting live ingest (catalog_freeze_date=${freezeDate})…`);
  const live = spawnSync(
    'npm',
    [
      'run',
      'routing:ingest-benchmarks',
      '--',
      '--live',
      '--catalog-freeze-date',
      freezeDate,
      '--scrape-date',
      freezeDate,
    ],
    {
      cwd: resolve(process.cwd()),
      encoding: 'utf8',
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (live.status === 0) {
    console.log('Live ingest succeeded.');
    return { mode: 'live' };
  }
  console.warn('Live ingest failed or unavailable; falling back to checked-in fixtures.');
  runNpm([
    'run',
    'routing:ingest-benchmarks',
    '--',
    '--catalog-freeze-date',
    freezeDate,
  ]);
  return { mode: 'fixtures_fallback' };
}

export function main(env: NodeJS.ProcessEnv = process.env): void {
  if (shouldSkipLiveRefresh(env)) {
    console.log(
      'Skipping live benchmark refresh (SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1 or tag ref); verifying committed profiles only.',
    );
    runNpm(['run', 'routing:verify-benchmark-profiles']);
    return;
  }

  const { mode } = refreshLiveWithFixtureFallback();
  runNpm(['run', 'routing:verify-benchmark-profiles']);

  const dirty = listDirtyReleaseProfilePaths(gitPorcelain());
  if (dirty.length > 0) {
    console.error('');
    console.error('Release gate: benchmark profiles changed and are not committed.');
    console.error(`Ingest mode: ${mode}`);
    console.error('Dirty paths:');
    for (const path of dirty) {
      console.error(`  - ${path}`);
    }
    console.error('');
    console.error('Commit these files on main, then re-run `npm run release:check` before tagging.');
    console.error('Offline skip: SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1 npm run release:check');
    process.exitCode = 1;
    return;
  }

  console.log(`Release benchmark refresh clean (mode=${mode}).`);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('release-refresh-benchmark-profiles.ts') ||
    process.argv[1].endsWith('release-refresh-benchmark-profiles.js'));

if (isDirectRun) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
