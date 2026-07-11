import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertAbsoluteGates,
  assertBaselineRegression,
  assertReleaseGates,
  loadBaselineMetricsFromVersion,
  loadReleaseGatesConfig,
  loadReleaseGatesConfigFromFile,
  parseAssertReleaseGatesArgs,
  parseHarnessMetricsInput,
  type ReleaseGatesConfig,
} from '../../scripts/eval/assert-release-gates.js';
import { runHarnessOnDir } from '../../scripts/eval/run-harness.js';

const FIXTURES_DIR = join('tests', 'eval', 'fixtures');
const CORPUS_DIR = join('tests', 'eval', 'corpus', 'twinrouterbench');
const CONFIG_PATH = join('config', 'release-gates.json');

function loadConfig(): ReleaseGatesConfig {
  return loadReleaseGatesConfigFromFile(CONFIG_PATH);
}

describe('release gate config (SP-165)', () => {
  it('validates checked-in release-gates.json schema', () => {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as unknown;
    const config = loadReleaseGatesConfig(raw);

    expect(config.version).toBe(1);
    expect(config.absolute_gates.mean_capability_adequacy_rate_min).toBeGreaterThan(0);
    expect(config.absolute_gates.mean_quality_retention_min).toBeGreaterThan(0);
    expect(config.absolute_gates.mean_over_routing_rate_max).toBeLessThanOrEqual(1);
    expect(config.absolute_gates.mean_pin_preserved_rate_min).toBeGreaterThan(0);
    expect(config.baseline_regression?.reference_version).toBe('0.6.0');
  });

  it('rejects invalid config shape', () => {
    expect(() =>
      loadReleaseGatesConfig({
        version: 2,
        absolute_gates: {},
      }),
    ).toThrow(/invalid release-gates config/);
  });
});

describe('assertAbsoluteGates (SP-165)', () => {
  it('passes with current fixture harness metrics and checked-in thresholds', () => {
    const aggregate = runHarnessOnDir(FIXTURES_DIR);
    const config = loadConfig();

    const result = assertAbsoluteGates(
      {
        mean_capability_adequacy_rate: aggregate.tracks.capability.mean_capability_adequacy_rate,
        mean_quality_retention: aggregate.tracks.capability.mean_quality_retention,
        mean_over_routing_rate: aggregate.tracks.capability.mean_over_routing_rate,
        mean_pin_preserved_rate: aggregate.tracks.continuity.mean_pin_preserved_rate,
      },
      config,
    );

    expect(result.passed).toBe(true);
    expect(result.failed_gates).toEqual([]);
  });

  it('fails when mean_quality_retention_min is violated', () => {
    const config = loadConfig();
    const metrics = {
      mean_capability_adequacy_rate: 1,
      mean_quality_retention: 0.5,
      mean_over_routing_rate: 0,
      mean_pin_preserved_rate: 1,
    };

    const result = assertAbsoluteGates(metrics, config);

    expect(result.passed).toBe(false);
    expect(result.failed_gates).toHaveLength(1);
    expect(result.failed_gates[0]?.gate).toBe('mean_quality_retention_min');
    expect(result.failed_gates[0]?.comparison).toBe('min');
  });

  it('fails when mean_over_routing_rate_max is violated', () => {
    const config = loadConfig();
    const metrics = {
      mean_capability_adequacy_rate: 1,
      mean_quality_retention: 1,
      mean_over_routing_rate: 0.99,
      mean_pin_preserved_rate: 1,
    };

    const result = assertAbsoluteGates(metrics, config);

    expect(result.passed).toBe(false);
    expect(result.failed_gates.some((g) => g.gate === 'mean_over_routing_rate_max')).toBe(true);
  });

  it('parses harness metrics JSON subset', () => {
    const parsed = parseHarnessMetricsInput({
      tracks: {
        capability: {
          mean_capability_adequacy_rate: 0.875,
          mean_quality_retention: 0.75,
          mean_over_routing_rate: 0.125,
        },
        continuity: {
          mean_pin_preserved_rate: 0.625,
        },
      },
    });

    expect(parsed.mean_capability_adequacy_rate).toBe(0.875);
    expect(parsed.mean_pin_preserved_rate).toBe(0.625);
  });
});

