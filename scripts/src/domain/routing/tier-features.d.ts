/**
 * Tier selection feature vector — SP-102, GitHub #57.
 *
 * Aggregates structural and envelope signals into a pure feature vector and
 * low-intensity score for tier gating (SP-103). No I/O.
 */
import type { ClusterMatchResult } from '../matching/cluster-matcher.js';
import type { RequirementVector } from '../types/entities.js';
import type { RoutingRequest, Tier, TurnType } from '../types/index.js';
import type { TriageResult, TriageVerdict } from '../triage/triage-engine.js';
export declare const PROMPT_LENGTH_NORM = 8000;
export declare const TOKEN_NORM = 2000;
export declare const MESSAGE_COUNT_NORM = 20;
export declare const MAX_KEYWORD_HITS = 3;
export interface TierFeatureVector {
    readonly prompt_length_chars: number;
    readonly estimated_input_tokens: number;
    readonly cyclomatic_score: number;
    readonly triage_verdict: TriageVerdict;
    readonly trivial_hits: number;
    readonly complex_hits: number;
    readonly sanitized_length_delta: number;
    readonly turn_type: TurnType;
    readonly has_tool_context: boolean;
    readonly message_count: number;
    readonly code_block_ratio: number;
    readonly requirement_reasoning: number;
    readonly requirement_code_gen: number;
    readonly requirement_tool_use: number;
    readonly requirement_magnitude: number;
    readonly cluster_similarity: number | null;
    readonly cluster_margin: number | null;
    readonly cluster_confidence: ClusterMatchResult['confidence'] | null;
    readonly cluster_id: string | null;
    readonly cluster_tier_bias: Tier | null;
}
/** Scalar tier features safe for dataset export (no prompt text). */
export interface TierFeatureDatasetScalars {
    readonly triage_trivial_hits: number;
    readonly triage_complex_hits: number;
    readonly triage_sanitized_length_delta: number;
    readonly code_block_ratio: number;
    readonly requirement_magnitude: number;
    readonly cluster_similarity: number | null;
    readonly cluster_margin: number | null;
    readonly low_intensity_score: number;
}
export interface LowIntensityWeights {
    readonly prompt_shortness: number;
    readonly token_shortness: number;
    readonly cyclomatic_low: number;
    readonly trivial_signal: number;
    readonly complex_inverse: number;
    readonly triage_verdict: number;
    readonly turn_type: number;
    readonly no_tool_context: number;
    readonly message_shallow: number;
    readonly prose_ratio: number;
    readonly requirement_low: number;
    readonly cluster_signal: number;
}
export declare const DEFAULT_LOW_INTENSITY_WEIGHTS: Readonly<LowIntensityWeights>;
/** Ratio of fenced code block characters to total prompt length (0..1). */
export declare function computeCodeBlockRatio(promptText: string): number;
export declare function buildTierFeatures(request: RoutingRequest, triage: TriageResult, hydraRequirements?: RequirementVector, clusterMatch?: ClusterMatchResult): TierFeatureVector;
/** Weighted combination of normalized signals; 1 = strongly low-intensity. */
export declare function scoreLowIntensity(features: TierFeatureVector, weights?: LowIntensityWeights): number;
/** Map tier features to privacy-safe dataset scalars for training export. */
export declare function exportTierFeaturesForDataset(features: TierFeatureVector, lowIntensityScore: number): TierFeatureDatasetScalars;
//# sourceMappingURL=tier-features.d.ts.map