#!/usr/bin/env node
/**
 * Counterfactual trace replay — SP-151, GitHub #79 (part 1).
 *
 * Replays multi-turn agent trace fixtures and compares actual routing against
 * counterfactual policies (cheap-at-step-k, hindsight-optimal). Computes
 * cumulative regret vs the cheapest tier that would succeed at each step.
 *
 * SP-219 (#114): `--k4-ab` extends the SP-160 fixture QR smoke into a fuller
 * offline A/B — per-step Top-1 / shortfall / cost-regret stats for
 * `learned_projection` vs `modernbert_k4` on trace fixtures and TwinRouterBench
 * static tracks (--corpus). K=4 uses placeholder heads unless
 * config/modernbert-k4-heads.json is present (flagged in output).
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

import { EMBEDDING_DIM } from '../../src/domain/matching/embedding-provider.js';
import {
  MODERNBERT_CLS_DIM,
  MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD,
  MODERNBERT_K4_HEAD_COUNT,
  loadModernBertK4HeadWeights,
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
  tierRank,
  type EvalCounterfactual,
  type EvalTier,
  type EvalTraceFixture,
  type EvalTraceStep,
  type FrozenCatalog,
} from './fixture-schema.js';
import {
  adaptTwinRouterBenchStaticTrack,
  isTwinRouterBenchStaticTrack,
  parseTwinRouterBenchStaticTrack,
} from './twinrouterbench-adapter.js';

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

export interface HeadModeTop1Stats {
  readonly hydra_heads: HydraHeadsEvalMode;
  readonly step_count: number;
  /** Steps where the head-mode implied tier exactly equals the verified min tier. */
  readonly top1_matches: number;
  /** 1 - top1 match rate; proxy for SP-115 Top-1 error vs the 0.1 enablement gate. */
  readonly top1_error_rate: number;
  /** Under-routes: implied tier below the verified min tier (would shortfall). */
  readonly shortfall_steps: number;
  readonly shortfall_rate: number;
  /** Over-routes: implied tier above the verified min tier. */
  readonly overroute_steps: number;
  readonly overroute_rate: number;
  /** Cost if every step were routed at the head-mode implied tier (cheapest model). */
  readonly implied_total_cost_usd: number;
  readonly hindsight_optimal_total_cost_usd: number;
  readonly cost_regret_usd: number;
}

export interface K4HeadModeAbReport {
  readonly source: string;
  readonly fixture_count: number;
  readonly step_count: number;
  readonly qr_comparison: K4OfflineEvalComparison;
  readonly learned_projection: HeadModeTop1Stats;
  readonly modernbert_k4: HeadModeTop1Stats;
  /** Share of steps where both head modes imply the same tier (routing-delta proxy). */
  readonly head_mode_tier_agreement_rate: number;
  /** True when the K=4 side ran with placeholder heads (no trained artifact). */
  readonly k4_uses_placeholder_heads: boolean;
}

/**
 * Per-step Top-1 / shortfall / cost scoring for one head mode against verified
 * fixture outcomes — the "beyond fixture QR" half of the SP-219 offline A/B.
 */
export function scoreHeadModeTop1(
  fixtures: readonly EvalTraceFixture[],
  mode: HydraHeadsEvalMode,
): HeadModeTop1Stats {
  let stepCount = 0;
  let matches = 0;
  let shortfall = 0;
  let overroute = 0;
  let impliedCost = 0;
  let hindsightCost = 0;

  for (const fixture of fixtures) {
    const catalog = fixture.frozen_catalog;
    for (const step of fixture.session.steps) {
      stepCount += 1;
      const requirements = deriveRequirementsFromHeadMode(step.prefix_hash, mode);
      const impliedTier = impliedTierFromRequirements(requirements);
      const minTier = step.step_outcome.min_tier;

      if (impliedTier === minTier) {
        matches += 1;
      } else if (tierRank(impliedTier) < tierRank(minTier)) {
        shortfall += 1;
      } else {
        overroute += 1;
      }

      const impliedModel = cheapestModelForTier(catalog, impliedTier);
      impliedCost += estimateStepCostUsd(catalog, impliedModel.model_id, step.prefix_token_estimate);
      hindsightCost += estimateStepCostUsd(
        catalog,
        step.step_outcome.min_model_id,
        step.prefix_token_estimate,
      );
    }
  }

  return {
    hydra_heads: mode,
    step_count: stepCount,
    top1_matches: matches,
    top1_error_rate: stepCount === 0 ? 0 : roundRate(1 - matches / stepCount),
    shortfall_steps: shortfall,
    shortfall_rate: safeRate(shortfall, stepCount),
    overroute_steps: overroute,
    overroute_rate: safeRate(overroute, stepCount),
    implied_total_cost_usd: roundRate(impliedCost),
    hindsight_optimal_total_cost_usd: roundRate(hindsightCost),
    cost_regret_usd: roundRate(impliedCost - hindsightCost),
  };
}

/**
 * Full offline A/B for one fixture source: fixture QR comparison plus per-step
 * Top-1 / shortfall / cost-regret stats for `learned_projection` vs
 * `modernbert_k4`. Deterministic — callers add timestamps at the CLI edge.
 */
