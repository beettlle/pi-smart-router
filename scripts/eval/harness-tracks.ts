/**
 * Three-track eval harness — SP-152, GitHub #79 (part 2).
 *
 * Scores fixture traces on capability coverage (QR), cost arbitrage (CS / regret),
 * and session continuity (pin breaks + prefix-cache miss proxies). Builds on SP-151
 * counterfactual replay core; metric names align with routing-roadmap §5.
 */

import {
  estimateStepCostUsd,
  lookupCatalogModel,
  tierAtLeast,
  tierRank,
  type EvalTraceFixture,
  type EvalTraceStep,
} from './fixture-schema.js';
import {
  replayCounterfactualTrace,
  type CounterfactualReplayResult,
} from './counterfactual-replay.js';

export const HARNESS_TRACKS_VERSION = '1.0.0' as const;

/** Reason codes that justify an intentional pin break (routing-roadmap pin semantics). */
export const JUSTIFIED_PIN_BREAK_REASON_CODES = [
  'loop_escalation',
  'context_overflow_pin_break',
  'compaction_pin_break',
  'model_override',
  'planning_delegate',
] as const;

export type JustifiedPinBreakReason = (typeof JUSTIFIED_PIN_BREAK_REASON_CODES)[number];

export interface CapabilityStepScore {
  readonly step_index: number;
  readonly actual_tier: EvalTraceStep['actual']['tier'];
  readonly required_tier: EvalTraceStep['step_outcome']['min_tier'];
  readonly capability_adequate: boolean;
  readonly over_routed: boolean;
  readonly under_routed: boolean;
  readonly step_success: boolean;
}

export interface CapabilityTrackResult {
  readonly fixture_id: string;
  readonly step_count: number;
  readonly capability_adequate_steps: number;
  readonly capability_adequacy_rate: number;
  readonly over_routing_steps: number;
  readonly over_routing_rate: number;
  readonly under_routing_steps: number;
  readonly quality_retention: number;
  readonly task_success: boolean;
  readonly steps: readonly CapabilityStepScore[];
}

export interface CostTrackResult {
  readonly fixture_id: string;
  readonly actual_total_cost_usd: number;
  readonly hindsight_optimal_total_cost_usd: number;
  readonly frontier_baseline_cost_usd: number;
  readonly cumulative_regret_usd: number;
  readonly cost_savings_ratio: number;
  readonly cost_savings_vs_frontier: number;
}

export interface ContinuityStepScore {
  readonly step_index: number;
  readonly pin_break: boolean;
  readonly justified_pin_break: boolean;
  readonly cache_miss_proxy: boolean;
  readonly reason_code: string;
  readonly previous_model_id: string | null;
  readonly actual_model_id: string;
}

export interface ContinuityTrackResult {
  readonly fixture_id: string;
  readonly step_count: number;
  readonly pin_break_count: number;
  readonly justified_pin_break_count: number;
  readonly cache_miss_proxy_count: number;
  readonly pin_preserved_transitions: number;
  readonly pin_preserved_rate: number;
  readonly steps: readonly ContinuityStepScore[];
}

export interface FixtureHarnessResult {
  readonly fixture_id: string;
  readonly catalog_id: string;
  readonly checkpoint_date: string;
  readonly capability: CapabilityTrackResult;
  readonly cost: CostTrackResult;
  readonly continuity: ContinuityTrackResult;
}

export interface AggregateCapabilityMetrics {
  readonly mean_capability_adequacy_rate: number;
  readonly mean_quality_retention: number;
  readonly mean_over_routing_rate: number;
  readonly total_under_routing_steps: number;
}

export interface AggregateCostMetrics {
  readonly total_actual_cost_usd: number;
  readonly total_hindsight_cost_usd: number;
  readonly total_cumulative_regret_usd: number;
  readonly mean_cost_savings_ratio: number;
  readonly mean_cost_savings_vs_frontier: number;
}

export interface AggregateContinuityMetrics {
  readonly total_pin_breaks: number;
  readonly total_justified_pin_breaks: number;
  readonly total_cache_miss_proxy: number;
  readonly mean_pin_preserved_rate: number;
}

