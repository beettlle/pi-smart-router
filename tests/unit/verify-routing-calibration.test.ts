import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import { MINIMUM_TRAINING_SAMPLES } from '../../scripts/calibration-aggregate.js';
import { refineRoutingCentroidsWithOats } from '../../scripts/lib/oats-centroid-refinement.js';
import {
  LABEL_PACK_SCHEMA_VERSION,
  formatLabelPackJsonl,
  loadLabelPackJsonl,
  type LabelPackRow,
} from '../../scripts/lib/label-pack-schema.js';
import {
  createDefaultRoutingCalibrationBundle,
  HYDRA_PREFIX_SCHEMA_VERSION,
  serializeRoutingCalibrationBundle,
  trainRoutingCalibrationBundle,
} from '../../scripts/train-routing-calibration.js';
import {
  assertClusterBenchmark,
  CALIBRATION_DRY_RUN_SOFT_ECE_THRESHOLD,
  CLUSTER_CALIBRATION_BENCHMARKS,
  formatCalibrationDryRunReport,
  isExcludedFromHoldoutEce,
  labelPackRowToTrainingSample,
  loadCiFixtureLabelPacks,
  runCalibrationDryRunFromRows,
  validateOatsCentroidArtifact,
  verifyClusterBenchmarks,
  verifyRoutingCalibration,
} from '../../scripts/verify-routing-calibration.js';
import {
  assignClusterByCentroids,
  loadClusterMatcherCatalog,
  loadRoutingCentroidsFromCalibrationBundle,
  type RoutingCentroidsArtifact,
} from '../../src/domain/matching/cluster-matcher.js';
import { EMBEDDING_DIM } from '../../src/domain/matching/embedding-provider.js';
import type { TextEmbedder } from '../../src/domain/matching/embedding-provider.js';
import { P_SUCCESS_FEATURE_NAMES } from '../../src/domain/routing/p-success-classifier.js';

function makeEmbeddingVector(seed = 0.01): number[] {
  return Array.from({ length: EMBEDDING_DIM }, (_, index) => Math.sin(index * seed));
}

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
    hydra_prefix_schema_version: HYDRA_PREFIX_SCHEMA_VERSION,
    embedding: makeEmbeddingVector(),
    ...overrides,
  };
}

function makePackRow(
  sampleId: string,
  success: boolean,
  overrides: Partial<LabelPackRow> = {},
): LabelPackRow {
  const features: Record<string, number> = {};
  for (const name of P_SUCCESS_FEATURE_NAMES) {
    features[name] = 0.1;
  }
  features.triage_cyclomatic_score = success ? 0.2 : 0.8;
  features.requirement_reasoning = success ? 0.4 : 0.9;
  features.economical_tier = success ? 1 : 0;

  return {
    schema_version: LABEL_PACK_SCHEMA_VERSION,
    sample_id: sampleId,
    source: 'swe-gym',
    features,
    success,
    ...overrides,
  };
}

function createDeterministicEmbedder(dimension = EMBEDDING_DIM): TextEmbedder {
  return {
    embed: vi.fn(async (text: string) => {
      const vector = new Float32Array(dimension);
      for (let i = 0; i < dimension; i++) {
        vector[i] = (text.charCodeAt(i % text.length) % 97) / 100;
      }
      return vector;
    }),
    dispose: vi.fn(async () => {}),
  };
}

