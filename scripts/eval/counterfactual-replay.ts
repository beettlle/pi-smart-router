#!/usr/bin/env node
/**
 * Counterfactual trace replay — SP-151, GitHub #79 (part 1).
 *
 * Replays multi-turn agent trace fixtures and compares actual routing against
 * counterfactual policies (cheap-at-step-k, hindsight-optimal). Computes
 * cumulative regret vs the cheapest tier that would succeed at each step.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  cheapestModelForTier,
  estimateStepCostUsd,
  loadEvalTraceFixture,
  tierAtLeast,
  type EvalCounterfactual,
  type EvalTier,
  type EvalTraceFixture,
  type EvalTraceStep,
  type FrozenCatalog,
} from './fixture-schema.js';

export interface StepReplayResult {
  readonly step_index: number;
  readonly prefix_hash: string;
  readonly actual_tier: EvalTier;
  readonly actual_cost_usd: number;
  readonly hindsight_optimal_tier: EvalTier;
  readonly hindsight_optimal_cost_usd: number;
  readonly step_regret_usd: number;
  readonly verified_tool_progression: boolean;
  readonly cheap_at_step_k: {
    readonly tier: EvalTier;
    readonly model_id: string;
    readonly cost_usd: number;
    readonly would_succeed: boolean;
    readonly requires_escalation: boolean;
  };
}

export interface CounterfactualReplayResult {
  readonly fixture_id: string;
  readonly catalog_id: string;
  readonly checkpoint_date: string;
  readonly step_count: number;
  readonly task_success: boolean;
  readonly actual_total_cost_usd: number;
  readonly hindsight_optimal_total_cost_usd: number;
  readonly cumulative_regret_usd: number;
  readonly cheap_at_k_total_cost_usd: number;
  readonly cheap_at_k_failed_steps: number;
  readonly verified_tool_steps: number;
  readonly steps: readonly StepReplayResult[];
}

export interface ReplayOptions {
  /** Step index for cheap-at-k counterfactual; defaults to each step's own index. */
  readonly cheapAtStepIndex?: number;
}

function resolveCheapCounterfactual(
  step: EvalTraceStep,
  catalog: FrozenCatalog,
): EvalCounterfactual {
  const explicit = step.counterfactuals?.find((c) => c.scenario === 'cheap_at_step_k');
  if (explicit) {
    return explicit;
  }

  const cheapTier: EvalTier =
    step.step_outcome.min_tier === 'frontier-cloud' ? 'economical-cloud' : 'zero-tier';
  const cheapModel = cheapestModelForTier(catalog, cheapTier);
  const costUsd = estimateStepCostUsd(catalog, cheapModel.model_id, step.prefix_token_estimate);
  const wouldSucceed = tierAtLeast(cheapTier, step.step_outcome.min_tier);

  return {
    scenario: 'cheap_at_step_k',
    tier: cheapTier,
    model_id: cheapModel.model_id,
    would_succeed: wouldSucceed,
    cost_usd: costUsd,
  };
}

function hindsightOptimalCost(step: EvalTraceStep, catalog: FrozenCatalog): number {
  return estimateStepCostUsd(
    catalog,
    step.step_outcome.min_model_id,
    step.prefix_token_estimate,
  );
}

/** Replay a single fixture and compute step-level + cumulative metrics. */
export function replayCounterfactualTrace(
  fixture: EvalTraceFixture,
  options: ReplayOptions = {},
): CounterfactualReplayResult {
  const { frozen_catalog: catalog, session, outcome } = fixture;
  const cheapAtK = options.cheapAtStepIndex;

  let actualTotal = 0;
  let hindsightTotal = 0;
  let cheapAtKTotal = 0;
  let cheapAtKFailed = 0;
  let verifiedToolSteps = 0;

  const steps: StepReplayResult[] = session.steps.map((step) => {
    const hindsightCost = hindsightOptimalCost(step, catalog);
    const stepRegret = step.actual.cost_usd - hindsightCost;

    actualTotal += step.actual.cost_usd;
    hindsightTotal += hindsightCost;

    const cheap = resolveCheapCounterfactual(step, catalog);
    const applyCheapAtK = cheapAtK === undefined || step.step_index === cheapAtK;
    if (applyCheapAtK) {
      cheapAtKTotal += cheap.cost_usd;
      if (!cheap.would_succeed) {
        cheapAtKFailed += 1;
      }
    } else {
      cheapAtKTotal += step.actual.cost_usd;
    }

    if (step.step_outcome.verified_tool_progression) {
      verifiedToolSteps += 1;
    }

    return {
      step_index: step.step_index,
      prefix_hash: step.prefix_hash,
      actual_tier: step.actual.tier,
      actual_cost_usd: step.actual.cost_usd,
      hindsight_optimal_tier: step.step_outcome.min_tier,
      hindsight_optimal_cost_usd: hindsightCost,
      step_regret_usd: stepRegret,
      verified_tool_progression: step.step_outcome.verified_tool_progression,
      cheap_at_step_k: {
        tier: cheap.tier,
        model_id: cheap.model_id,
        cost_usd: cheap.cost_usd,
        would_succeed: cheap.would_succeed,
        requires_escalation: !cheap.would_succeed,
      },
    };
  });

  return {
    fixture_id: fixture.fixture_id,
    catalog_id: catalog.catalog_id,
    checkpoint_date: catalog.checkpoint_date,
    step_count: session.steps.length,
    task_success: outcome.task_success,
    actual_total_cost_usd: actualTotal,
    hindsight_optimal_total_cost_usd: hindsightTotal,
    cumulative_regret_usd: actualTotal - hindsightTotal,
    cheap_at_k_total_cost_usd: cheapAtKTotal,
    cheap_at_k_failed_steps: cheapAtKFailed,
    verified_tool_steps: verifiedToolSteps,
    steps,
  };
}