export interface HarnessAggregateMetrics {
  readonly harness_version: typeof HARNESS_TRACKS_VERSION;
  readonly fixture_count: number;
  readonly catalog_id: string;
  readonly checkpoint_date: string;
  readonly tracks: {
    readonly capability: AggregateCapabilityMetrics;
    readonly cost: AggregateCostMetrics;
    readonly continuity: AggregateContinuityMetrics;
  };
  readonly fixtures: readonly FixtureHarnessResult[];
}

function isJustifiedPinBreak(reasonCode: string): boolean {
  return (JUSTIFIED_PIN_BREAK_REASON_CODES as readonly string[]).includes(reasonCode);
}

function roundRate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 1;
  }
  return roundRate(numerator / denominator);
}

/** Capability track: routing tier vs required capability (min_tier) on each step. */
export function scoreCapabilityTrack(fixture: EvalTraceFixture): CapabilityTrackResult {
  const steps: CapabilityStepScore[] = fixture.session.steps.map((step) => {
    const adequate = tierAtLeast(step.actual.tier, step.step_outcome.min_tier);
    const overRouted = tierRank(step.actual.tier) > tierRank(step.step_outcome.min_tier);
    const underRouted =
      tierRank(step.actual.tier) < tierRank(step.step_outcome.min_tier) && step.step_outcome.success;

    return {
      step_index: step.step_index,
      actual_tier: step.actual.tier,
      required_tier: step.step_outcome.min_tier,
      capability_adequate: adequate,
      over_routed: overRouted,
      under_routed: underRouted,
      step_success: step.step_outcome.success,
    };
  });

  const stepCount = steps.length;
  const adequateSteps = steps.filter((s) => s.capability_adequate).length;
  const overRoutingSteps = steps.filter((s) => s.over_routed).length;
  const underRoutingSteps = steps.filter((s) => s.under_routed).length;
  const successfulAdequate = steps.filter((s) => s.step_success && s.capability_adequate).length;
  const successfulSteps = steps.filter((s) => s.step_success).length;

  const stepQr = safeRate(successfulAdequate, successfulSteps);
  const qualityRetention = fixture.outcome.task_success ? stepQr : 0;

  return {
    fixture_id: fixture.fixture_id,
    step_count: stepCount,
    capability_adequate_steps: adequateSteps,
    capability_adequacy_rate: safeRate(adequateSteps, stepCount),
    over_routing_steps: overRoutingSteps,
    over_routing_rate: safeRate(overRoutingSteps, stepCount),
    under_routing_steps: underRoutingSteps,
    quality_retention: qualityRetention,
    task_success: fixture.outcome.task_success,
    steps,
  };
}

function frontierBaselineCost(fixture: EvalTraceFixture): number {
  const { frozen_catalog: catalog } = fixture;
  let total = 0;

  for (const step of fixture.session.steps) {
    const frontierModels = catalog.models.filter((m) => m.tier === 'frontier-cloud');
    if (frontierModels.length === 0) {
      throw new Error(`No frontier-cloud models in catalog ${catalog.catalog_id}`);
    }
    const frontier = frontierModels.reduce((best, cur) =>
      cur.cost_per_1m_input_usd < best.cost_per_1m_input_usd ? cur : best,
    );
    total += estimateStepCostUsd(catalog, frontier.model_id, step.prefix_token_estimate);
  }

  return total;
}

/** Cost track: cumulative cost vs hindsight-optimal and frontier baseline (CS). */
export function scoreCostTrack(
  fixture: EvalTraceFixture,
  replay?: CounterfactualReplayResult,
): CostTrackResult {
  const replayResult = replay ?? replayCounterfactualTrace(fixture);
  const frontierBaseline = frontierBaselineCost(fixture);
  const actual = replayResult.actual_total_cost_usd;
  const hindsight = replayResult.hindsight_optimal_total_cost_usd;

  const costSavingsRatio = actual > 0 ? roundRate(hindsight / actual) : 1;
  const costSavingsVsFrontier =
    frontierBaseline > 0 ? roundRate((frontierBaseline - actual) / frontierBaseline) : 0;

  return {
    fixture_id: fixture.fixture_id,
    actual_total_cost_usd: roundUsd(actual),
    hindsight_optimal_total_cost_usd: roundUsd(hindsight),
    frontier_baseline_cost_usd: roundUsd(frontierBaseline),
    cumulative_regret_usd: roundUsd(replayResult.cumulative_regret_usd),
    cost_savings_ratio: costSavingsRatio,
    cost_savings_vs_frontier: costSavingsVsFrontier,
  };
}

