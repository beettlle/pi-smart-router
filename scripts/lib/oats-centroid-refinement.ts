/**
 * OATS (Outcome-Aware cluster centroid refinement) — SP-146, GitHub #77.
 *
 * Offline interpolation of bootstrap centroids toward cheap-tier success embeddings
 * and away from loop-escalation failure embeddings. Zero serving latency.
 *
 * ## Hyperparameters
 *
 * - **α (alpha)** — attraction strength toward the positive-set mean embedding.
 *   Default `0.15`. Higher α shifts centroids more aggressively toward historical
 *   cheap-tier successes.
 * - **β (beta)** — repulsion strength from the negative-set mean embedding.
 *   Default `0.08`. Typically β < α because false-negative loop escalations are
 *   rarer and noisier than successes.
 *
 * ## Minimum sample guards
 *
 * Per-cluster refinement is skipped unless both guards pass:
 *
 * - **min_positive_samples** (default `3`) — cheap-tier successes with embeddings
 *   assigned to the cluster.
 * - **min_negative_samples** (default `2`) — loop-escalation failures with
 *   embeddings assigned to the cluster. When negatives are below this threshold,
 *   attraction-only refinement runs (no repulsion term).
 *
 * Global guard: `MINIMUM_TRAINING_SAMPLES.routing_centroids` (10) labeled rows
 * with embeddings must be present before any cluster is refined; otherwise the
 * bootstrap artifact is returned unchanged.
 *
 * ## Interpolation (per cluster)
 *
 * Let **e** be the bootstrap centroid, **e⁺** the mean of positive embeddings,
 * and **e⁻** the mean of negative embeddings:
 *
 *   ê = (1 − α)·e + α·e⁺ − β·e⁻   (when negatives ≥ min_negative_samples)
 *   ê = (1 − α)·e + α·e⁺           (when negatives < min_negative_samples)
 *
 * Refined vectors are L2-normalized before serialization for stable cosine scoring.
 */

import { MINIMUM_TRAINING_SAMPLES } from '../calibration-aggregate.js';
import { EMBEDDING_DIM } from '../../src/domain/matching/embedding-provider.js';
import {
  computeCentroid,
  cosineSimilarity,
  type RoutingCentroidRecord,
  type RoutingCentroidsArtifact,
} from '../../src/domain/matching/cluster-matcher.js';
import { TOOL_FAILURE_CHAIN_LABEL_THRESHOLD } from '../../src/domain/routing/p-success-classifier.js';
import type { Tier } from '../../src/domain/types/index.js';

export const OATS_REFINEMENT_ARTIFACT_VERSION = 1 as const;

/** Attraction toward cheap-tier success embeddings (gemini-research §6). */
export const DEFAULT_OATS_ALPHA = 0.15;

/** Repulsion from loop-escalation failure embeddings; keep β < α. */
export const DEFAULT_OATS_BETA = 0.08;

/** Per-cluster minimum cheap-tier successes before centroid shift. */
export const DEFAULT_OATS_MIN_POSITIVE_SAMPLES = 3;

/** Per-cluster minimum loop-escalation failures before repulsion term applies. */
export const DEFAULT_OATS_MIN_NEGATIVE_SAMPLES = 2;

const CHEAP_TIERS: readonly Tier[] = ['zero-tier', 'economical-cloud'];

export interface OatsRefinementConfig {
  readonly alpha: number;
  readonly beta: number;
  readonly min_positive_samples: number;
  readonly min_negative_samples: number;
}

export interface OatsRefinementMetadata {
  readonly version: typeof OATS_REFINEMENT_ARTIFACT_VERSION;
  readonly alpha: number;
  readonly beta: number;
  readonly min_positive_samples: number;
  readonly min_negative_samples: number;
  readonly positive_sample_count: number;
  readonly negative_sample_count: number;
  readonly clusters_refined: number;
  readonly clusters_skipped: number;
}

export interface RefinedRoutingCentroidsArtifact extends RoutingCentroidsArtifact {
  readonly oats_refinement?: OatsRefinementMetadata;
}

