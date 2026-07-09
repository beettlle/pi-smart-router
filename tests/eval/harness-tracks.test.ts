import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadEvalTraceFixture } from '../../scripts/eval/fixture-schema.js';
import {
  aggregateHarnessMetrics,
  formatHarnessMetricsJson,
  HARNESS_TRACKS_VERSION,
  scoreCapabilityTrack,
  scoreContinuityTrack,
  scoreCostTrack,
  scoreFixtureHarness,
} from '../../scripts/eval/harness-tracks.js';
import { runHarnessOnDir } from '../../scripts/eval/run-harness.js';

const FIXTURES_DIR = join('tests', 'eval', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

describe('capability track (SP-152)', () => {
  it('scores routing tier vs required min_tier on fixtures', () => {
    const fixture = loadEvalTraceFixture(loadFixture('trivial-pin-session.json'));
    const result = scoreCapabilityTrack(fixture);

    expect(result.fixture_id).toBe('trivial-pin-session');
    expect(result.step_count).toBe(2);
    expect(result.capability_adequate_steps).toBe(2);
    expect(result.capability_adequacy_rate).toBe(1);
    expect(result.over_routing_steps).toBe(1);
    expect(result.over_routing_rate).toBe(0.5);
    expect(result.under_routing_steps).toBe(0);
    expect(result.task_success).toBe(true);
    expect(result.quality_retention).toBe(1);
  });

  it('marks adequate capability on debug escalation session', () => {
    const fixture = loadEvalTraceFixture(loadFixture('debug-session-cheap-escalation.json'));
    const result = scoreCapabilityTrack(fixture);

    expect(result.capability_adequacy_rate).toBe(1);
    expect(result.over_routing_steps).toBe(0);
    expect(result.quality_retention).toBe(1);
  });
});

describe('cost track (SP-152)', () => {
  it('computes cumulative regret vs hindsight-optimal routing', () => {
    const fixture = loadEvalTraceFixture(loadFixture('debug-session-cheap-escalation.json'));
    const result = scoreCostTrack(fixture);

    expect(result.cumulative_regret_usd).toBeCloseTo(
      result.actual_total_cost_usd - result.hindsight_optimal_total_cost_usd,
      8,
    );
    expect(result.cost_savings_ratio).toBeGreaterThan(0);
    expect(result.cost_savings_vs_frontier).toBeGreaterThan(0);
  });

  it('reports positive regret on over-routed trivial-pin session', () => {
    const fixture = loadEvalTraceFixture(loadFixture('trivial-pin-session.json'));
    const result = scoreCostTrack(fixture);

    expect(result.cumulative_regret_usd).toBeGreaterThan(0);
    expect(result.cost_savings_ratio).toBeLessThan(1);
  });
});

describe('continuity track (SP-152)', () => {
  it('detects pin breaks and cache-miss proxies on model change', () => {
    const fixture = loadEvalTraceFixture(loadFixture('debug-session-cheap-escalation.json'));
    const result = scoreContinuityTrack(fixture);

    expect(result.pin_break_count).toBe(1);
    expect(result.justified_pin_break_count).toBe(1);
    expect(result.cache_miss_proxy_count).toBe(1);
    expect(result.pin_preserved_transitions).toBe(1);
    expect(result.pin_preserved_rate).toBeCloseTo(0.5, 6);

    const step2 = result.steps[2]!;
    expect(step2.pin_break).toBe(true);
    expect(step2.justified_pin_break).toBe(true);
    expect(step2.cache_miss_proxy).toBe(true);
    expect(step2.reason_code).toBe('loop_escalation');
  });

  it('reports full pin preservation on trivial-pin session', () => {
    const fixture = loadEvalTraceFixture(loadFixture('trivial-pin-session.json'));
    const result = scoreContinuityTrack(fixture);

    expect(result.pin_break_count).toBe(0);
    expect(result.cache_miss_proxy_count).toBe(0);
    expect(result.pin_preserved_rate).toBe(1);
  });
});

describe('harness runner (SP-152)', () => {
  it('scores all three tracks per fixture', () => {
    const fixture = loadEvalTraceFixture(loadFixture('trivial-pin-session.json'));
    const result = scoreFixtureHarness(fixture);

    expect(result.capability.fixture_id).toBe('trivial-pin-session');
    expect(result.cost.fixture_id).toBe('trivial-pin-session');
    expect(result.continuity.fixture_id).toBe('trivial-pin-session');
    expect(result.catalog_id).toBe('pi-smart-router-v0.5.0-eval');
    expect(result.checkpoint_date).toBe('2026-07-01');
  });

  it('aggregates metrics across fixture directory', () => {
    const aggregate = runHarnessOnDir(FIXTURES_DIR);

    expect(aggregate.harness_version).toBe(HARNESS_TRACKS_VERSION);
    expect(aggregate.fixture_count).toBeGreaterThanOrEqual(2);
    expect(aggregate.catalog_id).toBe('pi-smart-router-v0.5.0-eval');
    expect(aggregate.tracks.capability.mean_capability_adequacy_rate).toBeGreaterThan(0);
    expect(aggregate.tracks.cost.total_cumulative_regret_usd).toBeGreaterThanOrEqual(0);
    expect(aggregate.tracks.continuity.total_pin_breaks).toBeGreaterThanOrEqual(1);
  });

  it('formats aggregate metrics JSON with track summaries', () => {
    const aggregate = aggregateHarnessMetrics([
      scoreFixtureHarness(loadEvalTraceFixture(loadFixture('trivial-pin-session.json'))),
    ]);
    const json = formatHarnessMetricsJson(aggregate);

    expect(json.harness_version).toBe(HARNESS_TRACKS_VERSION);
    expect(json.tracks).toBeDefined();
    const tracks = json.tracks as Record<string, unknown>;
    expect(tracks.capability).toBeDefined();
    expect(tracks.cost).toBeDefined();
    expect(tracks.continuity).toBeDefined();
  });
});