describe('verify routing calibration OATS (SP-147)', () => {
  it('validates bootstrap centroids without OATS metadata', () => {
    const bundle = createDefaultRoutingCalibrationBundle();
    const results = validateOatsCentroidArtifact(bundle.routing_centroids);
    expect(results.every((entry) => entry.passed)).toBe(true);
    expect(results.some((entry) => entry.id === 'oats_refinement')).toBe(true);
  });

  it('validates OATS-refined centroid artifact metadata and normalization', () => {
    const bootstrap = createDefaultRoutingCalibrationBundle().routing_centroids;
    const clusterId = bootstrap.clusters[0]!.cluster_id;
    const positiveEmbedding = makeEmbeddingVector();
    const negativeEmbedding = makeEmbeddingVector(0.02);

    const records = [
      ...Array.from({ length: MINIMUM_TRAINING_SAMPLES.routing_centroids }, (_, index) =>
        makeTrainingRecord({
          request_id: `pos-${index}`,
          cluster_id: clusterId,
          tier: 'economical-cloud',
          success_label: true,
          embedding: positiveEmbedding,
        }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        makeTrainingRecord({
          request_id: `neg-${index}`,
          cluster_id: clusterId,
          tier: 'economical-cloud',
          success_label: false,
          tool_failure_chain_count: 2,
          embedding: negativeEmbedding,
        }),
      ),
    ];

    const refined = refineRoutingCentroidsWithOats(bootstrap, records);
    const results = validateOatsCentroidArtifact(refined);
    expect(results.every((entry) => entry.passed)).toBe(true);
    expect(refined.oats_refinement?.clusters_refined).toBeGreaterThan(0);
  });

  it('assigns embeddings to expected clusters in cluster benchmarks', () => {
    const bundle = createDefaultRoutingCalibrationBundle();
    const generalEmbedding = new Float32Array(
      bundle.routing_centroids.clusters.find(
        (cluster) => cluster.cluster_id === 'low_stakes_general',
      )!.centroid,
    );
    const architectureEmbedding = new Float32Array(
      bundle.routing_centroids.clusters.find(
        (cluster) => cluster.cluster_id === 'architecture',
      )!.centroid,
    );

    const embeddings = new Map<string, Float32Array>([
      ['cluster_trivial_general', generalEmbedding],
      ['cluster_trivial_definition', generalEmbedding],
      ['cluster_frontier_architecture', architectureEmbedding],
    ]);

    const results = verifyClusterBenchmarks(bundle, embeddings);
    expect(results.every((entry) => entry.passed)).toBe(true);
  });

  it('integration: train bundle with OATS, verify, and load centroids for cluster matcher', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sp147-calibration-'));
    try {
      const bootstrap = createDefaultRoutingCalibrationBundle().routing_centroids;
      const clusterId = bootstrap.clusters[0]!.cluster_id;
      const positiveEmbedding = makeEmbeddingVector();

      const records = Array.from(
        { length: MINIMUM_TRAINING_SAMPLES.routing_centroids },
        (_, index) =>
          makeTrainingRecord({
            request_id: `train-${index}`,
            cluster_id: clusterId,
            tier: 'economical-cloud',
            success_label: true,
            embedding: positiveEmbedding,
          }),
      );

      const bundle = trainRoutingCalibrationBundle(records);
      const bundlePath = join(dir, 'routing-calibration.json');
      writeFileSync(bundlePath, serializeRoutingCalibrationBundle(bundle));

      const verifyResult = verifyRoutingCalibration(bundlePath);
      const failedAssertions = verifyResult.assertions.filter((entry) => !entry.passed);
      expect(failedAssertions, JSON.stringify(failedAssertions)).toHaveLength(0);
      expect(verifyResult.failed).toBe(0);

      const loaded = loadRoutingCentroidsFromCalibrationBundle({ filePath: bundlePath });
      expect(loaded).not.toBeNull();
      expect(loaded!.clusters).toHaveLength(bundle.routing_centroids.clusters.length);
      if (bundle.routing_centroids.oats_refinement) {
        const assignmentEmbedding = new Float32Array(
          bundle.routing_centroids.clusters.find(
            (cluster) => cluster.cluster_id === clusterId,
          )!.centroid,
        );
        const assignment = assignClusterByCentroids(loaded!, assignmentEmbedding);
        expect(assignment.cluster_id).toBe(clusterId);
      }

      const clustersYaml = readFileSync(
        join(process.cwd(), 'config/routing-clusters.yaml.example'),
        'utf8',
      );
      const clustersPath = join(dir, 'clusters.yaml');
      writeFileSync(clustersPath, clustersYaml, 'utf8');

      const catalog = await loadClusterMatcherCatalog({
        clustersFilePath: clustersPath,
        routingCalibrationPath: bundlePath,
        embedder: createDeterministicEmbedder(),
      });

      expect(catalog.clusters.length).toBeGreaterThan(0);
      expect(catalog.clusters[0]!.centroid).toBeInstanceOf(Float32Array);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('assertClusterBenchmark skips assignment when no embedding is provided', () => {
    const centroids: RoutingCentroidsArtifact =
      createDefaultRoutingCalibrationBundle().routing_centroids;
    const benchmark = CLUSTER_CALIBRATION_BENCHMARKS[0]!;
    const result = assertClusterBenchmark(benchmark, centroids);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('skipped');
  });
});

describe('calibration dry-run ECE from label packs (SP-191)', () => {
  it('reports SAMPLE_STARVED (report-only) for tiny CI fixtures', () => {
    const rows = loadCiFixtureLabelPacks();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => isExcludedFromHoldoutEce(row))).toBe(true);

    const result = runCalibrationDryRunFromRows(rows);
    expect(result.mode).toBe('report_only_sample_starved');
    expect(result.holdout_ece_calibrated).toBeNull();
    expect(result.soft_ece_passed).toBeNull();
    expect(result.excluded_from_ece_rows).toBeGreaterThan(0);
    expect(formatCalibrationDryRunReport(result)).toContain('SAMPLE_STARVED');
  });

  it('rejects tainted pack rows via label-pack schema (never writes prompt text)', () => {
    const tainted = `${JSON.stringify({
      schema_version: 1,
      sample_id: 'bad',
      source: 'swe-gym',
      success: true,
      features: { requirement_reasoning: 0.5 },
      prompt: 'LEAKED',
    })}\n`;

    expect(() => loadLabelPackJsonl(tainted, 'tainted')).toThrow(/Tainted|forbidden/i);

    const clean = Array.from({ length: 4 }, (_, index) =>
      makePackRow(`clean-${index}`, index % 2 === 0),
    );
    const serialized = formatLabelPackJsonl(clean);
    expect(serialized).not.toMatch(/"prompt"\s*:/);
    expect(serialized).not.toContain('LEAKED');
  });

  it('reports deterministic holdout ECE on enough pack rows and excludes weak labels', () => {
    const eligible = Array.from({ length: 40 }, (_, index) =>
      makePackRow(`ece-${index}`, index % 3 !== 0, {
        features: {
          ...makePackRow(`ece-${index}`, index % 3 !== 0).features,
          triage_cyclomatic_score: index / 40,
          requirement_reasoning: (index % 5) / 5,
        },
      }),
    );
    const weak = Array.from({ length: 5 }, (_, index) =>
      makePackRow(`weak-${index}`, true, {
        source: 'twinrouterbench-weak',
        outcome_signals: ['weak_tier_proxy', 'exclude_from_holdout_ece'],
      }),
    );

    const first = runCalibrationDryRunFromRows([...eligible, ...weak]);
    const second = runCalibrationDryRunFromRows([...eligible, ...weak]);

    expect(first.mode).toBe('evaluated');
    expect(first.ece_eligible_rows).toBe(40);
    expect(first.excluded_from_ece_rows).toBe(5);
    expect(first.holdout_sample_count).toBeGreaterThan(0);
    expect(first.holdout_ece_raw).not.toBeNull();
    expect(first.holdout_ece_calibrated).not.toBeNull();
    expect(first.soft_ece_threshold).toBe(CALIBRATION_DRY_RUN_SOFT_ECE_THRESHOLD);
    expect(typeof first.soft_ece_passed).toBe('boolean');

    expect(second.holdout_ece_raw).toBe(first.holdout_ece_raw);
    expect(second.holdout_ece_calibrated).toBe(first.holdout_ece_calibrated);
    expect(labelPackRowToTrainingSample(eligible[0]!).request_id).toBe('ece-0');
  });
});
