#!/usr/bin/env node
/**
 * Routing calibration verify benchmark — SP-117, GitHub #66 (stage 5).
 *
 * Loads a versioned routing-calibration.json bundle and asserts routing signals
 * on benchmark prompts. Uses triage cyclomatic threshold from the bundle and
 * validates artifact shapes. ONNX cluster matching is optional (--skip-embed).
 *
 * SP-191: `--dry-run-packs` / `--ci-fixtures` loads privacy-safe label packs,
 * holdout-splits, fits logistic + isotonic offline, and reports holdout ECE
 * (soft advisory threshold; report-only when sample-starved). Never writes
 * prompt text into artifacts.
 * SP-201: `--include-excluded-in-fit` warm-starts fit with weak rows; holdout
 * ECE / soft ECE pass-fail stay verifier-grade only (#96).
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { cyclomaticScan, sanitize } from '../src/domain/triage/triage-engine.js';
import { buildHydraInput } from '../src/domain/matching/hydra-input.js';
import { projectToRequirements } from '../src/domain/matching/hydra-matcher.js';
import {
  assignClusterByCentroids,
  type RoutingCentroidsArtifact,
} from '../src/domain/matching/cluster-matcher.js';
import {
  MIN_TRAINING_SAMPLES,
  P_SUCCESS_FEATURE_NAMES,
  predictPSuccessCheap,
  extractPSuccessFeatures,
  trainFromLabeledSamples,
  type LabeledTrainingSample,
  type PSuccessFeatures,
  type PSuccessFailureProxies,
} from '../src/domain/routing/p-success-classifier.js';
import {
  applyIsotonicLookup,
  computeExpectedCalibrationError,
  DEFAULT_ISOTONIC_ECE_BINS,
  DEFAULT_ISOTONIC_HOLDOUT_FRACTION,
  fitIsotonicCalibratorFromSamples,
  fitIsotonicPAV,
  splitLabeledSamplesForIsotonic,
  validateIsotonicCalibratorArtifact,
} from './lib/isotonic-calibrator.js';
import {
  LabelPackError,
  loadLabelPackFile,
  type LabelPackRow,
} from './lib/label-pack-schema.js';
import {
  OATS_REFINEMENT_ARTIFACT_VERSION,
  type RefinedRoutingCentroidsArtifact,
} from './lib/oats-centroid-refinement.js';
import { ingestFcRewardBenchFile } from './ingest-fc-rewardbench-labels.js';
import { ingestSweGymVerifierFile } from './ingest-swe-gym-labels.js';
import { ingestTwinRouterBenchWeakFile } from './ingest-twinrouterbench-weak-labels.js';
import {
  assertCompatibleHydraProjectionArtifact,
  DEFAULT_ROUTING_CALIBRATION_PATH,

  HYDRA_PREFIX_FLAG_COUNT,
  HYDRA_PREFIX_SCHEMA_VERSION,
  resolveRoutingCalibrationBundle,
  unflattenHydraProjectionWeights,
  type RoutingCalibrationBundle,
} from './train-routing-calibration.js';

/** Soft advisory ECE ceiling for pack dry-run (not a release-gate absolute). */
export const CALIBRATION_DRY_RUN_SOFT_ECE_THRESHOLD = 0.25;

/** Pack outcome signal that excludes a row from holdout ECE metrics (SP-190 weak labels). */
export const EXCLUDE_FROM_HOLDOUT_ECE_SIGNAL = 'exclude_from_holdout_ece';

export const DEFAULT_LABEL_PACK_CI_FIXTURES = {
  sweGym: resolve('tests/eval/corpus/label-packs/swe-gym/ci-fixture.jsonl'),
  fcRewardBench: resolve('tests/eval/corpus/label-packs/fc-rewardbench/ci-fixture.jsonl'),
  twinRouterWeak: resolve(
    'tests/eval/corpus/label-packs/twinrouterbench-weak/ci-fixture.jsonl',
  ),
} as const;

const EMPTY_FAILURE_PROXIES: PSuccessFailureProxies = {
  tool_failure_chain_count: null,
  stop_reason_invalid: null,
  reprompt_rate: null,
  edit_distance_proxy: null,
};

