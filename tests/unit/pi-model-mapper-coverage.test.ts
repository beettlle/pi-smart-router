/**
 * SP-198 — Dogfood fleet capability_source coverage metric.
 * Primary list must stay in sync with docs/capability-profile-coverage.md.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_BENCHMARK_PROFILES_PATH,
  getCapabilitySource,
  resetBenchmarkProfilesCacheForTests,
  resolveBenchmarkModelId,
  setBenchmarkProfilesPathForTests,
  type CapabilitySource,
} from '../../src/config/pi-model-mapper.js';

/** Primary Cursor/pi dogfood fleet — must all resolve capability_source=benchmark. */
export const PRIMARY_DOGFOOD_FLEET_IDS: readonly string[] = [
  'claude-opus-4-5',
  'claude-opus-4',
  'claude-sonnet-4-6',
  'claude-sonnet-4',
  'claude-3.5-sonnet',
  'gpt-5.3-codex',
  'gpt-5.5',
  'gpt-5.3',
  'gpt-5',
  'gpt-5-codex',
  'gemini-2.5-flash',
  'gemini-2.5-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'cursor/auto',
  'composer-latest',
  'composer-1',
  'cursor/composer-latest',
  'default',
] as const;

/** Documented intentional gaps — must remain pattern_default (no invented scores). */
export const INTENTIONAL_PATTERN_DEFAULT_IDS: readonly string[] = [
  'claude-haiku-4',
  'claude-3-5-haiku',
  'gpt-5-mini',
  'gpt-5.1-mini',
  'gemini-2.5-pro',
  'local-llama',
  'mystery-model-v9',
] as const;

export function computeDogfoodBenchmarkCoverage(
  fleetIds: readonly string[] = PRIMARY_DOGFOOD_FLEET_IDS,
): { readonly covered: number; readonly total: number; readonly ratio: number } {
  const covered = fleetIds.filter((id) => getCapabilitySource(id) === 'benchmark').length;
  const total = fleetIds.length;
  return { covered, total, ratio: total === 0 ? 0 : covered / total };
}

afterEach(() => {
  resetBenchmarkProfilesCacheForTests();
});

describe('dogfood fleet capability profile coverage (SP-198)', () => {
  it('primary fleet benchmark_coverage is 1.0', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

    const { covered, total, ratio } = computeDogfoodBenchmarkCoverage();
    expect(total).toBe(PRIMARY_DOGFOOD_FLEET_IDS.length);
    expect(covered).toBe(total);
    expect(ratio).toBe(1);

    for (const id of PRIMARY_DOGFOOD_FLEET_IDS) {
      const source: CapabilitySource = getCapabilitySource(id);
      expect(source, id).toBe('benchmark');
      // Alias or direct row must resolve to a real catalog model_id
      expect(resolveBenchmarkModelId(id).length).toBeGreaterThan(0);
    }
  });

  it('intentional gaps stay pattern_default', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

    for (const id of INTENTIONAL_PATTERN_DEFAULT_IDS) {
      expect(getCapabilitySource(id), id).toBe('pattern_default');
    }
  });

  it('primary list includes protocol non-Gemini fallbacks', () => {
    expect(PRIMARY_DOGFOOD_FLEET_IDS).toEqual(
      expect.arrayContaining(['cursor/auto', 'composer-latest', 'gemini-2.5-flash']),
    );
  });
});
