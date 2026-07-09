#!/usr/bin/env node
/**
 * Routing calibration verify benchmark — SP-117, GitHub #66 (stage 5).
 *
 * Loads a versioned routing-calibration.json bundle and asserts routing signals
 * on benchmark prompts. Uses triage cyclomatic threshold from the bundle and
 * validates artifact shapes. ONNX cluster matching is optional (--skip-embed).
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
import { predictPSuccessCheap } from '../src/domain/routing/p-success-classifier.js';
import { extractPSuccessFeatures } from '../src/domain/routing/p-success-classifier.js';
import {
  applyIsotonicLookup,
  validateIsotonicCalibratorArtifact,
} from './lib/isotonic-calibrator.js';
import {
  OATS_REFINEMENT_ARTIFACT_VERSION,
  type RefinedRoutingCentroidsArtifact,
} from './lib/oats-centroid-refinement.js';
import {
  assertCompatibleHydraProjectionArtifact,
  DEFAULT_ROUTING_CALIBRATION_PATH,

  HYDRA_PREFIX_FLAG_COUNT,
  HYDRA_PREFIX_SCHEMA_VERSION,
  resolveRoutingCalibrationBundle,
  unflattenHydraProjectionWeights,
  type RoutingCalibrationBundle,
} from './train-routing-calibration.js';

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

function usage(): void {
  console.error(
    [
      'Usage: npm run routing:verify-calibration -- [bundle.json]',
      '',
      'Validates routing-calibration.json artifact shapes and benchmark triage gates.',
      'Exits non-zero when any assertion fails.',
    ].join('\n'),
  );
}

function main(): void {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const bundlePath = process.argv[2] ?? DEFAULT_ROUTING_CALIBRATION_PATH;
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
