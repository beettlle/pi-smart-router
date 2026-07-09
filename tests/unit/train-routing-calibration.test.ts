import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { MINIMUM_TRAINING_SAMPLES } from '../../scripts/calibration-aggregate.js';
import {
  createDefaultRoutingCalibrationBundle,
  flattenHydraProjectionWeights,
  parseRoutingCalibrationBundleJson,
  resolveRoutingCalibrationBundle,
  ROUTING_CALIBRATION_BUNDLE_VERSION,
  serializeRoutingCalibrationBundle,
  trainRoutingCalibrationBundle,
  unflattenHydraProjectionWeights,
  type RoutingCalibrationBundle,
} from '../../scripts/train-routing-calibration.js';
import {
  assertBenchmark,
  CALIBRATION_BENCHMARKS,
  evaluateTriageWithBundleThreshold,
  verifyArtifactShapes,
  verifyRoutingCalibration,
} from '../../scripts/verify-routing-calibration.js';
import { EMBEDDING_DIM } from '../../src/domain/matching/embedding-provider.js';
import { CYCLOMATIC_THRESHOLD } from '../../src/domain/triage/triage-engine.js';

function makeTrainingRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    request_id: 'req-default',
    timestamp: '2026-07-07T12:00:00.000Z',
    session_id_hash: 'a'.repeat(64),
    turn_type: 'main_loop',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'gpt-4o-mini',
    routing_latency_ms: 12,
    prompt_length_chars: 200,
    estimated_input_tokens: 50,
    triage_verdict: 'ambiguous',
    triage_cyclomatic_score: 0.2,
    requirement_reasoning: 0.4,
    requirement_code_gen: 0.5,
    requirement_tool_use: 0.1,
    has_tool_context: false,
    compaction_flag: false,
    tier: 'economical-cloud',
    success_label: true,
    ...overrides,
  };
}

function makeBundleWithHydraWeights(): RoutingCalibrationBundle {
  const base = createDefaultRoutingCalibrationBundle();
  const weights = Array.from({ length: EMBEDDING_DIM * 3 }, (_, index) =>
    index % 97 === 0 ? 0.01 : 0,
  );
  return {
    ...base,
    hydra_projection: {
      version: 1,
      embedding_dim: EMBEDDING_DIM,
      weights,
      bias: [0.1, -0.1, 0.05],
      trained_sample_count: MINIMUM_TRAINING_SAMPLES.hydra_projection,
    },
    isotonic_calibrator: {
      ...base.isotonic_calibrator,
      trained_sample_count: MINIMUM_TRAINING_SAMPLES.isotonic_calibrator,
    },
  };
}

