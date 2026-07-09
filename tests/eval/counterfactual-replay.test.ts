import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadEvalTraceFixture,
  parseEvalTraceFixture,
  cheapestModelForTier,
  EVAL_FIXTURE_SCHEMA_VERSION,
} from '../../scripts/eval/fixture-schema.js';
import {
  replayCounterfactualTrace,
  replayFixtureDir,
  replayFixtureFile,
  summarizeReplayResults,
} from '../../scripts/eval/counterfactual-replay.js';

const FIXTURES_DIR = join('tests', 'eval', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

describe('eval fixture schema (SP-151)', () => {
  it('parses sample fixtures with frozen catalog metadata', () => {
    const fixture = loadEvalTraceFixture(loadFixture('debug-session-cheap-escalation.json'));
    expect(fixture.schema_version).toBe(EVAL_FIXTURE_SCHEMA_VERSION);
    expect(fixture.frozen_catalog.catalog_id).toBe('pi-smart-router-v0.5.0-eval');
    expect(fixture.frozen_catalog.checkpoint_date).toBe('2026-07-01');
    expect(fixture.frozen_catalog.models).toHaveLength(3);
    expect(fixture.session.steps).toHaveLength(3);
  });

  it('rejects invalid checkpoint_date format', () => {
    const raw = loadFixture('debug-session-cheap-escalation.json') as Record<string, unknown>;
    const catalog = raw.frozen_catalog as Record<string, unknown>;
    expect(() =>
      parseEvalTraceFixture({
        ...raw,
        frozen_catalog: { ...catalog, checkpoint_date: '2026/07/01' },
      }),
    ).toThrow(/Invalid eval trace fixture/);
  });

  it('validates min_model_id tier matches step_outcome.min_tier', () => {
    const raw = structuredClone(loadFixture('trivial-pin-session.json')) as Record<string, unknown>;
    const session = raw.session as Record<string, unknown>;
    const steps = session.steps as Record<string, unknown>[];
    const step0 = steps[0] as Record<string, unknown>;
    const outcome = step0.step_outcome as Record<string, unknown>;
    outcome.min_model_id = 'claude-sonnet-4';

    expect(() => loadEvalTraceFixture(raw)).toThrow(/min_model_id tier mismatch/);
  });

  it('documents cheapest model per tier from frozen catalog', () => {
    const fixture = loadEvalTraceFixture(loadFixture('trivial-pin-session.json'));
    const zero = cheapestModelForTier(fixture.frozen_catalog, 'zero-tier');
    expect(zero.model_id).toBe('ollama/llama3.2:3b');
    expect(zero.cost_per_1m_input_usd).toBe(0);
  });
});

describe('counterfactual replay (SP-151)', () => {
  it('computes cumulative regret vs hindsight-optimal routing', () => {
    const fixture = loadEvalTraceFixture(loadFixture('debug-session-cheap-escalation.json'));
    const result = replayCounterfactualTrace(fixture);

    expect(result.fixture_id).toBe('debug-session-cheap-escalation');
    expect(result.catalog_id).toBe('pi-smart-router-v0.5.0-eval');
    expect(result.checkpoint_date).toBe('2026-07-01');
    expect(result.step_count).toBe(3);
    expect(result.task_success).toBe(true);

    const expectedActual = fixture.session.steps.reduce((sum, s) => sum + s.actual.cost_usd, 0);
    expect(result.actual_total_cost_usd).toBeCloseTo(expectedActual, 8);
    expect(result.cumulative_regret_usd).toBeCloseTo(
      result.actual_total_cost_usd - result.hindsight_optimal_total_cost_usd,
      8,
    );

    const step2 = result.steps[2]!;
    expect(step2.actual_tier).toBe('frontier-cloud');
    expect(step2.hindsight_optimal_tier).toBe('frontier-cloud');
    expect(step2.step_regret_usd).toBeCloseTo(0, 8);
    expect(step2.cheap_at_step_k.would_succeed).toBe(false);
    expect(step2.cheap_at_step_k.requires_escalation).toBe(true);
  });

  it('flags over-routing regret on trivial-pin session step 0', () => {
    const fixture = loadEvalTraceFixture(loadFixture('trivial-pin-session.json'));
    const result = replayCounterfactualTrace(fixture);

    const step0 = result.steps[0]!;
    expect(step0.hindsight_optimal_tier).toBe('zero-tier');
    expect(step0.actual_tier).toBe('economical-cloud');
    expect(step0.step_regret_usd).toBeGreaterThan(0);
    expect(result.cumulative_regret_usd).toBeGreaterThan(0);
  });

  it('supports cheap-at-step-k override for a single step index', () => {
    const fixture = loadEvalTraceFixture(loadFixture('debug-session-cheap-escalation.json'));
    const baseline = replayCounterfactualTrace(fixture);
    const cheapAt2 = replayCounterfactualTrace(fixture, { cheapAtStepIndex: 2 });

    expect(cheapAt2.cheap_at_k_failed_steps).toBe(1);
    expect(cheapAt2.cheap_at_k_total_cost_usd).toBeLessThan(baseline.actual_total_cost_usd);
  });

  it('counts verified tool progression steps', () => {
    const fixture = loadEvalTraceFixture(loadFixture('debug-session-cheap-escalation.json'));
    const result = replayCounterfactualTrace(fixture);
    expect(result.verified_tool_steps).toBe(3);
  });

  it('replays all fixtures in directory and summarizes', () => {
    const results = replayFixtureDir(FIXTURES_DIR);
    expect(results.length).toBeGreaterThanOrEqual(2);

    const summary = summarizeReplayResults(results);
    expect(summary.fixture_count).toBe(results.length);
    expect(summary.total_cumulative_regret_usd).toBeGreaterThanOrEqual(0);
  });

  it('loads fixture file from disk', () => {
    const result = replayFixtureFile(join(FIXTURES_DIR, 'trivial-pin-session.json'));
    expect(result.fixture_id).toBe('trivial-pin-session');
  });
});
