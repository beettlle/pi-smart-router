/**
 * Semantic cluster matcher — SP-101, GitHub #56.
 *
 * Embeds request prompt text via shared TextEmbedder, scores cosine similarity
 * against precomputed cluster centroids, and returns best match with confidence
 * from per-cluster min_similarity and min_margin thresholds.
 *
 * Centroids load from `config/routing-centroids.json` at startup when present;
 * otherwise they are computed inline from reference prompts (SP-114).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  loadRoutingClusters,
  parseRoutingClustersYaml,
} from '../../config/routing-clusters-loader.js';
import { EMBEDDING_DIM, type TextEmbedder } from './embedding-provider.js';
import type {
  ClusterMatchTableEntry,
  LoadedRoutingCluster,
  RoutingCluster,
  RoutingClusterCatalog,
  RoutingRequest,
  Tier,
} from '../types/index.js';

// ─── Precomputed centroid artifact (SP-114) ──────────────────────────────────

export const DEFAULT_ROUTING_CENTROIDS_PATH = 'config/routing-centroids.json';

export interface RoutingCentroidRecord {
  readonly cluster_id: string;
  readonly tier_bias: Tier;
  readonly centroid: readonly number[];
  readonly reference_count: number;
}

export interface RoutingCentroidsArtifact {
  readonly version: number;
  readonly embedding_dim: number;
  readonly clusters: readonly RoutingCentroidRecord[];
}

export class RoutingCentroidsError extends Error {
  override readonly name = 'RoutingCentroidsError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export function computeCentroid(embeddings: readonly Float32Array[]): Float32Array {
  if (embeddings.length === 0) {
    throw new RoutingCentroidsError('Cannot compute centroid from zero embeddings');
  }

  const dim = embeddings[0]!.length;
  const centroid = new Float32Array(dim);

  for (const embedding of embeddings) {
    if (embedding.length !== dim) {
      throw new RoutingCentroidsError(
        `Embedding shape mismatch: expected ${dim}, got ${embedding.length}`,
      );
    }
    for (let i = 0; i < dim; i++) {
      centroid[i] = (centroid[i] ?? 0) + (embedding[i] ?? 0);
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] = (centroid[i] ?? 0) / embeddings.length;
  }

  return centroid;
}

function parseRoutingCentroidsArtifact(parsed: unknown): RoutingCentroidsArtifact {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new RoutingCentroidsError('Invalid routing centroids artifact: expected object');
  }

  const record = parsed as Record<string, unknown>;
  const version = record.version;
  const embeddingDim = record.embedding_dim;
  const clusters = record.clusters;

  if (version !== 1) {
    throw new RoutingCentroidsError(
      `Unsupported routing centroids version: ${String(version)}`,
    );
  }
  if (embeddingDim !== EMBEDDING_DIM) {
    throw new RoutingCentroidsError(
      `Invalid embedding_dim: expected ${EMBEDDING_DIM}, got ${String(embeddingDim)}`,
    );
  }
  if (!Array.isArray(clusters) || clusters.length === 0) {
    throw new RoutingCentroidsError('Invalid routing centroids artifact: clusters required');
  }

  const parsedClusters: RoutingCentroidRecord[] = [];
  for (const entry of clusters) {
    if (typeof entry !== 'object' || entry === null) {
      throw new RoutingCentroidsError('Invalid cluster entry in routing centroids artifact');
    }
    const cluster = entry as Record<string, unknown>;
    const clusterId = cluster.cluster_id;
    const tierBias = cluster.tier_bias;
    const centroid = cluster.centroid;
    const referenceCount = cluster.reference_count;

    if (typeof clusterId !== 'string' || clusterId.length === 0) {
      throw new RoutingCentroidsError('Invalid cluster_id in routing centroids artifact');
    }
    if (
      tierBias !== 'zero-tier' &&
      tierBias !== 'economical-cloud' &&
      tierBias !== 'frontier-cloud'
    ) {
      throw new RoutingCentroidsError(
        `Invalid tier_bias for cluster '${clusterId}': ${String(tierBias)}`,
      );
    }
    if (!Array.isArray(centroid) || centroid.length !== EMBEDDING_DIM) {
      throw new RoutingCentroidsError(
        `Invalid centroid for cluster '${clusterId}': expected ${EMBEDDING_DIM} dimensions`,
      );
    }
    if (
      !centroid.every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      throw new RoutingCentroidsError(
        `Invalid centroid values for cluster '${clusterId}': must be finite numbers`,
      );
    }
    if (typeof referenceCount !== 'number' || !Number.isInteger(referenceCount) || referenceCount < 1) {
      throw new RoutingCentroidsError(
        `Invalid reference_count for cluster '${clusterId}'`,
      );
    }

    parsedClusters.push({
      cluster_id: clusterId,
      tier_bias: tierBias,
      centroid,
      reference_count: referenceCount,
    });
  }

  return {
    version: 1,
    embedding_dim: EMBEDDING_DIM,
    clusters: parsedClusters,
  };
}

export const DEFAULT_ROUTING_CALIBRATION_PATH = resolve('config', 'routing-calibration.json');

export interface LoadRoutingCentroidsFromBundleOptions {
  readonly filePath?: string;
}

/** Extract routing_centroids from a routing-calibration bundle object (SP-147). */
export function parseRoutingCentroidsFromBundle(parsed: unknown): RoutingCentroidsArtifact {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new RoutingCentroidsError('Routing calibration bundle must be a JSON object');
  }

  const centroids = (parsed as Record<string, unknown>).routing_centroids;
  if (centroids === undefined) {
    throw new RoutingCentroidsError('Routing calibration bundle missing routing_centroids');
  }

  return parseRoutingCentroidsArtifact(centroids);
}