describe('assertReleaseGates fixtures path (SP-165)', () => {
  it('passes when running harness on fixture directory', () => {
    const result = assertReleaseGates({
      configPath: CONFIG_PATH,
      fixturesDir: FIXTURES_DIR,
    });

    expect(result.passed).toBe(true);
    expect(result.absolute_gates.passed).toBe(true);
  });
});

describe('corpus path + report-only CLI (SP-188)', () => {
  it('parses --fixtures corpus path and --report-only', () => {
    const parsed = parseAssertReleaseGatesArgs([
      '--fixtures',
      CORPUS_DIR,
      '--report-only',
    ]);

    expect(parsed.reportOnly).toBe(true);
    expect(parsed.fixturesDir).toContain('twinrouterbench');
  });

  it('scores corpus subset without changing absolute thresholds', () => {
    const result = assertReleaseGates({
      configPath: CONFIG_PATH,
      fixturesDir: CORPUS_DIR,
    });
    const config = loadConfig();

    // Corpus is a soft-feed for #95 — over-routing exceeds absolute max today.
    expect(config.absolute_gates.mean_over_routing_rate_max).toBe(0.15);
    expect(result.absolute_gates.passed).toBe(false);
    expect(
      result.absolute_gates.failed_gates.some((g) => g.gate === 'mean_over_routing_rate_max'),
    ).toBe(true);
  });
});

describe('baseline regression gates (SP-168)', () => {
  it('loads v0.6.0 baseline metrics from versioned snapshot', () => {
    const baseline = loadBaselineMetricsFromVersion('0.6.0');

    expect(baseline.mean_quality_retention).toBe(0.75);
    expect(baseline.mean_capability_adequacy_rate).toBe(0.875);
  });

  it('passes when current metrics match frozen baseline', () => {
    const aggregate = runHarnessOnDir(FIXTURES_DIR);
    const current = {
      mean_capability_adequacy_rate: aggregate.tracks.capability.mean_capability_adequacy_rate,
      mean_quality_retention: aggregate.tracks.capability.mean_quality_retention,
      mean_over_routing_rate: aggregate.tracks.capability.mean_over_routing_rate,
      mean_pin_preserved_rate: aggregate.tracks.continuity.mean_pin_preserved_rate,
    };
    const baseline = loadBaselineMetricsFromVersion('0.6.0');
    const config = loadConfig();

    const result = assertBaselineRegression(current, baseline, config.baseline_regression!);

    expect(result.passed).toBe(true);
    expect(result.failed_gates).toEqual([]);
  });

  it('fails when simulated QR regression exceeds threshold', () => {
    const baseline = loadBaselineMetricsFromVersion('0.6.0');
    const config = loadConfig();
    const regressed = {
      ...baseline,
      mean_quality_retention: baseline.mean_quality_retention - 0.1,
    };

    const result = assertBaselineRegression(regressed, baseline, config.baseline_regression!);

    expect(result.passed).toBe(false);
    expect(result.failed_gates.some((g) => g.gate === 'max_quality_retention_drop')).toBe(true);
  });

  it('fails release gates when baseline regression is violated via metrics', () => {
    const baseline = loadBaselineMetricsFromVersion('0.6.0');
    const regressed = {
      ...baseline,
      mean_quality_retention: 0.5,
      mean_capability_adequacy_rate: 0.5,
      mean_pin_preserved_rate: 0.4,
      mean_over_routing_rate: 0.5,
    };

    const regressionOnly = assertBaselineRegression(
      regressed,
      baseline,
      loadConfig().baseline_regression!,
    );
    expect(regressionOnly.passed).toBe(false);
    expect(regressionOnly.failed_gates.length).toBeGreaterThan(0);
  });

  it('passes fixtures path with baseline version from config', () => {
    const combined = assertReleaseGates({
      configPath: CONFIG_PATH,
      fixturesDir: FIXTURES_DIR,
      baselineVersion: '0.6.0',
    });
    expect(combined.passed).toBe(true);
    expect(combined.baseline_regression?.passed).toBe(true);
  });
});