export interface CalibrationBenchmark {
  readonly id: string;
  readonly prompt: string;
  readonly expect: {
    readonly triage_verdict?: 'trivial' | 'complex' | 'ambiguous';
    readonly min_cyclomatic?: number;
    readonly max_cyclomatic?: number;
  };
}

export const CALIBRATION_BENCHMARKS: readonly CalibrationBenchmark[] = [
  {
    id: 'trivial_arithmetic',
    prompt: 'what is 2+2',
    expect: { triage_verdict: 'trivial', max_cyclomatic: 5 },
  },
  {
    id: 'trivial_definition',
    prompt: 'define polymorphism in one sentence',
    expect: { triage_verdict: 'trivial', max_cyclomatic: 5 },
  },
  {
    id: 'frontier_architecture',
    prompt: 'design a microservices migration for a monolith with strict SLAs',
    expect: { triage_verdict: 'complex', max_cyclomatic: 10 },
  },
  {
    id: 'cyclomatic_complex',
    prompt: [
      '```ts',
      'function run(items: number[]) {',
      '  for (const item of items) {',
      '    if (item > 0) {',
      '      if (item % 2 === 0) {',
      '        while (item > 1) { item -= 1; }',
      '      } else if (item % 3 === 0) {',
      '        switch (item) { case 3: break; default: break; }',
      '      }',
      '    }',
      '  }',
      '}',
      '```',
    ].join('\n'),
    expect: { triage_verdict: 'complex', min_cyclomatic: 5 },
  },
] as const;

export interface ClusterCalibrationBenchmark {
  readonly id: string;
  readonly prompt: string;
  readonly expect_cluster_id: string;
  /** Optional fixed embedding for offline cluster assignment (no ONNX). */
  readonly embedding?: readonly number[];
}

export const CLUSTER_CALIBRATION_BENCHMARKS: readonly ClusterCalibrationBenchmark[] = [
  {
    id: 'cluster_trivial_general',
    prompt: 'what is 2+2',
    expect_cluster_id: 'low_stakes_general',
  },
  {
    id: 'cluster_trivial_definition',
    prompt: 'define polymorphism in one sentence',
    expect_cluster_id: 'low_stakes_general',
  },
  {
    id: 'cluster_frontier_architecture',
    prompt: 'design a microservices migration for a monolith with strict SLAs',
    expect_cluster_id: 'architecture',
  },
] as const;

const L2_NORM_TOLERANCE = 0.02;

function centroidL2Norm(centroid: readonly number[]): number {
  let magnitude = 0;
  for (const value of centroid) {
    magnitude += value * value;
  }
  return Math.sqrt(magnitude);
}

