import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { MINIMUM_TRAINING_SAMPLES } from '../../scripts/calibration-aggregate.js';
import {
  assertCompatibleHydraProjectionArtifact,
  createDefaultRoutingCalibrationBundle,
  flattenHydraProjectionWeights,
  HYDRA_PREFIX_SCHEMA_VERSION,
  HYDRA_PROJECTION_ARTIFACT_VERSION,
  isSevenFlagHydraProjectionSample,
  parseRoutingCalibrationBundleJson,
  readHydraPrefixSchemaVersion,
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

function makeEmbeddingVector(): number[] {
  return Array.from({ length: EMBEDDING_DIM }, (_, index) => Math.sin(index * 0.01));
}

function makeSevenFlagTrainingRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return makeTrainingRecord({
    hydra_prefix_schema_version: HYDRA_PREFIX_SCHEMA_VERSION,
    embedding: makeEmbeddingVector(),
    ...overrides,
  });
}

function makeBundleWithHydraWeights(): RoutingCalibrationBundle {
  const base = createDefaultRoutingCalibrationBundle();
  const weights = Array.from({ length: EMBEDDING_DIM * 3 }, (_, index) =>
    index % 97 === 0 ? 0.01 : 0,
  );
  return {
    ...base,
    hydra_projection: {
      version: HYDRA_PROJECTION_ARTIFACT_VERSION,
      embedding_dim: EMBEDDING_DIM,
      prefix_schema_version: HYDRA_PREFIX_SCHEMA_VERSION,
      prefix_flag_count: 7,
      weights,
      bias: [0.1, -0.1, 0.05],
      trained_sample_count: MINIMUM_TRAINING_SAMPLES.hydra_projection,
    },
  };
}

describe('train routing calibration (SP-117)', () => {
  it('documents minimum training sample thresholds', () => {
    expect(MINIMUM_TRAINING_SAMPLES.p_success_weights).toBe(30);
    expect(MINIMUM_TRAINING_SAMPLES.hydra_projection).toBeGreaterThanOrEqual(100);
    expect(MINIMUM_TRAINING_SAMPLES.triage_thresholds).toBeGreaterThanOrEqual(50);
  });

  it('produces a versioned bundle with all four artifact types', () => {
    const bundle = trainRoutingCalibrationBundle([
      makeTrainingRecord(),
      makeTrainingRecord({ selected_model_id: 'gpt-4o', success_label: false }),
    ]);

    expect(bundle.version).toBe(ROUTING_CALIBRATION_BUNDLE_VERSION);
    expect(bundle.hydra_projection.version).toBe(HYDRA_PROJECTION_ARTIFACT_VERSION);
    expect(bundle.hydra_projection.prefix_schema_version).toBe(HYDRA_PREFIX_SCHEMA_VERSION);
    expect(bundle.hydra_projection.prefix_flag_count).toBe(7);
    expect(bundle.triage_thresholds.version).toBe(1);
    expect(bundle.p_success_weights.version).toBe(1);
    expect(bundle.routing_centroids.version).toBe(1);
    expect(bundle.hydra_projection.weights).toHaveLength(EMBEDDING_DIM * 3);
    expect(bundle.minimum_training_samples).toEqual(MINIMUM_TRAINING_SAMPLES);
  });

  it('serializes and parses bundle JSON with schema validation', () => {
    const bundle = makeBundleWithHydraWeights();
    const raw = serializeRoutingCalibrationBundle(bundle);
    const parsed = parseRoutingCalibrationBundleJson(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.hydra_projection.bias).toEqual(bundle.hydra_projection.bias);
  });

  it('rejects incompatible bundle versions', () => {
    const bundle = createDefaultRoutingCalibrationBundle();
    const incompatible = { ...bundle, version: 99 };
    expect(() => parseRoutingCalibrationBundleJson(JSON.stringify(incompatible))).toThrow(
      /Unsupported routing calibration bundle version/,
    );
  });

  it('rejects stale hydra_projection artifact versions at parse time', () => {
    const bundle = createDefaultRoutingCalibrationBundle();
    const stale = {
      ...bundle,
      hydra_projection: {
        ...bundle.hydra_projection,
        version: 1,
        prefix_schema_version: 1,
        prefix_flag_count: 4,
      },
    };
    expect(() => parseRoutingCalibrationBundleJson(JSON.stringify(stale))).toThrow(
      /Invalid routing calibration bundle/,
    );
  });

  it('rejects stale hydra_projection artifacts when unflattening weights', () => {
    const bundle = makeBundleWithHydraWeights();
    const stale = {
      ...bundle.hydra_projection,
      version: 1 as typeof bundle.hydra_projection.version,
      prefix_schema_version: 1 as typeof bundle.hydra_projection.prefix_schema_version,
      prefix_flag_count: 4 as typeof bundle.hydra_projection.prefix_flag_count,
    };

    expect(() => assertCompatibleHydraProjectionArtifact(stale)).toThrow(
      /Stale hydra_projection artifact version/,
    );
    expect(() => unflattenHydraProjectionWeights(stale)).toThrow(
      /Stale hydra_projection artifact version/,
    );
  });

  it('infers seven-flag prefix schema from contrib metadata scalars', () => {
    const legacy = makeTrainingRecord({ compaction_flag: undefined });
    delete (legacy as Record<string, unknown>).compaction_flag;
    expect(readHydraPrefixSchemaVersion(legacy)).toBe(1);

    const modern = makeTrainingRecord();
    expect(readHydraPrefixSchemaVersion(modern)).toBe(HYDRA_PREFIX_SCHEMA_VERSION);
  });

  it('excludes legacy-prefix embedding rows from projection training', () => {
    const legacyEmbedding = makeTrainingRecord({
      hydra_prefix_schema_version: 1,
      embedding: makeEmbeddingVector(),
    });
    expect(isSevenFlagHydraProjectionSample(legacyEmbedding)).toBe(false);

    const modernEmbedding = makeSevenFlagTrainingRecord();
    expect(isSevenFlagHydraProjectionSample(modernEmbedding)).toBe(true);

    const records = Array.from({ length: MINIMUM_TRAINING_SAMPLES.hydra_projection }, () =>
      makeSevenFlagTrainingRecord(),
    );
    const bundle = trainRoutingCalibrationBundle(records);
    expect(bundle.hydra_projection.trained_sample_count).toBe(
      MINIMUM_TRAINING_SAMPLES.hydra_projection,
    );
    expect(bundle.hydra_projection.version).toBe(HYDRA_PROJECTION_ARTIFACT_VERSION);
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

  it('falls back to defaults when bundle file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp117-missing-'));
    try {
      const missingPath = join(dir, 'missing-bundle.json');
      const bundle = resolveRoutingCalibrationBundle(missingPath);
      expect(bundle.version).toBe(1);
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
      expect(bundle.version).toBe(1);
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