/** Continuity track: pin breaks and prefix-cache miss proxy metrics. */
export function scoreContinuityTrack(fixture: EvalTraceFixture): ContinuityTrackResult {
  const sessionSteps = fixture.session.steps;
  const continuitySteps: ContinuityStepScore[] = sessionSteps.map((step, index) => {
    const previous = index > 0 ? sessionSteps[index - 1]! : null;
    const previousModelId = previous?.actual.model_id ?? null;
    const pinBreak = previous !== null && step.actual.model_id !== previous.actual.model_id;
    const justified = pinBreak && isJustifiedPinBreak(step.actual.reason_code);
    const cacheMissProxy = pinBreak;

    return {
      step_index: step.step_index,
      pin_break: pinBreak,
      justified_pin_break: justified,
      cache_miss_proxy: cacheMissProxy,
      reason_code: step.actual.reason_code,
      previous_model_id: previousModelId,
      actual_model_id: step.actual.model_id,
    };
  });

  const transitionCount = Math.max(sessionSteps.length - 1, 0);
  const pinBreakCount = continuitySteps.filter((s) => s.pin_break).length;
  const justifiedCount = continuitySteps.filter((s) => s.justified_pin_break).length;
  const cacheMissCount = continuitySteps.filter((s) => s.cache_miss_proxy).length;
  const pinPreserved = transitionCount - pinBreakCount;

  return {
    fixture_id: fixture.fixture_id,
    step_count: sessionSteps.length,
    pin_break_count: pinBreakCount,
    justified_pin_break_count: justifiedCount,
    cache_miss_proxy_count: cacheMissCount,
    pin_preserved_transitions: pinPreserved,
    pin_preserved_rate: safeRate(pinPreserved, transitionCount),
    steps: continuitySteps,
  };
}

