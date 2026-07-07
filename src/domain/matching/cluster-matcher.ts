/**
 * Semantic cluster matcher — SP-101, GitHub #56.
 *
 * Embeds request prompt text via shared TextEmbedder, scores cosine similarity
 * against precomputed cluster centroids, and returns best match with confidence
 * from per-cluster min_similarity and min_margin thresholds.
 */

import type { TextEmbedder } from './embedding-provider.js';
import type {
  LoadedRoutingCluster,
  RoutingClusterCatalog,
  RoutingRequest,
  Tier,
} from '../types/index.js';

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
}
