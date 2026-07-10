#!/usr/bin/env node
/**
 * Counterfactual trace replay — SP-151, GitHub #79 (part 1).
 *
 * Replays multi-turn agent trace fixtures and compares actual routing against
 * counterfactual policies (cheap-at-step-k, hindsight-optimal). Computes
 * cumulative regret vs the cheapest tier that would succeed at each step.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

import { EMBEDDING_DIM } from '../../src/domain/matching/embedding-provider.js';
import {
  MODERNBERT_CLS_DIM,
  MODERNBERT_K4_HEAD_COUNT,
  projectClsToK4Capabilities,
  type K4CapabilityVector,
} from '../../src/domain/matching/modernbert-heads.js';
import {
  projectToRequirements,
  type RequirementVector,
} from '../../src/domain/matching/hydra-matcher.js';
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

/** HyDRA head modes supported by offline K=4 eval smoke (SP-160). */
export type HydraHeadsEvalMode = 'learned_projection' | 'modernbert_k4';

export interface HeadModeQrResult {
  readonly hydra_heads: HydraHeadsEvalMode;
  readonly fixture_count: number;
  readonly mean_quality_retention: number;
  readonly mean_capability_adequacy_rate: number;
}

export interface K4OfflineEvalComparison {
  readonly catalog_id: string;
  readonly checkpoint_date: string;
  readonly fixture_ids: readonly string[];
  readonly learned_projection: HeadModeQrResult;
  readonly modernbert_k4: HeadModeQrResult;
  readonly qr_delta: number;
  readonly k4_retains_baseline: boolean;
}

/** Default fixture subset for K=4 offline smoke (debug + trivial-pin traces). */
export const K4_OFFLINE_EVAL_FIXTURE_SUBSET = [
  'debug-session-cheap-escalation.json',
  'trivial-pin-session.json',
] as const;

function roundRate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 1;
  }
  return roundRate(numerator / denominator);
}

/**
 * Deterministic pseudo-embedding from a fixture prefix hash (no raw prompt text).
 * Used for offline head-mode QR smoke on eval fixtures.
 */
export function hashPrefixToEmbedding(prefixHash: string, dim: number): Float32Array {
  const embedding = new Float32Array(dim);
  const digest = createHash('sha256').update(prefixHash).digest();

  for (let i = 0; i < dim; i++) {
    const byte = digest[i % digest.length] ?? 0;
    embedding[i] = (byte / 127.5) - 1;
  }

  return embedding;
}

/** Derive K=4 capability vector from a fixture step prefix hash. */
export function deriveK4CapabilitiesFromPrefix(prefixHash: string): K4CapabilityVector {
  const cls = hashPrefixToEmbedding(prefixHash, MODERNBERT_CLS_DIM);
  return projectClsToK4Capabilities(cls);
}

/** Map K=4 head output to 3-dim requirements (debugging excluded from shortfall). */
function k4ToRequirements(vector: K4CapabilityVector): RequirementVector {
  return {
    reasoning: vector.reasoning,
    code_gen: vector.code_gen,
    tool_use: vector.tool_use,
  };
}

/** Derive 3-dim requirements for an offline head mode from a prefix hash. */
export function deriveRequirementsFromHeadMode(
  prefixHash: string,
  mode: HydraHeadsEvalMode,
): RequirementVector {
  if (mode === 'modernbert_k4') {
    return k4ToRequirements(deriveK4CapabilitiesFromPrefix(prefixHash));
  }

  const embedding = hashPrefixToEmbedding(prefixHash, EMBEDDING_DIM);
  return projectToRequirements(embedding);
}

/**
 * Map requirement intensity to an implied eval tier for offline smoke scoring.
 * Thresholds align with frozen catalog capability_score bands on eval fixtures.
 */
export function impliedTierFromRequirements(requirements: RequirementVector): EvalTier {
  const intensity = Math.max(requirements.reasoning, requirements.code_gen, requirements.tool_use);
  if (intensity < 0.45) {
    return 'zero-tier';
  }
  if (intensity < 0.78) {
    return 'economical-cloud';
  }
  return 'frontier-cloud';
}

export interface HeadModeFixtureScore {
  readonly fixture_id: string;
  readonly hydra_heads: HydraHeadsEvalMode;
  readonly step_count: number;
  readonly capability_adequate_steps: number;
  readonly capability_adequacy_rate: number;
  readonly quality_retention: number;
  readonly task_success: boolean;
}

