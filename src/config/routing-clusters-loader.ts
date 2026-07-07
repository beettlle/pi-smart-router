/**
 * Routing cluster catalog loader — reads routing-clusters.yaml, validates via Zod,
 * and precomputes centroid embeddings from reference prompts at load time.
 *
 * Maps to GitHub issue #55 / SP-099.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { RoutingClustersFileSchema } from '../domain/types/schemas.js';
import type {
  LoadedRoutingCluster,
  RoutingCluster,
  RoutingClusterCatalog,
} from '../domain/types/index.js';

/** Prefix for cluster match reason codes (`cluster_low_stakes_general`, etc.). */
export const CLUSTER_REASON_CODE_PREFIX = 'cluster_';

export interface TextEmbedder {
  embed(text: string): Promise<Float32Array>;
}

export interface LoadRoutingClustersOptions {
  readonly filePath?: string;
  readonly embedder: TextEmbedder;
}

export class RoutingClustersLoaderError extends Error {
  override readonly name = 'RoutingClustersLoaderError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Stable reason-code prefix for a cluster id. */
export function clusterReasonCode(clusterId: string): string {
  return `${CLUSTER_REASON_CODE_PREFIX}${clusterId}`;
}

function formatZodIssues(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
}

/**
 * Parse and validate routing cluster YAML without computing centroids.
 *
 * @throws {RoutingClustersLoaderError} when validation fails.
 */
export function parseRoutingClustersYaml(raw: string): readonly RoutingCluster[] {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RoutingClustersLoaderError(`Failed to parse YAML: ${message}`, { cause: err });
  }

  const result = RoutingClustersFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new RoutingClustersLoaderError(
      `Invalid routing cluster catalog:\n${formatZodIssues(result.error)}`,
      { cause: result.error },
    );
  }

  return result.data.clusters;
}

function computeCentroid(embeddings: readonly Float32Array[]): Float32Array {
  if (embeddings.length === 0) {
    throw new RoutingClustersLoaderError('Cannot compute centroid from zero embeddings');
  }

  const dim = embeddings[0]!.length;
  const centroid = new Float32Array(dim);

  for (const embedding of embeddings) {
    if (embedding.length !== dim) {
      throw new RoutingClustersLoaderError(
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

async function loadClusterCentroids(
  clusters: readonly RoutingCluster[],
  embedder: TextEmbedder,
): Promise<readonly LoadedRoutingCluster[]> {
  const loaded: LoadedRoutingCluster[] = [];

  for (const cluster of clusters) {
    const embeddings: Float32Array[] = [];
    for (const prompt of cluster.reference_prompts) {
      embeddings.push(await embedder.embed(prompt));
    }

    loaded.push({
      ...cluster,
      centroid: computeCentroid(embeddings),
    });
  }

  return loaded;
}

/**
 * Load, validate, and precompute centroid embeddings for the routing cluster catalog.
 *
 * @throws {RoutingClustersLoaderError} when the file cannot be read or validation fails.
 */
export async function loadRoutingClusters(
  options: LoadRoutingClustersOptions,
): Promise<RoutingClusterCatalog> {
  const filePath = options.filePath ?? resolve('config', 'routing-clusters.yaml');

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RoutingClustersLoaderError(
      `Failed to read routing clusters file: ${message}`,
      { cause: err },
    );
  }

  const clusters = parseRoutingClustersYaml(raw);
  const loaded = await loadClusterCentroids(clusters, options.embedder);

  return { clusters: loaded };
}