describe('train routing calibration (SP-117)', () => {
  it('documents minimum training sample thresholds', () => {
    expect(MINIMUM_TRAINING_SAMPLES.p_success_weights).toBe(30);
    expect(MINIMUM_TRAINING_SAMPLES.hydra_projection).toBeGreaterThanOrEqual(100);
    expect(MINIMUM_TRAINING_SAMPLES.triage_thresholds).toBeGreaterThanOrEqual(50);
  });

  it('produces a versioned bundle with all five artifact types', () => {
    const bundle = trainRoutingCalibrationBundle([
      makeTrainingRecord(),
      makeTrainingRecord({ selected_model_id: 'gpt-4o', success_label: false }),
    ]);

    expect(bundle.version).toBe(ROUTING_CALIBRATION_BUNDLE_VERSION);
    expect(bundle.hydra_projection.version).toBe(1);
    expect(bundle.triage_thresholds.version).toBe(1);
    expect(bundle.p_success_weights.version).toBe(1);
    expect(bundle.isotonic_calibrator.version).toBe(1);
    expect(bundle.routing_centroids.version).toBe(1);
    expect(bundle.hydra_projection.weights).toHaveLength(EMBEDDING_DIM * 3);
    expect(bundle.minimum_training_samples).toEqual(MINIMUM_TRAINING_SAMPLES);
    expect(bundle.isotonic_calibrator.x_knots.length).toBeGreaterThanOrEqual(2);
  });

  it('serializes and parses bundle JSON with schema validation', () => {
    const bundle = makeBundleWithHydraWeights();
    const raw = serializeRoutingCalibrationBundle(bundle);
    const parsed = parseRoutingCalibrationBundleJson(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.hydra_projection.bias).toEqual(bundle.hydra_projection.bias);
  });

  it('rejects incompatible bundle versions', () => {
    const bundle = createDefaultRoutingCalibrationBundle();
    const incompatible = { ...bundle, version: 99 };
    expect(() => parseRoutingCalibrationBundleJson(JSON.stringify(incompatible))).toThrow(
      /Unsupported routing calibration bundle version/,
    );
  });

  it('round-trips flattened hydra projection weights', () => {
    const bundle = makeBundleWithHydraWeights();
    const nested = unflattenHydraProjectionWeights(bundle.hydra_projection);
    const flat = flattenHydraProjectionWeights(nested);
    expect(flat).toEqual([...bundle.hydra_projection.weights]);
  });

  it('fits triage cyclomatic threshold from labeled contrib rows', () => {
    const records = Array.from({ length: 60 }, (_, index) =>
      makeTrainingRecord({
        triage_verdict: index % 2 === 0 ? 'complex' : 'trivial',
        triage_cyclomatic_score: index % 2 === 0 ? 18 : 3,
      }),
    );

    const bundle = trainRoutingCalibrationBundle(records);
    expect(bundle.triage_thresholds.trained_sample_count).toBe(60);
    expect(bundle.triage_thresholds.cyclomatic_threshold).toBeGreaterThanOrEqual(5);
    expect(bundle.triage_thresholds.cyclomatic_threshold).toBeLessThanOrEqual(30);
  });

  it('fits isotonic calibrator and reports holdout ECE with enough labeled rows', () => {
    const records = Array.from({ length: 40 }, (_, index) =>
      makeTrainingRecord({
        request_id: `req-${index}`,
        success_label: index % 3 !== 0,
        triage_cyclomatic_score: index / 40,
      }),
    );

    const bundle = trainRoutingCalibrationBundle(records);
    expect(bundle.isotonic_calibrator.trained_sample_count).toBe(40);
    expect(bundle.isotonic_calibrator.x_knots.length).toBeGreaterThanOrEqual(2);
    expect(bundle.isotonic_calibrator.holdout_ece_raw).not.toBeNull();
    expect(bundle.isotonic_calibrator.holdout_ece_calibrated).not.toBeNull();
  });

  it('falls back to defaults when bundle file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp117-missing-'));
    try {
      const missingPath = join(dir, 'missing-bundle.json');
      const bundle = resolveRoutingCalibrationBundle(missingPath);
      expect(bundle.version).toBe(2);
      expect(bundle.triage_thresholds.cyclomatic_threshold).toBe(CYCLOMATIC_THRESHOLD);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to defaults for invalid bundle version on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp117-invalid-'));
    try {
      const invalidPath = join(dir, 'invalid-bundle.json');
      writeFileSync(invalidPath, JSON.stringify({ version: 99 }), 'utf8');
      const bundle = resolveRoutingCalibrationBundle(invalidPath);
      expect(bundle.version).toBe(2);
      expect(bundle.p_success_weights.trained_sample_count).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('verify routing calibration (SP-117)', () => {
  it('validates artifact shapes on default bundle', () => {
    const bundle = createDefaultRoutingCalibrationBundle();
    const results = verifyArtifactShapes(bundle);
    expect(results.every((entry) => entry.passed)).toBe(true);
  });

  it('evaluates benchmark triage gates with bundle threshold', () => {
    const bundle = createDefaultRoutingCalibrationBundle();
    const trivial = evaluateTriageWithBundleThreshold('what is 2+2', bundle);
    expect(trivial.cyclomatic_complex).toBe(false);

    for (const benchmark of CALIBRATION_BENCHMARKS) {
      const result = assertBenchmark(benchmark, bundle);
      expect(result.passed, result.message).toBe(true);
    }
  });

  it('verifyRoutingCalibration passes for example bundle path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp117-verify-'));
    try {
      const bundlePath = join(dir, 'routing-calibration.json');
      writeFileSync(
        bundlePath,
        serializeRoutingCalibrationBundle(createDefaultRoutingCalibrationBundle()),
      );
      const result = verifyRoutingCalibration(bundlePath);
      expect(result.failed).toBe(0);
      expect(result.passed).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