export const DEFAULT_OATS_REFINEMENT_CONFIG: OatsRefinementConfig = {
  alpha: DEFAULT_OATS_ALPHA,
  beta: DEFAULT_OATS_BETA,
  min_positive_samples: DEFAULT_OATS_MIN_POSITIVE_SAMPLES,
  min_negative_samples: DEFAULT_OATS_MIN_NEGATIVE_SAMPLES,
};

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readEmbeddingVector(record: Record<string, unknown>): Float32Array | null {
  const raw = record.embedding;
  if (!Array.isArray(raw) || raw.length !== EMBEDDING_DIM) {
    return null;
  }
  if (!raw.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }
  return new Float32Array(raw as number[]);
}

function isCheapTier(record: Record<string, unknown>): boolean {
  const tier = record.tier;
  return typeof tier === 'string' && (CHEAP_TIERS as readonly string[]).includes(tier);
}

function parseOutcomeSignals(record: Record<string, unknown>): readonly string[] {
  const raw = record.outcome_signals;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((value): value is string => typeof value === 'string');
}

/** Loop-escalation failure labels from privacy-safe contrib scalars. */
export function isLoopEscalationFailure(record: Record<string, unknown>): boolean {
  if (record.pin_reason === 'loop_escalation') {
    return true;
  }
  if (record.stage === 'loop_escalation') {
    return true;
  }
  if (record.reason_code === 'loop_escalation') {
    return true;
  }

  const signals = parseOutcomeSignals(record);
  if (signals.includes('tool_failure_chain')) {
    return true;
  }

  const chainCount = numOrNull(record.tool_failure_chain_count);
  if (chainCount !== null && chainCount >= TOOL_FAILURE_CHAIN_LABEL_THRESHOLD) {
    return true;
  }

  return false;
}

/** Cheap-tier routing attempt that succeeded (positive OATS set). */
export function isCheapTierSuccess(record: Record<string, unknown>): boolean {
  if (!isCheapTier(record)) {
    return false;
  }
  return record.success_label === true;
}

function l2Normalize(vector: Float32Array): Float32Array {
  let magnitude = 0;
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i] ?? 0;
    magnitude += value * value;
  }

  if (magnitude === 0) {
    return vector;
  }

  const scale = 1 / Math.sqrt(magnitude);
  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = (vector[i] ?? 0) * scale;
  }
  return normalized;
}

function subtractScaled(
  target: Float32Array,
  source: Float32Array,
  scale: number,
): void {
  for (let i = 0; i < target.length; i++) {
    target[i] = (target[i] ?? 0) - scale * (source[i] ?? 0);
  }
}

function resolveClusterId(
  record: Record<string, unknown>,
  bootstrap: RoutingCentroidsArtifact,
): string | null {
  const explicit = record.cluster_id;
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit;
  }

  const embedding = readEmbeddingVector(record);
  if (embedding === null || bootstrap.clusters.length === 0) {
    return null;
  }

  let bestId: string | null = null;
  let bestSimilarity = Number.NEGATIVE_INFINITY;

  for (const cluster of bootstrap.clusters) {
    const centroid = new Float32Array(cluster.centroid);
    const similarity = cosineSimilarity(embedding, centroid);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestId = cluster.cluster_id;
    }
  }

  return bestId;
}

export interface OatsEmbeddingSets {
  readonly positiveByCluster: ReadonlyMap<string, Float32Array[]>;
  readonly negativeByCluster: ReadonlyMap<string, Float32Array[]>;
  readonly positive_sample_count: number;
  readonly negative_sample_count: number;
}

