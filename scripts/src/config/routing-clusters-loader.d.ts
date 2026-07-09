/**
 * Routing cluster catalog loader — reads routing-clusters.yaml, validates via Zod,
 * and precomputes centroid embeddings from reference prompts at load time.
 *
 * Maps to GitHub issue #55 / SP-099.
 */
import type { RoutingCluster, RoutingClusterCatalog } from '../domain/types/index.js';
/** Prefix for cluster match reason codes (`cluster_low_stakes_general`, etc.). */
export declare const CLUSTER_REASON_CODE_PREFIX = "cluster_";
export interface TextEmbedder {
    embed(text: string): Promise<Float32Array>;
}
export interface LoadRoutingClustersOptions {
    readonly filePath?: string;
    readonly embedder: TextEmbedder;
}
export declare class RoutingClustersLoaderError extends Error {
    readonly name = "RoutingClustersLoaderError";
    constructor(message: string, options?: ErrorOptions);
}
/** Stable reason-code prefix for a cluster id. */
export declare function clusterReasonCode(clusterId: string): string;
/**
 * Parse and validate routing cluster YAML without computing centroids.
 *
 * @throws {RoutingClustersLoaderError} when validation fails.
 */
export declare function parseRoutingClustersYaml(raw: string): readonly RoutingCluster[];
/**
 * Load, validate, and precompute centroid embeddings for the routing cluster catalog.
 *
 * @throws {RoutingClustersLoaderError} when the file cannot be read or validation fails.
 */
export declare function loadRoutingClusters(options: LoadRoutingClustersOptions): Promise<RoutingClusterCatalog>;
//# sourceMappingURL=routing-clusters-loader.d.ts.map