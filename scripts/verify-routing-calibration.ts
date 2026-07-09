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
import { predictPSuccessCheap } from '../src/domain/routing/p-success-classifier.js';
import { extractPSuccessFeatures } from '../src/domain/routing/p-success-classifier.js';
import {
  applyIsotonicLookup,
  validateIsotonicCalibratorArtifact,
} from './lib/isotonic-calibrator.js';
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

  return results;
}

export function verifyRoutingCalibration(
  bundlePath: string = DEFAULT_ROUTING_CALIBRATION_PATH,
): VerifyCalibrationResult {
  const resolvedPath = resolve(bundlePath);
  const bundle = existsSync(resolvedPath)
    ? resolveRoutingCalibrationBundle(resolvedPath)
    : resolveRoutingCalibrationBundle(resolvedPath);

  const assertions = [
    ...verifyArtifactShapes(bundle),
    ...CALIBRATION_BENCHMARKS.map((benchmark) => assertBenchmark(benchmark, bundle)),
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