export function runK4HeadModeAbEval(
  fixtures: readonly EvalTraceFixture[],
  source: string,
): K4HeadModeAbReport {
  const stepCount = fixtures.reduce((sum, f) => sum + f.session.steps.length, 0);

  let agreeingSteps = 0;
  for (const fixture of fixtures) {
    for (const step of fixture.session.steps) {
      const learnedTier = impliedTierFromRequirements(
        deriveRequirementsFromHeadMode(step.prefix_hash, 'learned_projection'),
      );
      const k4Tier = impliedTierFromRequirements(
        deriveRequirementsFromHeadMode(step.prefix_hash, 'modernbert_k4'),
      );
      if (learnedTier === k4Tier) {
        agreeingSteps += 1;
      }
    }
  }

  return {
    source,
    fixture_count: fixtures.length,
    step_count: stepCount,
    qr_comparison: compareK4HeadModeOfflineEval(fixtures),
    learned_projection: scoreHeadModeTop1(fixtures, 'learned_projection'),
    modernbert_k4: scoreHeadModeTop1(fixtures, 'modernbert_k4'),
    head_mode_tier_agreement_rate: stepCount === 0 ? 1 : safeRate(agreeingSteps, stepCount),
    // Trained heads load only from config/modernbert-k4-heads.json; when absent the
    // K=4 side is the deterministic quarter-pooled placeholder (smoke-level only).
    k4_uses_placeholder_heads: loadModernBertK4HeadWeights() === null,
  };
}

/** Load every top-level eval trace fixture in a directory (skips subdirs / non-trace JSON). */
export function loadTraceFixturesFromDir(dirPath: string): EvalTraceFixture[] {
  const abs = resolve(dirPath);
  const fixtures: EvalTraceFixture[] = [];

  for (const name of readdirSync(abs).filter((n) => n.endsWith('.json')).sort()) {
    const raw = JSON.parse(readFileSync(join(abs, name), 'utf8')) as unknown;
    if (isTwinRouterBenchStaticTrack(raw)) {
      continue;
    }
    fixtures.push(loadEvalTraceFixture(raw));
  }

  return fixtures;
}

/** Adapt a TwinRouterBench static track file into eval trace fixtures for the A/B. */
export function loadStaticTrackFixtures(trackPath: string): EvalTraceFixture[] {
  const raw = JSON.parse(readFileSync(resolve(trackPath), 'utf8')) as unknown;
  return adaptTwinRouterBenchStaticTrack(parseTwinRouterBenchStaticTrack(raw));
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

interface ReplayCliArgs {
  readonly fixturesDir: string;
  readonly cheapAtStepIndex?: number | undefined;
  readonly k4Ab: boolean;
  readonly corpusPaths: readonly string[];
  readonly outPath?: string | undefined;
}

function parseArgs(argv: readonly string[]): ReplayCliArgs {
  let fixturesDir = defaultFixturesDir();
  let cheapAtStepIndex: number | undefined;
  let k4Ab = false;
  const corpusPaths: string[] = [];
  let outPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixtures' && argv[i + 1]) {
      fixturesDir = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--cheap-at-step' && argv[i + 1]) {
      cheapAtStepIndex = Number.parseInt(argv[i + 1]!, 10);
      i += 1;
    } else if (arg === '--k4-ab') {
      k4Ab = true;
    } else if (arg === '--corpus' && argv[i + 1]) {
      corpusPaths.push(...argv[i + 1]!.split(',').map((p) => resolve(p.trim())));
      i += 1;
    } else if (arg === '--out' && argv[i + 1]) {
      outPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: routing:eval-replay [--fixtures DIR] [--cheap-at-step N]
       routing:eval-replay --k4-ab [--fixtures DIR] [--corpus TRACK.json[,...]] [--out PATH]

Replays eval trace fixtures and prints cumulative regret vs hindsight-optimal routing.
Frozen catalog metadata (catalog_id, checkpoint_date) is echoed for reproducibility.

--k4-ab runs the SP-219 offline A/B: fixture QR plus per-step Top-1 / shortfall /
cost-regret stats for learned_projection vs modernbert_k4 on the trace fixture dir
and each TwinRouterBench static track passed via --corpus. K=4 falls back to
placeholder heads when config/modernbert-k4-heads.json is absent (flagged in output).`);
      process.exit(0);
    }
  }

  return { fixturesDir, cheapAtStepIndex, k4Ab, corpusPaths, outPath };
}

function runK4AbCli(parsed: ReplayCliArgs): void {
  const reports: K4HeadModeAbReport[] = [];

  const traceFixtures = loadTraceFixturesFromDir(parsed.fixturesDir);
  if (traceFixtures.length > 0) {
    reports.push(runK4HeadModeAbEval(traceFixtures, `trace-fixtures:${parsed.fixturesDir}`));
  }

  for (const corpusPath of parsed.corpusPaths) {
    const fixtures = loadStaticTrackFixtures(corpusPath);
    reports.push(runK4HeadModeAbEval(fixtures, `static-track:${corpusPath}`));
  }

  const output = {
    generated_at: new Date().toISOString(),
    mode: 'k4-head-mode-ab',
    top1_error_threshold: MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD,
    caveat:
      'Embeddings are deterministic hash-derived synthetics (no prompt text in packs); ' +
      'when k4_uses_placeholder_heads is true the K=4 side is the quarter-pooled placeholder. ' +
      'Results are pipeline smoke evidence, not trained-head enablement evidence.',
    reports,
  };

  const json = JSON.stringify(output, null, 2);
  console.log(json);
  if (parsed.outPath) {
    writeFileSync(parsed.outPath, `${json}\n`, 'utf8');
    console.error(`k4-ab report written to ${parsed.outPath}`);
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.k4Ab) {
    runK4AbCli(parsed);
    return;
  }
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