/** Score all three tracks for a single fixture. */
export function scoreFixtureHarness(fixture: EvalTraceFixture): FixtureHarnessResult {
  const replay = replayCounterfactualTrace(fixture);

  return {
    fixture_id: fixture.fixture_id,
    catalog_id: fixture.frozen_catalog.catalog_id,
    checkpoint_date: fixture.frozen_catalog.checkpoint_date,
    capability: scoreCapabilityTrack(fixture),
    cost: scoreCostTrack(fixture, replay),
    continuity: scoreContinuityTrack(fixture),
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return roundRate(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** Aggregate harness metrics across multiple fixtures. */
export function aggregateHarnessMetrics(
  results: readonly FixtureHarnessResult[],
): HarnessAggregateMetrics {
  if (results.length === 0) {
    return {
      harness_version: HARNESS_TRACKS_VERSION,
      fixture_count: 0,
      catalog_id: '',
      checkpoint_date: '',
      tracks: {
        capability: {
          mean_capability_adequacy_rate: 0,
          mean_quality_retention: 0,
          mean_over_routing_rate: 0,
          total_under_routing_steps: 0,
        },
        cost: {
          total_actual_cost_usd: 0,
          total_hindsight_cost_usd: 0,
          total_cumulative_regret_usd: 0,
          mean_cost_savings_ratio: 0,
          mean_cost_savings_vs_frontier: 0,
        },
        continuity: {
          total_pin_breaks: 0,
          total_justified_pin_breaks: 0,
          total_cache_miss_proxy: 0,
          mean_pin_preserved_rate: 0,
        },
      },
      fixtures: [],
    };
  }

  const catalogId = results[0]!.catalog_id;
  const checkpointDate = results[0]!.checkpoint_date;

  let totalActual = 0;
  let totalHindsight = 0;
  let totalRegret = 0;
  let totalPinBreaks = 0;
  let totalJustified = 0;
  let totalCacheMiss = 0;
  let totalUnderRouting = 0;

  for (const result of results) {
    totalActual += result.cost.actual_total_cost_usd;
    totalHindsight += result.cost.hindsight_optimal_total_cost_usd;
    totalRegret += result.cost.cumulative_regret_usd;
    totalPinBreaks += result.continuity.pin_break_count;
    totalJustified += result.continuity.justified_pin_break_count;
    totalCacheMiss += result.continuity.cache_miss_proxy_count;
    totalUnderRouting += result.capability.under_routing_steps;
  }

  return {
    harness_version: HARNESS_TRACKS_VERSION,
    fixture_count: results.length,
    catalog_id: catalogId,
    checkpoint_date: checkpointDate,
    tracks: {
      capability: {
        mean_capability_adequacy_rate: mean(results.map((r) => r.capability.capability_adequacy_rate)),
        mean_quality_retention: mean(results.map((r) => r.capability.quality_retention)),
        mean_over_routing_rate: mean(results.map((r) => r.capability.over_routing_rate)),
        total_under_routing_steps: totalUnderRouting,
      },
      cost: {
        total_actual_cost_usd: roundUsd(totalActual),
        total_hindsight_cost_usd: roundUsd(totalHindsight),
        total_cumulative_regret_usd: roundUsd(totalRegret),
        mean_cost_savings_ratio: mean(results.map((r) => r.cost.cost_savings_ratio)),
        mean_cost_savings_vs_frontier: mean(results.map((r) => r.cost.cost_savings_vs_frontier)),
      },
      continuity: {
        total_pin_breaks: totalPinBreaks,
        total_justified_pin_breaks: totalJustified,
        total_cache_miss_proxy: totalCacheMiss,
        mean_pin_preserved_rate: mean(results.map((r) => r.continuity.pin_preserved_rate)),
      },
    },
    fixtures: results,
  };
}

/** Summarize fixture results for compact JSON output (omits per-step detail). */
export function summarizeFixtureHarness(result: FixtureHarnessResult): Record<string, unknown> {
  return {
    fixture_id: result.fixture_id,
    catalog_id: result.catalog_id,
    checkpoint_date: result.checkpoint_date,
    capability: {
      capability_adequacy_rate: result.capability.capability_adequacy_rate,
      quality_retention: result.capability.quality_retention,
      over_routing_rate: result.capability.over_routing_rate,
      under_routing_steps: result.capability.under_routing_steps,
      task_success: result.capability.task_success,
    },
    cost: {
      actual_total_cost_usd: result.cost.actual_total_cost_usd,
      hindsight_optimal_total_cost_usd: result.cost.hindsight_optimal_total_cost_usd,
      cumulative_regret_usd: result.cost.cumulative_regret_usd,
      cost_savings_ratio: result.cost.cost_savings_ratio,
      cost_savings_vs_frontier: result.cost.cost_savings_vs_frontier,
    },
    continuity: {
      pin_break_count: result.continuity.pin_break_count,
      justified_pin_break_count: result.continuity.justified_pin_break_count,
      cache_miss_proxy_count: result.continuity.cache_miss_proxy_count,
      pin_preserved_rate: result.continuity.pin_preserved_rate,
    },
  };
}

/** Compact aggregate JSON suitable for CI smoke and local comparison. */
export function formatHarnessMetricsJson(
  aggregate: HarnessAggregateMetrics,
  options: { includeFixtures?: boolean } = {},
): Record<string, unknown> {
  const includeFixtures = options.includeFixtures ?? true;

  return {
    harness_version: aggregate.harness_version,
    fixture_count: aggregate.fixture_count,
    catalog_id: aggregate.catalog_id,
    checkpoint_date: aggregate.checkpoint_date,
    tracks: aggregate.tracks,
    fixtures: includeFixtures
      ? aggregate.fixtures.map((f) => summarizeFixtureHarness(f))
      : undefined,
  };
}

/** Validate catalog model references for capability scoring helpers. */
export function resolveModelCapabilityScore(
  fixture: EvalTraceFixture,
  modelId: string,
): number | undefined {
  const model = lookupCatalogModel(fixture.frozen_catalog, modelId);
  return model.capability_score;
}
