import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  adaptTwinRouterBenchStaticTrack,
  isTwinRouterBenchStaticTrack,
  loadTwinRouterBenchStaticTrack,
  parseTwinRouterBenchStaticTrack,
  TWINROUTERBENCH_STATIC_SCHEMA_VERSION,
} from '../../scripts/eval/twinrouterbench-adapter.js';
import { scoreFixtureHarness } from '../../scripts/eval/harness-tracks.js';

const TRB_FIXTURES_DIR = join('tests', 'eval', 'fixtures', 'twinrouterbench');

function loadTrbFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(TRB_FIXTURES_DIR, name), 'utf8'));
}

describe('TwinRouterBench static track adapter (SP-153)', () => {
  it('detects TwinRouterBench static track documents', () => {
    expect(isTwinRouterBenchStaticTrack(loadTrbFixture('swe-bench-trivial-prefix.json'))).toBe(true);
    expect(
      isTwinRouterBenchStaticTrack(
        JSON.parse(readFileSync(join('tests', 'eval', 'fixtures', 'trivial-pin-session.json'), 'utf8')),
      ),
    ).toBe(false);
  });

  it('parses static track schema version and track field', () => {
    const track = parseTwinRouterBenchStaticTrack(loadTrbFixture('swe-bench-trivial-prefix.json'));
    expect(track.schema_version).toBe(TWINROUTERBENCH_STATIC_SCHEMA_VERSION);
    expect(track.track).toBe('static');
    expect(track.records).toHaveLength(2);
    expect(track.frozen_catalog.catalog_id).toBe('pi-smart-router-v0.5.0-eval');
  });

  it('adapts SWE-bench static prefixes into eval trace fixtures', () => {
    const track = parseTwinRouterBenchStaticTrack(loadTrbFixture('swe-bench-trivial-prefix.json'));
    const fixtures = adaptTwinRouterBenchStaticTrack(track);

    expect(fixtures).toHaveLength(1);
    const fixture = fixtures[0]!;
    expect(fixture.fixture_id).toMatch(/^trb-static-swe-bench-verified-/);
    expect(fixture.session.steps).toHaveLength(2);
    expect(fixture.session.steps[0]!.prefix_hash).toBe('trb_sw042_s0_prefix_a1b2c3d4');
    expect(fixture.session.steps[0]!.step_outcome.min_tier).toBe('economical-cloud');
    expect(fixture.outcome.task_success).toBe(true);
  });

  it('preserves frontier escalation on Terminal-Bench static prefixes', () => {
    const fixtures = loadTwinRouterBenchStaticTrack(loadTrbFixture('terminal-bench-escalation-prefix.json'));
    const fixture = fixtures[0]!;

    expect(fixture.session.steps[0]!.step_outcome.success).toBe(false);
    expect(fixture.session.steps[0]!.step_outcome.min_tier).toBe('frontier-cloud');
    expect(fixture.session.steps[1]!.actual.reason_code).toBe('loop_escalation');
    expect(fixture.outcome.task_success).toBe(false);
  });

  it('scores adapted fixtures through the three-track harness', () => {
    const fixtures = loadTwinRouterBenchStaticTrack(loadTrbFixture('swe-bench-trivial-prefix.json'));
    const harness = scoreFixtureHarness(fixtures[0]!);

    expect(harness.capability.capability_adequacy_rate).toBe(1);
    expect(harness.cost.cumulative_regret_usd).toBeGreaterThanOrEqual(0);
    expect(harness.continuity.step_count).toBe(2);
  });
});
