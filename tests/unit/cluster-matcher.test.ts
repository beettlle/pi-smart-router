import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

import {
  applyPrecomputedCentroids,
  buildRoutingCentroidsArtifact,
  ClusterMatcher,
  computeCentroid,
  cosineSimilarity,
  createClusterMatcher,
  loadClusterMatcherCatalog,
  loadRoutingCentroidsArtifact,
  parseRoutingCentroidsFromBundle,
  serializeRoutingCentroidsArtifact,
  validateCentroidClusterIds,
  type ClusterMatcherConfig,
} from '../../src/domain/matching/cluster-matcher.js';
import { parseRoutingClustersYaml } from '../../src/config/routing-clusters-loader.js';
import { EMBEDDING_DIM } from '../../src/domain/matching/embedding-provider.js';
import type {
  LoadedRoutingCluster,
  RoutingClusterCatalog,
  RoutingRequest,
} from '../../src/domain/types/index.js';
import type { TextEmbedder } from '../../src/domain/matching/embedding-provider.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function unitVector(index: number, dimension = 4): Float32Array {
  const vector = new Float32Array(dimension);
  vector[index] = 1;
  return vector;
}

function blend(a: Float32Array, b: Float32Array, weightA: number): Float32Array {
  const weightB = 1 - weightA;
  const blended = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    blended[i] = a[i]! * weightA + b[i]! * weightB;
  }
  return blended;
}

function makeCluster(
  overrides: Partial<LoadedRoutingCluster> & Pick<LoadedRoutingCluster, 'id' | 'centroid'>,
): LoadedRoutingCluster {
  return {
    tier_bias: 'zero-tier',
    reference_prompts: ['reference'],
    min_similarity: 0.82,
    min_margin: 0.05,
    ...overrides,
  };
}

function makeCatalog(clusters: readonly LoadedRoutingCluster[]): RoutingClusterCatalog {
  return { clusters };
}

function makeRequest(promptText: string): RoutingRequest {
  return {
    request_id: 'req-001',
    session_id: 'sess-001',
    prompt_text: promptText,
  };
}

function makeEmbedder(
  resolver: (text: string) => Float32Array,
): TextEmbedder {
  return {
    embed: vi.fn(async (text: string) => resolver(text)),
    dispose: vi.fn(async () => {}),
  };
}

function makeMatcher(
  catalog: RoutingClusterCatalog,
  embedder: TextEmbedder,
): ClusterMatcher {
  const config: ClusterMatcherConfig = { catalog, embedder };
  return new ClusterMatcher(config);
}

const LOW_STAKES_CENTROID = unitVector(0);
const ARCHITECTURE_CENTROID = unitVector(1);
const DEEP_DEBUG_CENTROID = unitVector(2);
const MECHANICAL_EDIT_CENTROID = unitVector(3);

const EXAMPLE_CATALOG = makeCatalog([
  makeCluster({
    id: 'low_stakes_general',
    tier_bias: 'zero-tier',
    centroid: LOW_STAKES_CENTROID,
    min_similarity: 0.82,
    min_margin: 0.05,
  }),
  makeCluster({
    id: 'mechanical_edit',
    tier_bias: 'zero-tier',
    centroid: MECHANICAL_EDIT_CENTROID,
    min_similarity: 0.8,
    min_margin: 0.05,
  }),
  makeCluster({
    id: 'deep_debug',
    tier_bias: 'frontier-cloud',
    centroid: DEEP_DEBUG_CENTROID,
    min_similarity: 0.78,
    min_margin: 0.04,
  }),
  makeCluster({
    id: 'architecture',
    tier_bias: 'frontier-cloud',
    centroid: ARCHITECTURE_CENTROID,
    min_similarity: 0.78,
    min_margin: 0.04,
  }),
]);

// ─── ClusterMatcher ──────────────────────────────────────────────────────────

