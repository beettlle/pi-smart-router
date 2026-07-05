/**
 * HyDRA embedding matcher — T048, FR-005.
 *
 * Embeds prompt text via ONNX (Xenova/all-MiniLM-L6-v2 384-dim),
 * projects to requirement dimensions [reasoning, code_gen, tool_use],
 * and scores fleet candidates with a shortfall gate.
 *
 * Shortfall gate (data-model §Validation): candidate excluded when
 * any capability dimension shortfall > 0 (quality parity).
 *
 * Budget: 80–120 ms (configurable, default 100 ms).
 */
import type { CandidateScore, ModelProfile, RoutingRequest } from '../types/index.js';
export interface RequirementVector {
    readonly reasoning: number;
    readonly code_gen: number;
    readonly tool_use: number;
}
export interface EmbeddingProvider {
    extractRequirements(text: string): Promise<RequirementVector>;
    dispose(): Promise<void>;
}
export interface MatchResult {
    readonly selected: CandidateScore | null;
    readonly candidates: readonly CandidateScore[];
    readonly requirements: RequirementVector;
    readonly elapsedMs: number;
    readonly budgetExceeded: boolean;
}
export interface HydraMatcherConfig {
    readonly artifactCachePath: string;
    readonly budgetMs?: number;
}
/**
 * Fixed deterministic projection from 384-dim embedding to 3 requirement
 * dimensions via mean-pooled thirds + sigmoid normalization.
 *
 * Production refinement: replace with a learned linear projection loaded
 * from artifact cache (Phase 2).
 */
export declare function projectToRequirements(embedding: Float32Array): RequirementVector;
export declare class HydraMatcher {
    private readonly provider;
    private readonly budgetMs;
    constructor(provider: EmbeddingProvider, config: HydraMatcherConfig);
    match(request: RoutingRequest, fleet: readonly ModelProfile[]): Promise<MatchResult>;
    dispose(): Promise<void>;
    private validateRequirements;
}
/**
 * Creates an EmbeddingProvider backed by @huggingface/transformers ONNX runtime.
 * Model: Xenova/all-MiniLM-L6-v2 (384-dim).
 *
 * The package is loaded dynamically — not required at compile time.
 * Install: `npm i @huggingface/transformers`
 */
export declare function createOnnxEmbeddingProvider(artifactCachePath: string): Promise<EmbeddingProvider>;
//# sourceMappingURL=hydra-matcher.d.ts.map