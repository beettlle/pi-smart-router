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
import { type TextEmbedder } from './embedding-provider.js';
import type { ClusterMatchTableEntry, LoadedRoutingCluster, RoutingCluster, RoutingClusterCatalog, RoutingRequest, Tier } from '../types/index.js';
export declare const DEFAULT_ROUTING_CENTROIDS_PATH = "config/routing-centroids.json";
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
export declare class RoutingCentroidsError extends Error {
    readonly name = "RoutingCentroidsError";
    constructor(message: string, options?: ErrorOptions);
}
export declare function computeCentroid(embeddings: readonly Float32Array[]): Float32Array;
export declare function loadRoutingCentroidsArtifact(filePath?: string): RoutingCentroidsArtifact;
export declare function validateCentroidClusterIds(catalogClusters: readonly RoutingCluster[], artifact: RoutingCentroidsArtifact): void;
export declare function applyPrecomputedCentroids(catalogClusters: readonly RoutingCluster[], artifact: RoutingCentroidsArtifact): readonly LoadedRoutingCluster[];
export declare function buildRoutingCentroidsArtifact(catalogClusters: readonly RoutingCluster[], embedder: TextEmbedder): Promise<RoutingCentroidsArtifact>;
export declare function serializeRoutingCentroidsArtifact(artifact: RoutingCentroidsArtifact): string;
export interface CreateClusterMatcherOptions {
    readonly clustersFilePath?: string;
    readonly centroidsFilePath?: string;
    readonly embedder: TextEmbedder;
}
/**
 * Load routing cluster catalog with precomputed centroids when the artifact exists.
 * Falls back to inline centroid computation from reference prompts when missing.
 */
export declare function loadClusterMatcherCatalog(options: CreateClusterMatcherOptions): Promise<RoutingClusterCatalog>;
export declare function createClusterMatcher(options: CreateClusterMatcherOptions): Promise<ClusterMatcher>;
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
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
export interface ClusterMatcherConfig {
    readonly catalog: RoutingClusterCatalog;
    readonly embedder: TextEmbedder;
}
export declare class ClusterMatcher {
    private readonly clusters;
    private readonly embedder;
    constructor(config: ClusterMatcherConfig);
    match(request: RoutingRequest): Promise<ClusterMatchResult>;
    /** Score all cluster centroids for explain / telemetry tables (SP-113). */
    matchTable(request: RoutingRequest): Promise<readonly ClusterMatchTableEntry[]>;
}
//# sourceMappingURL=cluster-matcher.d.ts.map