/** Partition calibration contrib rows into per-cluster positive/negative embedding sets. */
export function partitionOatsEmbeddingSets(
  records: readonly Record<string, unknown>[],
  bootstrap: RoutingCentroidsArtifact,
): OatsEmbeddingSets {
  const positiveByCluster = new Map<string, Float32Array[]>();
  const negativeByCluster = new Map<string, Float32Array[]>();
  let positive_sample_count = 0;
  let negative_sample_count = 0;

  for (const record of records) {
    const embedding = readEmbeddingVector(record);
    if (embedding === null) {
      continue;
    }

    const clusterId = resolveClusterId(record, bootstrap);
    if (clusterId === null) {
      continue;
    }

    if (isCheapTierSuccess(record)) {
      const bucket = positiveByCluster.get(clusterId) ?? [];
      bucket.push(embedding);
      positiveByCluster.set(clusterId, bucket);
      positive_sample_count++;
      continue;
    }

    if (isLoopEscalationFailure(record)) {
      const bucket = negativeByCluster.get(clusterId) ?? [];
      bucket.push(embedding);
      negativeByCluster.set(clusterId, bucket);
      negative_sample_count++;
    }
  }

  return {
    positiveByCluster,
    negativeByCluster,
    positive_sample_count,
    negative_sample_count,
  };
}

/**
 * Interpolate a single centroid toward positive mean and away from negative mean.
 * Exported for synthetic unit tests.
 */
export function interpolateOatsCentroid(
  bootstrapCentroid: readonly number[],
  positiveEmbeddings: readonly Float32Array[],
  negativeEmbeddings: readonly Float32Array[],
  config: OatsRefinementConfig = DEFAULT_OATS_REFINEMENT_CONFIG,
): Float32Array {
  const base = new Float32Array(bootstrapCentroid);
  const refined = new Float32Array(base);

  if (positiveEmbeddings.length >= config.min_positive_samples) {
    const positiveMean = computeCentroid(positiveEmbeddings);
    const oneMinusAlpha = 1 - config.alpha;

    for (let i = 0; i < refined.length; i++) {
      refined[i] =
        oneMinusAlpha * (base[i] ?? 0) + config.alpha * (positiveMean[i] ?? 0);
    }

    if (negativeEmbeddings.length >= config.min_negative_samples) {
      const negativeMean = computeCentroid(negativeEmbeddings);
      subtractScaled(refined, negativeMean, config.beta);
    }
  }

  return l2Normalize(refined);
}

function countEmbeddingsWithVectors(records: readonly Record<string, unknown>[]): number {
  return records.filter((record) => readEmbeddingVector(record) !== null).length;
}

/** Apply OATS refinement to a bootstrap centroid artifact using calibration features. */
export function refineRoutingCentroidsWithOats(
  bootstrap: RoutingCentroidsArtifact,
  records: readonly Record<string, unknown>[],
  config: OatsRefinementConfig = DEFAULT_OATS_REFINEMENT_CONFIG,
): RefinedRoutingCentroidsArtifact {
  const embeddingRows = countEmbeddingsWithVectors(records);
  if (embeddingRows < MINIMUM_TRAINING_SAMPLES.routing_centroids) {
    return { ...bootstrap };
  }

  const sets = partitionOatsEmbeddingSets(records, bootstrap);
  let clusters_refined = 0;
  let clusters_skipped = 0;

  const refinedClusters: RoutingCentroidRecord[] = bootstrap.clusters.map((cluster) => {
    const positives = sets.positiveByCluster.get(cluster.cluster_id) ?? [];
    const negatives = sets.negativeByCluster.get(cluster.cluster_id) ?? [];

    if (positives.length < config.min_positive_samples) {
      clusters_skipped++;
      return cluster;
    }

    const refinedCentroid = interpolateOatsCentroid(
      cluster.centroid,
      positives,
      negatives,
      config,
    );

    clusters_refined++;
    return {
      ...cluster,
      centroid: Array.from(refinedCentroid),
    };
  });

  if (clusters_refined === 0) {
    return { ...bootstrap };
  }

  return {
    ...bootstrap,
    clusters: refinedClusters,
    oats_refinement: {
      version: OATS_REFINEMENT_ARTIFACT_VERSION,
      alpha: config.alpha,
      beta: config.beta,
      min_positive_samples: config.min_positive_samples,
      min_negative_samples: config.min_negative_samples,
      positive_sample_count: sets.positive_sample_count,
      negative_sample_count: sets.negative_sample_count,
      clusters_refined,
      clusters_skipped,
    },
  };
}