/** Load fixture JSON from disk and replay. */
export function replayFixtureFile(fixturePath: string, options?: ReplayOptions): CounterfactualReplayResult {
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
  const fixture = loadEvalTraceFixture(raw);
  return replayCounterfactualTrace(fixture, options);
}

/** Replay every `.json` fixture in a directory. */
export function replayFixtureDir(
  dirPath: string,
  options?: ReplayOptions,
): readonly CounterfactualReplayResult[] {
  const abs = resolve(dirPath);
  const files = readdirSync(abs)
    .filter((name) => name.endsWith('.json'))
    .sort();

  return files.map((name) => replayFixtureFile(join(abs, name), options));
}

export interface ReplaySummary {
  readonly fixture_count: number;
  readonly total_cumulative_regret_usd: number;
  readonly total_actual_cost_usd: number;
  readonly total_hindsight_cost_usd: number;
  readonly fixtures: readonly CounterfactualReplayResult[];
}

/** Aggregate replay results across multiple fixtures. */
export function summarizeReplayResults(
  results: readonly CounterfactualReplayResult[],
): ReplaySummary {
  let totalRegret = 0;
  let totalActual = 0;
  let totalHindsight = 0;

  for (const result of results) {
    totalRegret += result.cumulative_regret_usd;
    totalActual += result.actual_total_cost_usd;
    totalHindsight += result.hindsight_optimal_total_cost_usd;
  }

  return {
    fixture_count: results.length,
    total_cumulative_regret_usd: totalRegret,
    total_actual_cost_usd: totalActual,
    total_hindsight_cost_usd: totalHindsight,
    fixtures: results,
  };
}

function defaultFixturesDir(): string {
  return resolve('tests/eval/fixtures');
}

function printSummary(summary: ReplaySummary): void {
  console.log(
    JSON.stringify(
      {
        fixture_count: summary.fixture_count,
        total_cumulative_regret_usd: roundUsd(summary.total_cumulative_regret_usd),
        total_actual_cost_usd: roundUsd(summary.total_actual_cost_usd),
        total_hindsight_cost_usd: roundUsd(summary.total_hindsight_cost_usd),
        fixtures: summary.fixtures.map((f) => ({
          fixture_id: f.fixture_id,
          catalog_id: f.catalog_id,
          checkpoint_date: f.checkpoint_date,
          cumulative_regret_usd: roundUsd(f.cumulative_regret_usd),
          actual_total_cost_usd: roundUsd(f.actual_total_cost_usd),
          cheap_at_k_failed_steps: f.cheap_at_k_failed_steps,
          verified_tool_steps: f.verified_tool_steps,
        })),
      },
      null,
      2,
    ),
  );
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function parseArgs(argv: readonly string[]): { fixturesDir: string; cheapAtStepIndex?: number } {
  let fixturesDir = defaultFixturesDir();
  let cheapAtStepIndex: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixtures' && argv[i + 1]) {
      fixturesDir = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--cheap-at-step' && argv[i + 1]) {
      cheapAtStepIndex = Number.parseInt(argv[i + 1]!, 10);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: routing:eval-replay [--fixtures DIR] [--cheap-at-step N]

Replays eval trace fixtures and prints cumulative regret vs hindsight-optimal routing.
Frozen catalog metadata (catalog_id, checkpoint_date) is echoed for reproducibility.`);
      process.exit(0);
    }
  }

  return { fixturesDir, cheapAtStepIndex };
}

async function main(): Promise<void> {
  const { fixturesDir, cheapAtStepIndex } = parseArgs(process.argv.slice(2));
  const results = replayFixtureDir(fixturesDir, { cheapAtStepIndex });
  const summary = summarizeReplayResults(results);
  printSummary(summary);
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
  process.argv[1]?.endsWith('counterfactual-replay.ts');

if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
