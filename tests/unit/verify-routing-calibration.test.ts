import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import { MINIMUM_TRAINING_SAMPLES } from '../../scripts/calibration-aggregate.js';
import { refineRoutingCentroidsWithOats } from '../../scripts/lib/oats-centroid-refinement.js';
import {
  createDefaultRoutingCalibrationBundle,
  HYDRA_PREFIX_SCHEMA_VERSION,
  serializeRoutingCalibrationBundle,
  trainRoutingCalibrationBundle,
} from '../../scripts/train-routing-calibration.js';
import {
  assertClusterBenchmark,
  CLUSTER_CALIBRATION_BENCHMARKS,
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