/** Score capability / QR for a fixture under a synthetic head mode. */
export function scoreFixtureHeadModeQr(
  fixture: EvalTraceFixture,
  mode: HydraHeadsEvalMode,
): HeadModeFixtureScore {
  let adequateSteps = 0;
  let successfulAdequate = 0;
  let successfulSteps = 0;

  for (const step of fixture.session.steps) {
    const requirements = deriveRequirementsFromHeadMode(step.prefix_hash, mode);
    const impliedTier = impliedTierFromRequirements(requirements);
    const adequate = tierAtLeast(impliedTier, step.step_outcome.min_tier);

    if (adequate) {
      adequateSteps += 1;
    }
    if (step.step_outcome.success) {
      successfulSteps += 1;
      if (adequate) {
        successfulAdequate += 1;
      }
    }
  }

  const stepCount = fixture.session.steps.length;
  const stepQr = safeRate(successfulAdequate, successfulSteps);
  const qualityRetention = fixture.outcome.task_success ? stepQr : 0;

  return {
    fixture_id: fixture.fixture_id,
    hydra_heads: mode,
    step_count: stepCount,
    capability_adequate_steps: adequateSteps,
    capability_adequacy_rate: safeRate(adequateSteps, stepCount),
    quality_retention: qualityRetention,
    task_success: fixture.outcome.task_success,
  };
}

function aggregateHeadModeQr(
  mode: HydraHeadsEvalMode,
  scores: readonly HeadModeFixtureScore[],
): HeadModeQrResult {
  const meanQr =
    scores.length === 0
      ? 0
      : roundRate(scores.reduce((sum, s) => sum + s.quality_retention, 0) / scores.length);
  const meanAdequacy =
    scores.length === 0
      ? 0
      : roundRate(
          scores.reduce((sum, s) => sum + s.capability_adequacy_rate, 0) / scores.length,
        );

  return {
    hydra_heads: mode,
    fixture_count: scores.length,
    mean_quality_retention: meanQr,
    mean_capability_adequacy_rate: meanAdequacy,
  };
}

/** Compare offline QR for modernbert_k4 vs learned_projection on a fixture subset. */
export function compareK4HeadModeOfflineEval(
  fixtures: readonly EvalTraceFixture[],
): K4OfflineEvalComparison {
  if (fixtures.length === 0) {
    return {
      catalog_id: '',
      checkpoint_date: '',
      fixture_ids: [],
      learned_projection: aggregateHeadModeQr('learned_projection', []),
      modernbert_k4: aggregateHeadModeQr('modernbert_k4', []),
      qr_delta: 0,
      k4_retains_baseline: true,
    };
  }

  const learnedScores = fixtures.map((f) => scoreFixtureHeadModeQr(f, 'learned_projection'));
  const k4Scores = fixtures.map((f) => scoreFixtureHeadModeQr(f, 'modernbert_k4'));
  const learned = aggregateHeadModeQr('learned_projection', learnedScores);
  const k4 = aggregateHeadModeQr('modernbert_k4', k4Scores);
  const qrDelta = roundRate(k4.mean_quality_retention - learned.mean_quality_retention);

  return {
    catalog_id: fixtures[0]!.frozen_catalog.catalog_id,
    checkpoint_date: fixtures[0]!.frozen_catalog.checkpoint_date,
    fixture_ids: fixtures.map((f) => f.fixture_id),
    learned_projection: learned,
    modernbert_k4: k4,
    qr_delta: qrDelta,
    k4_retains_baseline: k4.mean_quality_retention >= learned.mean_quality_retention,
  };
}

/** Load and compare K=4 offline eval on a named fixture subset. */
export function runK4OfflineEvalSmoke(
  dirPath: string,
  fixtureNames: readonly string[] = K4_OFFLINE_EVAL_FIXTURE_SUBSET,
): K4OfflineEvalComparison {
  const abs = resolve(dirPath);
  const fixtures = fixtureNames.map((name) => {
    const raw = JSON.parse(readFileSync(join(abs, name), 'utf8')) as unknown;
    return loadEvalTraceFixture(raw);
  });

  return compareK4HeadModeOfflineEval(fixtures);
}

/** Validate K=4 head output shape from fixture-derived smoke vectors. */
export function validateK4SmokeHeadShapes(fixtures: readonly EvalTraceFixture[]): {
  readonly step_count: number;
  readonly all_valid: boolean;
} {
  let stepCount = 0;
  let allValid = true;

  for (const fixture of fixtures) {
    for (const step of fixture.session.steps) {
      stepCount += 1;
      const vector = deriveK4CapabilitiesFromPrefix(step.prefix_hash);
      const array = [
        vector.reasoning,
        vector.code_gen,
        vector.tool_use,
        vector.debugging,
      ];

      if (array.length !== MODERNBERT_K4_HEAD_COUNT) {
        allValid = false;
        continue;
      }

      for (const value of array) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
          allValid = false;
        }
      }
    }
  }

  return { step_count: stepCount, all_valid: allValid };
}

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

  return cheapAtStepIndex === undefined
    ? { fixturesDir }
    : { fixturesDir, cheapAtStepIndex };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const options: ReplayOptions =
    parsed.cheapAtStepIndex === undefined
      ? {}
      : { cheapAtStepIndex: parsed.cheapAtStepIndex };
  const results = replayFixtureDir(parsed.fixturesDir, options);
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
