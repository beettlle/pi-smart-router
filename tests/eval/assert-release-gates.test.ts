import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertAbsoluteGates,
  loadReleaseGatesConfig,
  loadReleaseGatesConfigFromFile,
  parseHarnessMetricsInput,
  type ReleaseGatesConfig,
} from '../../scripts/eval/assert-release-gates.js';
import { runHarnessOnDir } from '../../scripts/eval/run-harness.js';

const FIXTURES_DIR = join('tests', 'eval', 'fixtures');
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
  it('passes when running harness on fixture directory', async () => {
    const { assertReleaseGates } = await import('../../scripts/eval/assert-release-gates.js');

    const result = assertReleaseGates({
      configPath: CONFIG_PATH,
      fixturesDir: FIXTURES_DIR,
    });

    expect(result.passed).toBe(true);
  });
});