describe('ClusterMatcher', () => {
  describe('constructor', () => {
    it('rejects an empty catalog', () => {
      const embedder = makeEmbedder(() => unitVector(0));
      expect(
        () => new ClusterMatcher({ catalog: { clusters: [] }, embedder }),
      ).toThrow(/at least one loaded cluster/);
    });
  });

  describe('cosine similarity', () => {
    it('returns 1 for identical vectors', () => {
      const vector = unitVector(0);
      expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(cosineSimilarity(unitVector(0), unitVector(1))).toBeCloseTo(0, 5);
    });
  });

  describe('match', () => {
    it('matches "what is 2+2?" to low_stakes_general with high confidence', async () => {
      const embedder = makeEmbedder(() => blend(LOW_STAKES_CENTROID, ARCHITECTURE_CENTROID, 0.99));
      const matcher = makeMatcher(EXAMPLE_CATALOG, embedder);

      const result = await matcher.match(makeRequest('what is 2+2 ?'));

      expect(result.clusterId).toBe('low_stakes_general');
      expect(result.tierBias).toBe('zero-tier');
      expect(result.similarity).toBeGreaterThanOrEqual(0.82);
      expect(result.margin).toBeGreaterThanOrEqual(0.05);
      expect(result.confidence).toBe('high');
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('matches architecture prompts to architecture or deep_debug', async () => {
      const embedder = makeEmbedder(() =>
        blend(ARCHITECTURE_CENTROID, DEEP_DEBUG_CENTROID, 0.92),
      );
      const matcher = makeMatcher(EXAMPLE_CATALOG, embedder);

      const result = await matcher.match(
        makeRequest('architect a distributed cache layer'),
      );

      expect(['architecture', 'deep_debug']).toContain(result.clusterId);
      expect(result.tierBias).toBe('frontier-cloud');
      expect(result.similarity).toBeGreaterThanOrEqual(0.78);
    });

    it('returns confidence none when similarity is below threshold', async () => {
      const embedder = makeEmbedder(() =>
        blend(
          LOW_STAKES_CENTROID,
          blend(ARCHITECTURE_CENTROID, DEEP_DEBUG_CENTROID, 0.5),
          0.25,
        ),
      );
      const matcher = makeMatcher(EXAMPLE_CATALOG, embedder);

      const result = await matcher.match(makeRequest('ambiguous unrelated prompt'));

      expect(result.confidence).toBe('none');
      expect(result.similarity).toBeLessThan(0.78);
    });

    it('returns confidence none for ambiguous margin between top clusters', async () => {
      const ambiguousCatalog = makeCatalog([
        makeCluster({
          id: 'low_stakes_general',
          tier_bias: 'zero-tier',
          centroid: unitVector(0),
          min_similarity: 0.7,
          min_margin: 0.1,
        }),
        makeCluster({
          id: 'architecture',
          tier_bias: 'frontier-cloud',
          centroid: unitVector(1),
          min_similarity: 0.7,
          min_margin: 0.1,
        }),
      ]);
      const embedder = makeEmbedder(() => blend(unitVector(0), unitVector(1), 0.5));
      const matcher = makeMatcher(ambiguousCatalog, embedder);

      const result = await matcher.match(makeRequest('somewhat general somewhat architectural'));

      expect(result.similarity).toBeGreaterThanOrEqual(0.7);
      expect(result.margin).toBeLessThan(0.1);
      expect(result.confidence).toBe('none');
    });

    it('embeds request.prompt_text via shared embedder', async () => {
      const embedder = makeEmbedder(() => unitVector(0));
      const matcher = makeMatcher(EXAMPLE_CATALOG, embedder);

      await matcher.match(makeRequest('format this file'));

      expect(embedder.embed).toHaveBeenCalledWith('format this file');
    });

    it('throws on embedding dimension mismatch', async () => {
      const embedder = makeEmbedder(() => new Float32Array(8));
      const matcher = makeMatcher(EXAMPLE_CATALOG, embedder);

      await expect(matcher.match(makeRequest('mismatch'))).rejects.toThrow(
        /Embedding shape mismatch/,
      );
    });
  });
});

// ─── Centroid bootstrap (SP-114) ─────────────────────────────────────────────

const EXAMPLE_CATALOG_YAML = `
clusters:
  - id: low_stakes_general
    tier_bias: zero-tier
    reference_prompts:
      - "what is 2+2"
      - "define polymorphism in one sentence"
    min_similarity: 0.82
    min_margin: 0.05

  - id: architecture
    tier_bias: frontier-cloud
    reference_prompts:
      - "design a microservices migration"
    min_similarity: 0.78
    min_margin: 0.04
`;

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

describe('routing centroid bootstrap', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cluster-matcher-centroids-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('computeCentroid', () => {
    it('mean-pools embeddings to a stable centroid', () => {
      const alpha = new Float32Array([1, 0]);
      const beta = new Float32Array([0, 1]);
      const centroid = computeCentroid([alpha, beta]);

      expect(Array.from(centroid)).toEqual([0.5, 0.5]);
    });
  });

  describe('buildRoutingCentroidsArtifact', () => {
    it('produces stable centroids for known reference prompts', async () => {
      const clusters = parseRoutingClustersYaml(EXAMPLE_CATALOG_YAML);
      const embedder = createDeterministicEmbedder();
      const artifact = await buildRoutingCentroidsArtifact(clusters, embedder);

      expect(artifact.version).toBe(1);
      expect(artifact.embedding_dim).toBe(EMBEDDING_DIM);
      expect(artifact.clusters).toHaveLength(2);
      expect(artifact.clusters[0]).toMatchObject({
        cluster_id: 'low_stakes_general',
        tier_bias: 'zero-tier',
        reference_count: 2,
      });
      expect(artifact.clusters[0]!.centroid).toHaveLength(EMBEDDING_DIM);
      expect(artifact).toMatchSnapshot();
    });
  });

  describe('loadRoutingCentroidsFromCalibrationBundle', () => {
    it('loads centroids embedded in a routing-calibration bundle', () => {
      const artifact = loadRoutingCentroidsArtifact(
        join(process.cwd(), 'config/routing-centroids.json.example'),
      );
      const bundle = {
        version: 2,
        routing_centroids: artifact,
      };

      const parsed = parseRoutingCentroidsFromBundle(bundle);
      expect(parsed.clusters).toHaveLength(artifact.clusters.length);
      expect(parsed.clusters[0]!.cluster_id).toBe(artifact.clusters[0]!.cluster_id);
    });
  });

  describe('loadClusterMatcherCatalog', () => {
    it('loads precomputed centroids when artifact exists', async () => {
      const clustersPath = join(tempDir, 'clusters.yaml');
      const centroidsPath = join(tempDir, 'centroids.json');
      writeFileSync(clustersPath, EXAMPLE_CATALOG_YAML, 'utf8');

      const clusters = parseRoutingClustersYaml(EXAMPLE_CATALOG_YAML);
      const embedderForArtifact = createDeterministicEmbedder();
      const artifact = await buildRoutingCentroidsArtifact(clusters, embedderForArtifact);
      writeFileSync(centroidsPath, serializeRoutingCentroidsArtifact(artifact), 'utf8');

      const embedder = createDeterministicEmbedder();
      const catalog = await loadClusterMatcherCatalog({
        clustersFilePath: clustersPath,
        centroidsFilePath: centroidsPath,
        embedder,
      });

      expect(catalog.clusters).toHaveLength(2);
      expect(catalog.clusters[0]!.centroid).toBeInstanceOf(Float32Array);
      expect(embedder.embed).not.toHaveBeenCalled();
    });

    it('falls back to inline centroid computation when artifact is missing', async () => {
      const clustersPath = join(tempDir, 'fallback-clusters.yaml');
      const centroidsPath = join(tempDir, 'missing-centroids.json');
      writeFileSync(clustersPath, EXAMPLE_CATALOG_YAML, 'utf8');

      const embedder = createDeterministicEmbedder();
      const catalog = await loadClusterMatcherCatalog({
        clustersFilePath: clustersPath,
        centroidsFilePath: centroidsPath,
        embedder,
      });

      expect(catalog.clusters).toHaveLength(2);
      expect(embedder.embed).toHaveBeenCalled();
    });
  });

  describe('validateCentroidClusterIds', () => {
    it('rejects artifact cluster IDs that do not match the catalog', async () => {
      const clusters = parseRoutingClustersYaml(EXAMPLE_CATALOG_YAML);
      const embedder = createDeterministicEmbedder();
      const artifact = await buildRoutingCentroidsArtifact(clusters, embedder);
      const mismatched = {
        ...artifact,
        clusters: [
          ...artifact.clusters,
          {
            cluster_id: 'unknown_cluster',
            tier_bias: 'zero-tier' as const,
            centroid: artifact.clusters[0]!.centroid,
            reference_count: 1,
          },
        ],
      };

      expect(() => validateCentroidClusterIds(clusters, mismatched)).toThrow(
        /unknown cluster_id 'unknown_cluster'/,
      );
    });
  });

  describe('createClusterMatcher', () => {
    it('constructs matcher from catalog and centroids artifact', async () => {
      const clustersPath = join(tempDir, 'matcher-clusters.yaml');
      const centroidsPath = join(tempDir, 'matcher-centroids.json');
      writeFileSync(clustersPath, EXAMPLE_CATALOG_YAML, 'utf8');

      const clusters = parseRoutingClustersYaml(EXAMPLE_CATALOG_YAML);
      const embedder = createDeterministicEmbedder();
      const artifact = await buildRoutingCentroidsArtifact(clusters, embedder);
      writeFileSync(centroidsPath, serializeRoutingCentroidsArtifact(artifact), 'utf8');

      const matcher = await createClusterMatcher({
        clustersFilePath: clustersPath,
        centroidsFilePath: centroidsPath,
        embedder,
      });

      const result = await matcher.match(makeRequest('what is 2+2'));
      expect(['low_stakes_general', 'architecture']).toContain(result.clusterId);
    });
  });

  describe('loadRoutingCentroidsArtifact', () => {
    it('loads example artifact from disk', () => {
      const artifact = loadRoutingCentroidsArtifact(
        join(process.cwd(), 'config/routing-centroids.json.example'),
      );

      expect(artifact.clusters).toHaveLength(4);
      expect(artifact.clusters.map((record) => record.cluster_id)).toEqual([
        'low_stakes_general',
        'mechanical_edit',
        'deep_debug',
        'architecture',
      ]);
    });
  });

  describe('applyPrecomputedCentroids', () => {
    it('merges artifact centroids onto catalog clusters', async () => {
      const clusters = parseRoutingClustersYaml(EXAMPLE_CATALOG_YAML);
      const embedder = createDeterministicEmbedder();
      const artifact = await buildRoutingCentroidsArtifact(clusters, embedder);
      const loaded = applyPrecomputedCentroids(clusters, artifact);

      expect(loaded[0]!.min_similarity).toBe(0.82);
      expect(loaded[0]!.centroid).toBeInstanceOf(Float32Array);
    });
  });
});
