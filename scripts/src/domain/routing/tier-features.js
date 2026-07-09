/**
 * Tier selection feature vector — SP-102, GitHub #57.
 *
 * Aggregates structural and envelope signals into a pure feature vector and
 * low-intensity score for tier gating (SP-103). No I/O.
 */
import { CYCLOMATIC_THRESHOLD } from '../triage/triage-engine.js';
// ─── Normalization constants ─────────────────────────────────────────────────
export const PROMPT_LENGTH_NORM = 8_000;
export const TOKEN_NORM = 2_000;
export const MESSAGE_COUNT_NORM = 20;
export const MAX_KEYWORD_HITS = 3;
export const DEFAULT_LOW_INTENSITY_WEIGHTS = {
    prompt_shortness: 0.06,
    token_shortness: 0.05,
    cyclomatic_low: 0.08,
    trivial_signal: 0.1,
    complex_inverse: 0.14,
    triage_verdict: 0.18,
    turn_type: 0.18,
    no_tool_context: 0.05,
    message_shallow: 0.03,
    prose_ratio: 0.03,
    requirement_low: 0.12,
    cluster_signal: 0.08,
};
const TRIAGE_VERDICT_LOW_INTENSITY = {
    trivial: 1,
    ambiguous: 0.55,
    complex: 0,
};
const TURN_TYPE_LOW_INTENSITY = {
    planning: 0,
    tool_result: 0.25,
    subagent: 0.35,
    main_loop: 0.55,
    unknown: 0.5,
};
// ─── Helpers ─────────────────────────────────────────────────────────────────
function clamp01(value) {
    if (value <= 0)
        return 0;
    if (value >= 1)
        return 1;
    return value;
}
function resolveEstimatedInputTokens(request) {
    return request.estimated_input_tokens ?? Math.ceil(request.prompt_text.length / 4);
}
function hasToolContext(request) {
    if (request.turn_type === 'tool_result') {
        return true;
    }
    return request.messages?.some((message) => message.role === 'tool') ?? false;
}
/** Ratio of fenced code block characters to total prompt length (0..1). */
export function computeCodeBlockRatio(promptText) {
    if (promptText.length === 0) {
        return 0;
    }
    let codeChars = 0;
    for (const match of promptText.matchAll(/```[\s\S]*?```/g)) {
        codeChars += match[0].length;
    }
    return clamp01(codeChars / promptText.length);
}
function resolveRequirementFields(hydraRequirements) {
    const reasoning = hydraRequirements?.reasoning ?? 0;
    const code_gen = hydraRequirements?.code_gen ?? 0;
    const tool_use = hydraRequirements?.tool_use ?? 0;
    return {
        requirement_reasoning: reasoning,
        requirement_code_gen: code_gen,
        requirement_tool_use: tool_use,
        requirement_magnitude: Math.max(reasoning, code_gen, tool_use),
    };
}
function clusterLowIntensitySignal(clusterMatch) {
    if (!clusterMatch || clusterMatch.confidence !== 'high') {
        return 0.5;
    }
    const lowStakes = clusterMatch.tierBias === 'zero-tier' ||
        clusterMatch.tierBias === 'economical-cloud';
    return lowStakes ? clusterMatch.similarity : 1 - clusterMatch.similarity;
}
function sumWeights(weights) {
    return (weights.prompt_shortness +
        weights.token_shortness +
        weights.cyclomatic_low +
        weights.trivial_signal +
        weights.complex_inverse +
        weights.triage_verdict +
        weights.turn_type +
        weights.no_tool_context +
        weights.message_shallow +
        weights.prose_ratio +
        weights.requirement_low +
        weights.cluster_signal);
}
// ─── Public API ──────────────────────────────────────────────────────────────
export function buildTierFeatures(request, triage, hydraRequirements, clusterMatch) {
    const requirements = resolveRequirementFields(hydraRequirements);
    return {
        prompt_length_chars: request.prompt_text.length,
        estimated_input_tokens: resolveEstimatedInputTokens(request),
        cyclomatic_score: triage.cyclomatic_score,
        triage_verdict: triage.verdict,
        trivial_hits: triage.trivial_hits,
        complex_hits: triage.complex_hits,
        sanitized_length_delta: triage.sanitized_length_delta,
        turn_type: request.turn_type ?? 'unknown',
        has_tool_context: hasToolContext(request),
        message_count: request.messages?.length ?? 0,
        code_block_ratio: computeCodeBlockRatio(request.prompt_text),
        ...requirements,
        cluster_similarity: clusterMatch?.similarity ?? null,
        cluster_margin: clusterMatch?.margin ?? null,
        cluster_confidence: clusterMatch?.confidence ?? null,
        cluster_id: clusterMatch?.clusterId ?? null,
        cluster_tier_bias: clusterMatch?.tierBias ?? null,
    };
}
/** Weighted combination of normalized signals; 1 = strongly low-intensity. */
export function scoreLowIntensity(features, weights = DEFAULT_LOW_INTENSITY_WEIGHTS) {
    const promptShortness = 1 - clamp01(features.prompt_length_chars / PROMPT_LENGTH_NORM);
    const tokenShortness = 1 - clamp01(features.estimated_input_tokens / TOKEN_NORM);
    const cyclomaticLow = 1 - clamp01(features.cyclomatic_score / CYCLOMATIC_THRESHOLD);
    const trivialSignal = clamp01(features.trivial_hits / MAX_KEYWORD_HITS);
    const complexInverse = 1 - clamp01(features.complex_hits / MAX_KEYWORD_HITS);
    const triageVerdictSignal = TRIAGE_VERDICT_LOW_INTENSITY[features.triage_verdict];
    const turnTypeSignal = TURN_TYPE_LOW_INTENSITY[features.turn_type];
    const noToolContext = features.has_tool_context ? 0 : 1;
    const messageShallow = 1 - clamp01(features.message_count / MESSAGE_COUNT_NORM);
    const proseRatio = 1 - features.code_block_ratio;
    const requirementLow = 1 - clamp01(features.requirement_magnitude);
    const clusterSignal = clusterLowIntensitySignal(features.cluster_similarity === null
        ? undefined
        : {
            similarity: features.cluster_similarity,
            confidence: features.cluster_confidence ?? 'none',
            tierBias: features.cluster_tier_bias ?? 'frontier-cloud',
        });
    const weighted = weights.prompt_shortness * promptShortness +
        weights.token_shortness * tokenShortness +
        weights.cyclomatic_low * cyclomaticLow +
        weights.trivial_signal * trivialSignal +
        weights.complex_inverse * complexInverse +
        weights.triage_verdict * triageVerdictSignal +
        weights.turn_type * turnTypeSignal +
        weights.no_tool_context * noToolContext +
        weights.message_shallow * messageShallow +
        weights.prose_ratio * proseRatio +
        weights.requirement_low * requirementLow +
        weights.cluster_signal * clusterSignal;
    const totalWeight = sumWeights(weights);
    if (totalWeight <= 0) {
        return 0.5;
    }
    return clamp01(weighted / totalWeight);
}
/** Map tier features to privacy-safe dataset scalars for training export. */
export function exportTierFeaturesForDataset(features, lowIntensityScore) {
    return {
        triage_trivial_hits: features.trivial_hits,
        triage_complex_hits: features.complex_hits,
        triage_sanitized_length_delta: features.sanitized_length_delta,
        code_block_ratio: features.code_block_ratio,
        requirement_magnitude: features.requirement_magnitude,
        cluster_similarity: features.cluster_similarity,
        cluster_margin: features.cluster_margin,
        low_intensity_score: lowIntensityScore,
    };
}
//# sourceMappingURL=tier-features.js.map