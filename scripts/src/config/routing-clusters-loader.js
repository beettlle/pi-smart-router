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
/** Prefix for cluster match reason codes (`cluster_low_stakes_general`, etc.). */
export const CLUSTER_REASON_CODE_PREFIX = 'cluster_';
export class RoutingClustersLoaderError extends Error {
    name = 'RoutingClustersLoaderError';
    constructor(message, options) {
        super(message, options);
    }
}
/** Stable reason-code prefix for a cluster id. */
export function clusterReasonCode(clusterId) {
    return `${CLUSTER_REASON_CODE_PREFIX}${clusterId}`;
}
function formatZodIssues(error) {
    return error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
}
/**
 * Parse and validate routing cluster YAML without computing centroids.
 *
 * @throws {RoutingClustersLoaderError} when validation fails.
 */
export function parseRoutingClustersYaml(raw) {
    let parsed;
    try {
        parsed = parseYaml(raw);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new RoutingClustersLoaderError(`Failed to parse YAML: ${message}`, { cause: err });
    }
    const result = RoutingClustersFileSchema.safeParse(parsed);
    if (!result.success) {
        throw new RoutingClustersLoaderError(`Invalid routing cluster catalog:\n${formatZodIssues(result.error)}`, { cause: result.error });
    }
    return result.data.clusters;
}
function computeCentroid(embeddings) {
    if (embeddings.length === 0) {
        throw new RoutingClustersLoaderError('Cannot compute centroid from zero embeddings');
    }
    const dim = embeddings[0].length;
    const centroid = new Float32Array(dim);
    for (const embedding of embeddings) {
        if (embedding.length !== dim) {
            throw new RoutingClustersLoaderError(`Embedding shape mismatch: expected ${dim}, got ${embedding.length}`);
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
async function loadClusterCentroids(clusters, embedder) {
    const loaded = [];
    for (const cluster of clusters) {
        const embeddings = [];
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
export async function loadRoutingClusters(options) {
    const filePath = options.filePath ?? resolve('config', 'routing-clusters.yaml');
    let raw;
    try {
        raw = readFileSync(filePath, 'utf8');
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new RoutingClustersLoaderError(`Failed to read routing clusters file: ${message}`, { cause: err });
    }
    const clusters = parseRoutingClustersYaml(raw);
    const loaded = await loadClusterCentroids(clusters, options.embedder);
    return { clusters: loaded };
}
//# sourceMappingURL=routing-clusters-loader.js.map