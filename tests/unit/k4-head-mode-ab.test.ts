import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadStaticTrackFixtures,
  loadTraceFixturesFromDir,
  runK4HeadModeAbEval,
  scoreHeadModeTop1,
} from '../../scripts/eval/counterfactual-replay.js';
import { MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD } from '../../src/domain/matching/modernbert-heads.js';

const FIXTURES_DIR = join('tests', 'eval', 'fixtures');
const TRB_CI_SUBSET = join('tests', 'eval', 'corpus', 'twinrouterbench', 'ci-subset.json');

describe('K=4 head-mode A/B beyond fixture QR (SP-219)', () => {
  it('loads every top-level trace fixture from the eval fixtures dir', () => {
    const fixtures = loadTraceFixturesFromDir(FIXTURES_DIR);

    expect(fixtures.map((f) => f.fixture_id).sort()).toEqual([
      'debug-session-cheap-escalation',
      'trivial-pin-session',
    ]);
  });

  it('adapts the TwinRouterBench ci-subset static track into trace fixtures', () => {
    const fixtures = loadStaticTrackFixtures(TRB_CI_SUBSET);
    const stepCount = fixtures.reduce((sum, f) => sum + f.session.steps.length, 0);

    expect(fixtures.length).toBeGreaterThan(1);
    expect(stepCount).toBe(148);
    for (const fixture of fixtures) {
      expect(fixture.fixture_id).toMatch(/^trb-static-/);
    }
  });

  it('scores per-step Top-1 / shortfall / cost stats with consistent accounting', () => {
    const fixtures = loadTraceFixturesFromDir(FIXTURES_DIR);
    const stats = scoreHeadModeTop1(fixtures, 'learned_projection');

    expect(stats.step_count).toBe(5);
    expect(stats.top1_matches + stats.shortfall_steps + stats.overroute_steps).toBe(
      stats.step_count,
    );
    expect(stats.top1_error_rate).toBeGreaterThanOrEqual(0);
    expect(stats.top1_error_rate).toBeLessThanOrEqual(1);
    expect(stats.top1_error_rate).toBeCloseTo(1 - stats.top1_matches / stats.step_count, 6);
    expect(stats.implied_total_cost_usd).toBeGreaterThan(0);
    expect(stats.hindsight_optimal_total_cost_usd).toBeGreaterThan(0);
    expect(stats.cost_regret_usd).toBeCloseTo(
      stats.implied_total_cost_usd - stats.hindsight_optimal_total_cost_usd,
      6,
    );
  });

  it('returns zeroed stats for empty fixture input', () => {
    const stats = scoreHeadModeTop1([], 'modernbert_k4');

    expect(stats.step_count).toBe(0);
    expect(stats.top1_error_rate).toBe(0);
    expect(stats.shortfall_rate).toBe(1); // safeRate convention: 0/0 → 1
    expect(stats.cost_regret_usd).toBe(0);
  });

  it('runs the full A/B report on the TwinRouterBench ci-subset', () => {
    const fixtures = loadStaticTrackFixtures(TRB_CI_SUBSET);
    const report = runK4HeadModeAbEval(fixtures, 'static-track:test');

    expect(report.source).toBe('static-track:test');
    expect(report.step_count).toBe(148);
    expect(report.fixture_count).toBe(fixtures.length);
    expect(report.qr_comparison.fixture_ids).toHaveLength(fixtures.length);
    expect(report.learned_projection.step_count).toBe(148);
    expect(report.modernbert_k4.step_count).toBe(148);
    expect(report.head_mode_tier_agreement_rate).toBeGreaterThanOrEqual(0);
    expect(report.head_mode_tier_agreement_rate).toBeLessThanOrEqual(1);
    // No trained config/modernbert-k4-heads.json in this repo state (SP-218 Partial).
    expect(report.k4_uses_placeholder_heads).toBe(true);
    // The enablement gate constant the artifact compares against.
    expect(MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD).toBeCloseTo(0.1, 6);
  });

  it('handles empty fixture input without throwing', () => {
    const report = runK4HeadModeAbEval([], 'empty');

    expect(report.fixture_count).toBe(0);
    expect(report.step_count).toBe(0);
    expect(report.qr_comparison.k4_retains_baseline).toBe(true);
    expect(report.head_mode_tier_agreement_rate).toBe(1);
  });
});
