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
  'claude-3-7-haiku',
  'gpt-5-mini',
  'gpt-5.1-mini',
  'gemini-2.5-pro',
  'gemini-2.5-flash-tts',
  'local-llama',
  'mystery-model-v9',
  // Multi-fleet gaps with no grounded row (SP-208 / #124) — aliasing would
  // misrepresent capability across a provider family.
  'github-copilot/o3',
  'github-copilot/o4-mini',
  'github-copilot/gpt-4o',
  'github-copilot/gemini-2.5-pro',
] as const;

/**
 * Multi-fleet dogfood IDs — Copilot / Gemini / Anthropic catalog strings
 * (SP-208 / #124). Each must resolve capability_source=benchmark via a
 * **family-preserving** alias: a Copilot-exposed Claude maps to the Anthropic
 * row, Copilot-GPT to the OpenAI row, Copilot-Gemini to the Gemini row. No
 * silent cross-family collapse.
 */
export const MULTI_FLEET_DOGFOOD_IDS: readonly string[] = [
  // Anthropic catalog strings → claude-opus-4-5 / claude-sonnet-4-6 rows
  'claude-opus-4.1',
  'claude-sonnet-4.5',
  'claude-3-7-sonnet',
  'claude-3.7-sonnet',
  'anthropic/claude-sonnet-4',
  // Gemini flash variants → gemini-2.5-flash row
  'gemini-1.5-flash',
  'gemini-2.0-flash-001',
  'gemini-2.5-flash-002',
  'google/gemini-2.5-flash',
  // GitHub Copilot — resolved per underlying provider family
  'github-copilot/claude-sonnet-4.5',
  'github-copilot/claude-3.5-sonnet',
  'github-copilot/gpt-5',
  'github-copilot/gpt-5-codex',
  'github-copilot/gemini-2.5-flash',
  'github-copilot/gemini-2.0-flash',
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

describe('multi-fleet capability coverage (SP-208 / #124)', () => {
  it('multi-fleet IDs all resolve capability_source=benchmark', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

    for (const id of MULTI_FLEET_DOGFOOD_IDS) {
      const source: CapabilitySource = getCapabilitySource(id);
      expect(source, id).toBe('benchmark');
    }

    const { covered, total, ratio } = computeDogfoodBenchmarkCoverage(MULTI_FLEET_DOGFOOD_IDS);
    expect(covered).toBe(total);
    expect(ratio).toBe(1);
  });

  it('Copilot IDs preserve their underlying provider family — no silent cross-family collapse', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

    // Copilot-exposed Claude → Anthropic fixture row (NOT OpenAI gpt-5.3-codex)
    expect(resolveBenchmarkModelId('github-copilot/claude-sonnet-4.5')).toBe('claude-sonnet-4-6');
    expect(resolveBenchmarkModelId('github-copilot/claude-3.5-sonnet')).toBe('claude-sonnet-4-6');
    // Copilot-exposed GPT → OpenAI fixture row
    expect(resolveBenchmarkModelId('github-copilot/gpt-5')).toBe('gpt-5.3-codex');
    expect(resolveBenchmarkModelId('github-copilot/gpt-5-codex')).toBe('gpt-5.3-codex');
    // Copilot-exposed Gemini → Gemini fixture row (NOT OpenAI gpt-5.3-codex)
    expect(resolveBenchmarkModelId('github-copilot/gemini-2.5-flash')).toBe('gemini-2.5-flash');
    expect(resolveBenchmarkModelId('github-copilot/gemini-2.0-flash')).toBe('gemini-2.5-flash');
  });

  it('multi-fleet intentional gaps stay pattern_default', () => {
    setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

    const multiFleetGaps = [
      'github-copilot/o3',
      'github-copilot/o4-mini',
      'github-copilot/gpt-4o',
      'github-copilot/gemini-2.5-pro',
      'claude-3-7-haiku',
      'gemini-2.5-flash-tts',
    ];
    for (const id of multiFleetGaps) {
      expect(getCapabilitySource(id), id).toBe('pattern_default');
    }
  });
});