/** Validate routing_centroids artifact shape and optional OATS refinement metadata (SP-147). */
export function validateOatsCentroidArtifact(
  centroids: RefinedRoutingCentroidsArtifact,
): BenchmarkAssertionResult[] {
  const results: BenchmarkAssertionResult[] = [];

  const clusterIds = new Set<string>();
  for (const cluster of centroids.clusters) {
    if (clusterIds.has(cluster.cluster_id)) {
      results.push({
        id: 'oats_centroids_unique_ids',
        passed: false,
        message: `duplicate cluster_id '${cluster.cluster_id}'`,
      });
      return results;
    }
    clusterIds.add(cluster.cluster_id);

    const finite = cluster.centroid.every((value) => Number.isFinite(value));
    if (!finite) {
      results.push({
        id: `oats_centroid_finite_${cluster.cluster_id}`,
        passed: false,
        message: `non-finite centroid values for ${cluster.cluster_id}`,
      });
      continue;
    }

    const norm = centroidL2Norm(cluster.centroid);
    if (norm === 0) {
      results.push({
        id: `oats_centroid_norm_${cluster.cluster_id}`,
        passed: false,
        message: `zero-magnitude centroid for ${cluster.cluster_id}`,
      });
    }
  }

  results.push({
    id: 'oats_centroids_shape',
    passed:
      centroids.version === 1 &&
      centroids.embedding_dim > 0 &&
      centroids.clusters.length > 0 &&
      results.every((entry) => entry.passed),
    message: `clusters=${centroids.clusters.length}, dim=${centroids.embedding_dim}`,
  });

  const oats = centroids.oats_refinement;
  if (oats === undefined) {
    results.push({
      id: 'oats_refinement',
      passed: true,
      message: 'bootstrap centroids (no OATS metadata)',
    });
    return results;
  }

  const oatsValid =
    oats.version === OATS_REFINEMENT_ARTIFACT_VERSION &&
    oats.alpha >= 0 &&
    oats.alpha <= 1 &&
    oats.beta >= 0 &&
    oats.beta <= 1 &&
    oats.beta < oats.alpha &&
    oats.positive_sample_count >= 0 &&
    oats.negative_sample_count >= 0 &&
    oats.clusters_refined >= 0 &&
    oats.clusters_skipped >= 0 &&
    oats.clusters_refined + oats.clusters_skipped <= centroids.clusters.length;

  results.push({
    id: 'oats_refinement',
    passed: oatsValid,
    message: oatsValid
      ? `refined=${oats.clusters_refined}, skipped=${oats.clusters_skipped}, pos=${oats.positive_sample_count}, neg=${oats.negative_sample_count}`
      : `invalid OATS metadata (alpha=${oats.alpha}, beta=${oats.beta})`,
  });

  if (oats.clusters_refined > 0) {
    const normalizedCount = centroids.clusters.filter((cluster) => {
      const norm = centroidL2Norm(cluster.centroid);
      return Math.abs(norm - 1) <= L2_NORM_TOLERANCE;
    }).length;
    results.push({
      id: 'oats_centroids_normalized',
      passed: normalizedCount >= oats.clusters_refined,
      message: `normalized=${normalizedCount}, refined=${oats.clusters_refined}`,
    });
  }

  return results;
}

export function assertClusterBenchmark(
  benchmark: ClusterCalibrationBenchmark,
  centroids: RoutingCentroidsArtifact,
  embedding?: Float32Array,
): BenchmarkAssertionResult {
  const clusterIds = new Set(centroids.clusters.map((cluster) => cluster.cluster_id));
  if (!clusterIds.has(benchmark.expect_cluster_id)) {
    return {
      id: benchmark.id,
      passed: false,
      message: `expected cluster '${benchmark.expect_cluster_id}' missing from bundle`,
    };
  }

  let vector = embedding;
  if (vector === undefined && benchmark.embedding !== undefined) {
    vector = new Float32Array(benchmark.embedding);
  }

  if (vector === undefined) {
    return {
      id: benchmark.id,
      passed: true,
      message: `skipped cluster assignment (no embedding for '${benchmark.prompt.slice(0, 40)}')`,
    };
  }

  const assignment = assignClusterByCentroids(centroids, vector);
  const passed = assignment.cluster_id === benchmark.expect_cluster_id;

  return {
    id: benchmark.id,
    passed,
    message: passed
      ? `cluster=${assignment.cluster_id}, sim=${assignment.similarity.toFixed(3)}`
      : `expected ${benchmark.expect_cluster_id}, got ${assignment.cluster_id} (sim=${assignment.similarity.toFixed(3)})`,
  };
}