/**
 * Load cluster centroids from routing-calibration.json (OATS-refined when present).
 * Returns null when the bundle file is missing.
 */
export function loadRoutingCentroidsFromCalibrationBundle(
  options?: LoadRoutingCentroidsFromBundleOptions,
): RoutingCentroidsArtifact | null {
  const filePath = options?.filePath ?? DEFAULT_ROUTING_CALIBRATION_PATH;

  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RoutingCentroidsError(`Failed to read routing calibration file: ${message}`, {
      cause: err,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RoutingCentroidsError(`Failed to parse routing calibration JSON: ${message}`, {
      cause: err,
    });
  }

  return parseRoutingCentroidsFromBundle(parsed);
}

/** Resolve centroids for serve time — calibration bundle preferred, then standalone file. */
export function resolveRoutingCentroidsArtifact(options?: {
  readonly routingCalibrationPath?: string;
  readonly centroidsFilePath?: string;
}): RoutingCentroidsArtifact | null {
  const calibrationPath = options?.routingCalibrationPath ?? DEFAULT_ROUTING_CALIBRATION_PATH;
  const centroidsPath = options?.centroidsFilePath ?? resolve(DEFAULT_ROUTING_CENTROIDS_PATH);

  try {
    const fromBundle = loadRoutingCentroidsFromCalibrationBundle({ filePath: calibrationPath });
    if (fromBundle !== null) {
      return fromBundle;
    }
  } catch (err: unknown) {
    console.warn('Routing calibration centroids invalid; falling back to standalone artifact', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    return loadRoutingCentroidsArtifact(centroidsPath);
  } catch (err: unknown) {
    if (isMissingCentroidsFileError(err)) {
      return null;
    }
    throw err;
  }
}

export function loadRoutingCentroidsArtifact(
  filePath: string = resolve(DEFAULT_ROUTING_CENTROIDS_PATH),
): RoutingCentroidsArtifact {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RoutingCentroidsError(
      `Failed to read routing centroids file: ${message}`,
      { cause: err },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RoutingCentroidsError(`Failed to parse routing centroids JSON: ${message}`, {
      cause: err,
    });
  }

  return parseRoutingCentroidsArtifact(parsed);
}

export function validateCentroidClusterIds(
  catalogClusters: readonly RoutingCluster[],
  artifact: RoutingCentroidsArtifact,
): void {
  const catalogIds = new Set(catalogClusters.map((cluster) => cluster.id));
  const artifactIds = new Set(artifact.clusters.map((cluster) => cluster.cluster_id));

  for (const id of catalogIds) {
    if (!artifactIds.has(id)) {
      throw new RoutingCentroidsError(
        `Routing centroids artifact missing cluster_id '${id}' from catalog`,
      );
    }
  }

  for (const id of artifactIds) {
    if (!catalogIds.has(id)) {
      throw new RoutingCentroidsError(
        `Routing centroids artifact has unknown cluster_id '${id}'`,
      );
    }
  }

  const catalogById = new Map(catalogClusters.map((cluster) => [cluster.id, cluster]));
  for (const record of artifact.clusters) {
    const catalogCluster = catalogById.get(record.cluster_id)!;
    if (catalogCluster.tier_bias !== record.tier_bias) {
      throw new RoutingCentroidsError(
        `tier_bias mismatch for cluster '${record.cluster_id}': catalog=${catalogCluster.tier_bias}, artifact=${record.tier_bias}`,
      );
    }
    if (catalogCluster.reference_prompts.length !== record.reference_count) {
      throw new RoutingCentroidsError(
        `reference_count mismatch for cluster '${record.cluster_id}': catalog=${catalogCluster.reference_prompts.length}, artifact=${record.reference_count}`,
      );
    }
  }
}

export function applyPrecomputedCentroids(
  catalogClusters: readonly RoutingCluster[],
  artifact: RoutingCentroidsArtifact,
): readonly LoadedRoutingCluster[] {
  validateCentroidClusterIds(catalogClusters, artifact);

  const centroidById = new Map(
    artifact.clusters.map((record) => [
      record.cluster_id,
      new Float32Array(record.centroid),
    ]),
  );

  return catalogClusters.map((cluster) => ({
    ...cluster,
    centroid: centroidById.get(cluster.id)!,
  }));
}

export async function buildRoutingCentroidsArtifact(
  catalogClusters: readonly RoutingCluster[],
  embedder: TextEmbedder,
): Promise<RoutingCentroidsArtifact> {
  const clusters: RoutingCentroidRecord[] = [];

  for (const cluster of catalogClusters) {
    const embeddings: Float32Array[] = [];
    for (const prompt of cluster.reference_prompts) {
      embeddings.push(await embedder.embed(prompt));
    }

    clusters.push({
      cluster_id: cluster.id,
      tier_bias: cluster.tier_bias,
      centroid: Array.from(computeCentroid(embeddings)),
      reference_count: cluster.reference_prompts.length,
    });
  }

  return {
    version: 1,
    embedding_dim: EMBEDDING_DIM,
    clusters,
  };
}

export function serializeRoutingCentroidsArtifact(
  artifact: RoutingCentroidsArtifact,
): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export interface CreateClusterMatcherOptions {
  readonly clustersFilePath?: string;
  readonly centroidsFilePath?: string;
  /** When set, loads OATS-refined centroids from routing-calibration.json (SP-147). */
  readonly routingCalibrationPath?: string;
  readonly embedder: TextEmbedder;
}

function isMissingCentroidsFileError(err: unknown): boolean {
  return (
    err instanceof RoutingCentroidsError &&
    err.cause instanceof Error &&
    'code' in err.cause &&
    err.cause.code === 'ENOENT'
  );
}

/**
 * Load routing cluster catalog with precomputed centroids when the artifact exists.
 * Falls back to inline centroid computation from reference prompts when missing.
 */
export async function loadClusterMatcherCatalog(
  options: CreateClusterMatcherOptions,
): Promise<RoutingClusterCatalog> {
  const clustersFilePath =
    options.clustersFilePath ?? resolve('config', 'routing-clusters.yaml');
  const centroidsFilePath =
    options.centroidsFilePath ?? resolve(DEFAULT_ROUTING_CENTROIDS_PATH);

  const raw = readFileSync(clustersFilePath, 'utf8');
  const catalogClusters = parseRoutingClustersYaml(raw);

  const artifact = resolveRoutingCentroidsArtifact({
    ...(options.routingCalibrationPath !== undefined
      ? { routingCalibrationPath: options.routingCalibrationPath }
      : {}),
    centroidsFilePath,
  });

  if (artifact !== null) {
    return { clusters: applyPrecomputedCentroids(catalogClusters, artifact) };
  }

  return loadRoutingClusters({
    filePath: clustersFilePath,
    embedder: options.embedder,
  });
}

export async function createClusterMatcher(
  options: CreateClusterMatcherOptions,
): Promise<ClusterMatcher> {
  const catalog = await loadClusterMatcherCatalog(options);
  return new ClusterMatcher({ catalog, embedder: options.embedder });
}

// ─── Match result ────────────────────────────────────────────────────────────

export type ClusterMatchConfidence = 'high' | 'low' | 'none';

export interface ClusterMatchResult {
  readonly clusterId: string;
  readonly tierBias: Tier;
  readonly similarity: number;
  /** sim(best) - sim(second); 0 when only one cluster exists. */
  readonly margin: number;
  readonly confidence: ClusterMatchConfidence;
  readonly elapsedMs: number;
}

// ─── Scoring helpers ─────────────────────────────────────────────────────────

interface RankedCluster {
  readonly cluster: LoadedRoutingCluster;
  readonly similarity: number;
}

/** Assign an embedding to the nearest cluster centroid by cosine similarity. */
export function assignClusterByCentroids(
  artifact: RoutingCentroidsArtifact,
  embedding: Float32Array,
): { readonly cluster_id: string; readonly similarity: number } {
  let bestId = artifact.clusters[0]!.cluster_id;
  let bestSimilarity = Number.NEGATIVE_INFINITY;

  for (const cluster of artifact.clusters) {
    const similarity = cosineSimilarity(embedding, new Float32Array(cluster.centroid));
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestId = cluster.cluster_id;
    }
  }

  return { cluster_id: bestId, similarity: bestSimilarity };
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embedding shape mismatch: expected ${a.length}, got ${b.length}`,
    );
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function rankClusters(
  embedding: Float32Array,
  clusters: readonly LoadedRoutingCluster[],
): readonly RankedCluster[] {
  return clusters
    .map((cluster) => ({
      cluster,
      similarity: cosineSimilarity(embedding, cluster.centroid),
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

function computeConfidence(
  similarity: number,
  margin: number,
  minSimilarity: number,
  minMargin: number,
): ClusterMatchConfidence {
  if (similarity >= minSimilarity && margin >= minMargin) {
    return 'high';
  }
  // Issue #56: low-confidence matches defer — report none for routing.
  return 'none';
}

// ─── ClusterMatcher ──────────────────────────────────────────────────────────

export interface ClusterMatcherConfig {
  readonly catalog: RoutingClusterCatalog;
  readonly embedder: TextEmbedder;
}

export class ClusterMatcher {
  private readonly clusters: readonly LoadedRoutingCluster[];
  private readonly embedder: TextEmbedder;

  constructor(config: ClusterMatcherConfig) {
    if (config.catalog.clusters.length === 0) {
      throw new Error('ClusterMatcher requires at least one loaded cluster');
    }
    this.clusters = config.catalog.clusters;
    this.embedder = config.embedder;
  }

  async match(request: RoutingRequest): Promise<ClusterMatchResult> {
    const start = performance.now();

    const embedding = await this.embedder.embed(request.prompt_text);
    const ranked = rankClusters(embedding, this.clusters);
    const best = ranked[0]!;
    const runnerUp = ranked[1];
    const margin = runnerUp
      ? best.similarity - runnerUp.similarity
      : 0;

    const confidence = computeConfidence(
      best.similarity,
      margin,
      best.cluster.min_similarity,
      best.cluster.min_margin,
    );

    return {
      clusterId: best.cluster.id,
      tierBias: best.cluster.tier_bias,
      similarity: best.similarity,
      margin,
      confidence,
      elapsedMs: performance.now() - start,
    };
  }

  /** Score all cluster centroids for explain / telemetry tables (SP-113). */
  async matchTable(request: RoutingRequest): Promise<readonly ClusterMatchTableEntry[]> {
    const embedding = await this.embedder.embed(request.prompt_text);
    const ranked = rankClusters(embedding, this.clusters);
    const best = ranked[0];

    return ranked.map((entry, index) => {
      const runnerUp = ranked[index + 1];
      const margin = runnerUp ? entry.similarity - runnerUp.similarity : null;
      const confidence = computeConfidence(
        entry.similarity,
        index === 0 ? (margin ?? 0) : 0,
        entry.cluster.min_similarity,
        entry.cluster.min_margin,
      );

      return {
        cluster_id: entry.cluster.id,
        tier_bias: entry.cluster.tier_bias,
        similarity: entry.similarity,
        margin: index === 0 ? margin : null,
        confidence: confidence === 'high' ? 'high' : 'none',
        selected: entry === best,
      };
    });
  }
}