export interface BenchmarkAssertionResult {
  readonly id: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface VerifyCalibrationResult {
  readonly bundle_path: string;
  readonly bundle_version: number;
  readonly passed: number;
  readonly failed: number;
  readonly assertions: readonly BenchmarkAssertionResult[];
}

export class CalibrationVerifyError extends Error {
  override readonly name = 'CalibrationVerifyError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Evaluate triage cyclomatic gate using bundle threshold (no prompt storage in training path). */
export function evaluateTriageWithBundleThreshold(
  prompt: string,
  bundle: RoutingCalibrationBundle,
): { readonly cyclomatic_score: number; readonly cyclomatic_complex: boolean } {
  const sanitized = sanitize(prompt);
  const cyclomatic_score = cyclomaticScan(sanitized);
  const cyclomatic_complex = cyclomatic_score >= bundle.triage_thresholds.cyclomatic_threshold;
  return { cyclomatic_score, cyclomatic_complex };
}

export function assertBenchmark(
  benchmark: CalibrationBenchmark,
  bundle: RoutingCalibrationBundle,
): BenchmarkAssertionResult {
  const triage = evaluateTriageWithBundleThreshold(benchmark.prompt, bundle);

  if (
    benchmark.expect.min_cyclomatic !== undefined &&
    triage.cyclomatic_score < benchmark.expect.min_cyclomatic
  ) {
    return {
      id: benchmark.id,
      passed: false,
      message: `cyclomatic ${triage.cyclomatic_score} < min ${benchmark.expect.min_cyclomatic}`,
    };
  }

  if (
    benchmark.expect.max_cyclomatic !== undefined &&
    triage.cyclomatic_score > benchmark.expect.max_cyclomatic
  ) {
    return {
      id: benchmark.id,
      passed: false,
      message: `cyclomatic ${triage.cyclomatic_score} > max ${benchmark.expect.max_cyclomatic}`,
    };
  }

  if (benchmark.expect.triage_verdict === 'trivial' && triage.cyclomatic_complex) {
    return {
      id: benchmark.id,
      passed: false,
      message: `expected trivial cyclomatic gate, got score ${triage.cyclomatic_score} >= ${bundle.triage_thresholds.cyclomatic_threshold}`,
    };
  }

  return {
    id: benchmark.id,
    passed: true,
    message: `cyclomatic=${triage.cyclomatic_score}, threshold=${bundle.triage_thresholds.cyclomatic_threshold}`,
  };
}

export function verifyArtifactShapes(bundle: RoutingCalibrationBundle): BenchmarkAssertionResult[] {
  const results: BenchmarkAssertionResult[] = [];

  if (bundle.version !== 2) {
    results.push({
      id: 'bundle_version',
      passed: false,
      message: `unsupported bundle version ${bundle.version}`,
    });
    return results;
  }

  results.push({
    id: 'bundle_version',
    passed: true,
    message: `bundle v${bundle.version}`,
  });

  try {
    assertCompatibleHydraProjectionArtifact(bundle.hydra_projection);
    const hydra = unflattenHydraProjectionWeights(bundle.hydra_projection);
    const embedding = new Float32Array(bundle.hydra_projection.embedding_dim);
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = Math.sin(i * 0.03);
    }
    const projected = projectToRequirements(embedding, hydra);
    if (
      !Number.isFinite(projected.reasoning) ||
      !Number.isFinite(projected.code_gen) ||
      !Number.isFinite(projected.tool_use)
    ) {
      throw new CalibrationVerifyError('projection returned non-finite values');
    }
    results.push({ id: 'hydra_projection', passed: true, message: 'projection shape ok' });
  } catch (err: unknown) {
    results.push({
      id: 'hydra_projection',
      passed: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const hydraPrefix = buildHydraInput({
    request_id: 'verify-benchmark',
    session_id: 'verify-benchmark',
    prompt_text: 'benchmark prompt',
    estimated_input_tokens: 120,
    turn_type: 'main_loop',
    compaction_flag: false,
  });
  const prefixFlagCount = (hydraPrefix.match(/\|/g) ?? []).length + 1;
  results.push({
    id: 'hydra_prefix_schema',
    passed:
      bundle.hydra_projection.prefix_schema_version === HYDRA_PREFIX_SCHEMA_VERSION &&
      bundle.hydra_projection.prefix_flag_count === HYDRA_PREFIX_FLAG_COUNT &&
      prefixFlagCount === HYDRA_PREFIX_FLAG_COUNT,
    message: `prefix_schema=v${bundle.hydra_projection.prefix_schema_version}, flags=${bundle.hydra_projection.prefix_flag_count}, encoder_flags=${prefixFlagCount}`,
  });

  const pSuccessFeatures = extractPSuccessFeatures({
    prompt_length_chars: 120,
    estimated_input_tokens: 30,
    triage_cyclomatic_score: 0.1,
    requirement_reasoning: 0.2,
    requirement_code_gen: 0.3,
    requirement_tool_use: 0.1,
    has_tool_context: false,
    compaction_flag: false,
    routing_latency_ms: 10,
    tier: 'economical-cloud',
  });
  const probability = predictPSuccessCheap(pSuccessFeatures, bundle.p_success_weights);
  results.push({
    id: 'p_success_weights',
    passed: Number.isFinite(probability) && probability >= 0 && probability <= 1,
    message: `p_success=${probability.toFixed(3)}`,
  });

  try {
    validateIsotonicCalibratorArtifact(bundle.isotonic_calibrator);
    const calibrated = applyIsotonicLookup(
      probability,
      bundle.isotonic_calibrator.x_knots,
      bundle.isotonic_calibrator.y_knots,
    );
    results.push({
      id: 'isotonic_calibrator',
      passed: Number.isFinite(calibrated) && calibrated >= 0 && calibrated <= 1,
      message: `isotonic knots=${bundle.isotonic_calibrator.x_knots.length}, calibrated=${calibrated.toFixed(3)}`,
    });
  } catch (err: unknown) {
    results.push({
      id: 'isotonic_calibrator',
      passed: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  results.push({
    id: 'routing_centroids',
    passed:
      bundle.routing_centroids.version === 1 &&
      bundle.routing_centroids.embedding_dim === bundle.hydra_projection.embedding_dim,
    message: `clusters=${bundle.routing_centroids.clusters.length}`,
  });

  results.push(...validateOatsCentroidArtifact(bundle.routing_centroids));

  return results;
}

export function verifyClusterBenchmarks(
  bundle: RoutingCalibrationBundle,
  embeddingsByBenchmarkId?: ReadonlyMap<string, Float32Array>,
): BenchmarkAssertionResult[] {
  return CLUSTER_CALIBRATION_BENCHMARKS.map((benchmark) => {
    const embedding = embeddingsByBenchmarkId?.get(benchmark.id);
    return assertClusterBenchmark(benchmark, bundle.routing_centroids, embedding);
  });
}

export function verifyRoutingCalibration(
  bundlePath: string = DEFAULT_ROUTING_CALIBRATION_PATH,
  options?: {
    readonly embeddingsByBenchmarkId?: ReadonlyMap<string, Float32Array>;
  },
): VerifyCalibrationResult {
  const resolvedPath = resolve(bundlePath);
  const bundle = existsSync(resolvedPath)
    ? resolveRoutingCalibrationBundle(resolvedPath)
    : resolveRoutingCalibrationBundle(resolvedPath);

  const assertions = [
    ...verifyArtifactShapes(bundle),
    ...CALIBRATION_BENCHMARKS.map((benchmark) => assertBenchmark(benchmark, bundle)),
    ...verifyClusterBenchmarks(bundle, options?.embeddingsByBenchmarkId),
  ];

  const failed = assertions.filter((entry) => !entry.passed).length;

  return {
    bundle_path: resolvedPath,
    bundle_version: bundle.version,
    passed: assertions.length - failed,
    failed,
    assertions,
  };
}

/** True when pack row must not contribute to holdout ECE metrics. */
export function isExcludedFromHoldoutEce(row: LabelPackRow): boolean {
  return (row.outcome_signals ?? []).includes(EXCLUDE_FROM_HOLDOUT_ECE_SIGNAL);
}

/** Map pack feature map → P(success) feature vector (missing keys → 0). */
export function featuresFromLabelPackRow(row: LabelPackRow): PSuccessFeatures {
  const features = {} as Record<(typeof P_SUCCESS_FEATURE_NAMES)[number], number>;
  for (const name of P_SUCCESS_FEATURE_NAMES) {
    const value = row.features[name];
    features[name] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  return features;
}

/** Convert a validated label-pack row into a training sample (no prompt text). */
export function labelPackRowToTrainingSample(row: LabelPackRow): LabeledTrainingSample {
  return {
    request_id: row.sample_id,
    features: featuresFromLabelPackRow(row),
    success: row.success,
    outcome_signals: [],
    failure_proxies: EMPTY_FAILURE_PROXIES,
  };
}

export interface CalibrationDryRunResult {
  readonly mode: 'report_only_sample_starved' | 'evaluated';
  readonly total_rows: number;
  readonly ece_eligible_rows: number;
  readonly excluded_from_ece_rows: number;
  readonly fit_sample_count: number;
  readonly holdout_sample_count: number;
  readonly holdout_ece_raw: number | null;
  readonly holdout_ece_calibrated: number | null;
  readonly soft_ece_threshold: number;
  readonly soft_ece_passed: boolean | null;
  readonly min_training_samples: number;
  readonly sources: readonly string[];
}

export interface CalibrationDryRunOptions {
  readonly minTrainingSamples?: number;
  readonly softEceThreshold?: number;
  /** When true, include weak/excluded rows in the isotonic fit set only (never holdout ECE). */
  readonly includeExcludedInFit?: boolean;
}

/**
 * Offline calibration dry-run: fit logistic + isotonic on pack rows and report
 * holdout ECE. Sample-starved packs are report-only (soft_ece_passed = null).
 */
export function runCalibrationDryRunFromRows(
  rows: readonly LabelPackRow[],
  options?: CalibrationDryRunOptions,
): CalibrationDryRunResult {
  const minTrainingSamples = options?.minTrainingSamples ?? MIN_TRAINING_SAMPLES;
  const softEceThreshold = options?.softEceThreshold ?? CALIBRATION_DRY_RUN_SOFT_ECE_THRESHOLD;
  const includeExcludedInFit = options?.includeExcludedInFit ?? false;

  const sources = [...new Set(rows.map((row) => row.source))].sort();
  const eceEligibleRows = rows.filter((row) => !isExcludedFromHoldoutEce(row));
  const excludedRows = rows.filter((row) => isExcludedFromHoldoutEce(row));

  const eceSamples = eceEligibleRows.map(labelPackRowToTrainingSample);
  const excludedSamples = excludedRows.map(labelPackRowToTrainingSample);

  if (eceSamples.length < minTrainingSamples) {
    return {
      mode: 'report_only_sample_starved',
      total_rows: rows.length,
      ece_eligible_rows: eceSamples.length,
      excluded_from_ece_rows: excludedSamples.length,
      fit_sample_count: 0,
      holdout_sample_count: 0,
      holdout_ece_raw: null,
      holdout_ece_calibrated: null,
      soft_ece_threshold: softEceThreshold,
      soft_ece_passed: null,
      min_training_samples: minTrainingSamples,
      sources,
    };
  }

  // Default path: fit + holdout split over ECE-eligible rows only.
  // With includeExcludedInFit: weak/excluded join the isotonic **fit** set and
  // logistic training pool; holdout ECE stays verifier-grade (ECE-eligible holdout).
  if (!includeExcludedInFit || excludedSamples.length === 0) {
    const weights = trainFromLabeledSamples(eceSamples);
    const isotonic = fitIsotonicCalibratorFromSamples(eceSamples, weights, {
      minTrainingSamples,
    });

    const holdout_ece_calibrated = isotonic.artifact.holdout_ece_calibrated;
    const soft_ece_passed =
      holdout_ece_calibrated === null ? null : holdout_ece_calibrated <= softEceThreshold;

    return {
      mode: 'evaluated',
      total_rows: rows.length,
      ece_eligible_rows: eceSamples.length,
      excluded_from_ece_rows: excludedSamples.length,
      fit_sample_count: isotonic.fit_sample_count,
      holdout_sample_count: isotonic.holdout_sample_count,
      holdout_ece_raw: isotonic.artifact.holdout_ece_raw,
      holdout_ece_calibrated,
      soft_ece_threshold: softEceThreshold,
      soft_ece_passed,
      min_training_samples: minTrainingSamples,
      sources,
    };
  }

  const { fit: eceFit, holdout } = splitLabeledSamplesForIsotonic(
    eceSamples,
    DEFAULT_ISOTONIC_HOLDOUT_FRACTION,
  );
  const fit = [...eceFit, ...excludedSamples];
  const weights = trainFromLabeledSamples([...eceSamples, ...excludedSamples]);

  const fitScores: number[] = [];
  const fitLabels: boolean[] = [];
  for (const sample of fit) {
    fitScores.push(predictPSuccessCheap(sample.features, weights));
    fitLabels.push(sample.success);
  }
  const holdoutScores: number[] = [];
  const holdoutLabels: boolean[] = [];
  for (const sample of holdout) {
    holdoutScores.push(predictPSuccessCheap(sample.features, weights));
    holdoutLabels.push(sample.success);
  }

  const { x_knots, y_knots } = fitIsotonicPAV(fitScores, fitLabels);
  const holdoutCalibrated = holdoutScores.map((score) =>
    applyIsotonicLookup(score, x_knots, y_knots),
  );

  const holdout_ece_raw =
    holdout.length > 0
      ? computeExpectedCalibrationError(holdoutScores, holdoutLabels, DEFAULT_ISOTONIC_ECE_BINS)
      : null;
  const holdout_ece_calibrated =
    holdout.length > 0
      ? computeExpectedCalibrationError(
          holdoutCalibrated,
          holdoutLabels,
          DEFAULT_ISOTONIC_ECE_BINS,
        )
      : null;
  const soft_ece_passed =
    holdout_ece_calibrated === null ? null : holdout_ece_calibrated <= softEceThreshold;

  return {
    mode: 'evaluated',
    total_rows: rows.length,
    ece_eligible_rows: eceSamples.length,
    excluded_from_ece_rows: excludedSamples.length,
    fit_sample_count: fit.length,
    holdout_sample_count: holdout.length,
    holdout_ece_raw,
    holdout_ece_calibrated,
    soft_ece_threshold: softEceThreshold,
    soft_ece_passed,
    min_training_samples: minTrainingSamples,
    sources,
  };
}

/** Load validated pack JSONL files (fail-closed on taint / schema errors). */
export function loadLabelPacksForDryRun(packPaths: readonly string[]): LabelPackRow[] {
  const rows: LabelPackRow[] = [];
  for (const packPath of packPaths) {
    const resolvedPath = resolve(packPath);
    if (!existsSync(resolvedPath)) {
      throw new LabelPackError(`Label-pack file not found: ${resolvedPath}`);
    }
    const loaded = loadLabelPackFile(resolvedPath);
    rows.push(...loaded.rows);
  }
  return rows;
}

/** Ingest checked-in CI fixtures into pack rows (offline, no network). */
export function loadCiFixtureLabelPacks(
  fixtures: typeof DEFAULT_LABEL_PACK_CI_FIXTURES = DEFAULT_LABEL_PACK_CI_FIXTURES,
): LabelPackRow[] {
  const swe = ingestSweGymVerifierFile(fixtures.sweGym);
  const fc = ingestFcRewardBenchFile(fixtures.fcRewardBench);
  const weak = ingestTwinRouterBenchWeakFile(fixtures.twinRouterWeak);
  return [...swe.rows, ...fc.rows, ...weak.rows];
}

export function runCalibrationDryRunFromPackFiles(
  packPaths: readonly string[],
  options?: CalibrationDryRunOptions,
): CalibrationDryRunResult {
  return runCalibrationDryRunFromRows(loadLabelPacksForDryRun(packPaths), options);
}

export function runCalibrationDryRunFromCiFixtures(
  options?: CalibrationDryRunOptions,
): CalibrationDryRunResult {
  return runCalibrationDryRunFromRows(loadCiFixtureLabelPacks(), options);
}

export function formatCalibrationDryRunReport(result: CalibrationDryRunResult): string {
  const lines = [
    `calibration-dry-run: mode=${result.mode}`,
    `  sources=${result.sources.join(',') || '(none)'}`,
    `  total_rows=${result.total_rows} ece_eligible=${result.ece_eligible_rows} excluded_from_ece=${result.excluded_from_ece_rows}`,
    `  min_training_samples=${result.min_training_samples} soft_ece_threshold=${result.soft_ece_threshold}`,
  ];

  if (result.mode === 'report_only_sample_starved') {
    lines.push(
      `  SAMPLE_STARVED: need ≥${result.min_training_samples} ECE-eligible rows; report-only (no soft pass/fail)`,
    );
    return lines.join('\n');
  }

  lines.push(
    `  fit=${result.fit_sample_count} holdout=${result.holdout_sample_count}`,
    `  holdout_ece_raw=${result.holdout_ece_raw?.toFixed(4) ?? 'null'}`,
    `  holdout_ece_calibrated=${result.holdout_ece_calibrated?.toFixed(4) ?? 'null'}`,
    `  soft_ece=${result.soft_ece_passed === null ? 'n/a' : result.soft_ece_passed ? 'PASS' : 'FAIL'}`,
  );
  return lines.join('\n');
}

export function parseDryRunCliArgs(argv: readonly string[]): {
  readonly dryRun: boolean;
  readonly ciFixtures: boolean;
  readonly enforceSoftEce: boolean;
  readonly includeExcludedInFit: boolean;
  readonly packPaths: readonly string[];
  readonly bundlePath: string | undefined;
} {
  const packPaths: string[] = [];
  let dryRun = false;
  let ciFixtures = false;
  let enforceSoftEce = false;
  let includeExcludedInFit = false;
  let bundlePath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--dry-run-packs' || arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--ci-fixtures') {
      dryRun = true;
      ciFixtures = true;
      continue;
    }
    if (arg === '--enforce-soft-ece') {
      enforceSoftEce = true;
      continue;
    }
    if (arg === '--include-excluded-in-fit') {
      includeExcludedInFit = true;
      continue;
    }
    if (arg === '--packs' || arg === '--label-packs') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new CalibrationVerifyError(`${arg} requires one or more pack JSONL paths`);
      }
      dryRun = true;
      while (i + 1 < argv.length && !argv[i + 1]!.startsWith('-')) {
        i += 1;
        packPaths.push(argv[i]!);
      }
      continue;
    }
    if (arg.startsWith('-')) {
      continue;
    }
    if (bundlePath === undefined) {
      bundlePath = arg;
    }
  }

  return {
    dryRun,
    ciFixtures,
    enforceSoftEce,
    includeExcludedInFit,
    packPaths,
    bundlePath,
  };
}

function usage(): void {
  console.error(
    [
      'Usage:',
      '  npm run routing:verify-calibration -- [bundle.json]',
      '  npm run routing:calibration-dry-run -- [--ci-fixtures | --packs <jsonl...>] [--include-excluded-in-fit]',
      '',
      'Validates routing-calibration.json artifact shapes and benchmark triage gates.',
      'Dry-run mode loads privacy-safe label packs, holdout-splits, and reports ECE',
      `(soft advisory threshold ${CALIBRATION_DRY_RUN_SOFT_ECE_THRESHOLD}; report-only when sample-starved).`,
      'Optional --include-excluded-in-fit adds weak/excluded rows to the fit pool only',
      '(never holdout ECE / soft ECE pass-fail used for #96 enablement).',
      'Exits non-zero when bundle assertions fail, or when --enforce-soft-ece and soft ECE fails.',
    ].join('\n'),
  );
}

function main(): void {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const args = parseDryRunCliArgs(process.argv.slice(2));
  const dryRunOptions = args.includeExcludedInFit
    ? { includeExcludedInFit: true as const }
    : undefined;

  if (args.dryRun) {
    const result = args.ciFixtures
      ? runCalibrationDryRunFromCiFixtures(dryRunOptions)
      : args.packPaths.length > 0
        ? runCalibrationDryRunFromPackFiles(args.packPaths, dryRunOptions)
        : runCalibrationDryRunFromCiFixtures(dryRunOptions);

    console.log(formatCalibrationDryRunReport(result));

    if (
      args.enforceSoftEce &&
      result.mode === 'evaluated' &&
      result.soft_ece_passed === false
    ) {
      process.exit(1);
    }
    return;
  }

  const bundlePath = args.bundlePath ?? DEFAULT_ROUTING_CALIBRATION_PATH;
  const result = verifyRoutingCalibration(bundlePath);

  for (const assertion of result.assertions) {
    const status = assertion.passed ? 'PASS' : 'FAIL';
    console.log(`${status} ${assertion.id}: ${assertion.message}`);
  }

  console.log(
    `verify-routing-calibration: ${result.passed}/${result.assertions.length} passed (bundle v${result.bundle_version} at ${result.bundle_path})`,
  );

  if (result.failed > 0) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
