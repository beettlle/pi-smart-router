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
import { CYCLOMATIC_THRESHOLD } from '../triage/triage-engine.js';

// ─── Normalization constants ─────────────────────────────────────────────────

export const PROMPT_LENGTH_NORM = 8_000;
export const TOKEN_NORM = 2_000;
export const MESSAGE_COUNT_NORM = 20;
export const MAX_KEYWORD_HITS = 3;

// ─── Feature vector ──────────────────────────────────────────────────────────

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

// ─── Low-intensity weights ─────────────────────────────────────────────────────

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

export const DEFAULT_LOW_INTENSITY_WEIGHTS: Readonly<LowIntensityWeights> = {
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
} as const;

const TRIAGE_VERDICT_LOW_INTENSITY: Readonly<Record<TriageVerdict, number>> = {
  trivial: 1,
  ambiguous: 0.55,
  complex: 0,
};

const TURN_TYPE_LOW_INTENSITY: Readonly<Record<TurnType, number>> = {
  planning: 0,
  tool_result: 0.25,
  subagent: 0.35,
  main_loop: 0.55,
  unknown: 0.5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function resolveEstimatedInputTokens(request: RoutingRequest): number {
  return request.estimated_input_tokens ?? Math.ceil(request.prompt_text.length / 4);
}

function hasToolContext(request: RoutingRequest): boolean {
  if (request.turn_type === 'tool_result') {
    return true;
  }

  return request.messages?.some((message) => message.role === 'tool') ?? false;
}

/** Ratio of fenced code block characters to total prompt length (0..1). */
export function computeCodeBlockRatio(promptText: string): number {
  if (promptText.length === 0) {
    return 0;
  }

  let codeChars = 0;
  for (const match of promptText.matchAll(/```[\s\S]*?```/g)) {
    codeChars += match[0].length;
  }

  return clamp01(codeChars / promptText.length);
}

function resolveRequirementFields(
  hydraRequirements: RequirementVector | undefined,
): Pick<
  TierFeatureVector,
  | 'requirement_reasoning'
  | 'requirement_code_gen'
  | 'requirement_tool_use'
  | 'requirement_magnitude'
> {
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

function clusterLowIntensitySignal(
  clusterMatch: Pick<
    ClusterMatchResult,
    'confidence' | 'similarity' | 'tierBias'
  > | undefined,
): number {
  if (!clusterMatch || clusterMatch.confidence !== 'high') {
    return 0.5;
  }

  const lowStakes =
    clusterMatch.tierBias === 'zero-tier' ||
    clusterMatch.tierBias === 'economical-cloud';

  return lowStakes ? clusterMatch.similarity : 1 - clusterMatch.similarity;
}

function sumWeights(weights: LowIntensityWeights): number {
  return (
    weights.prompt_shortness +
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
    weights.cluster_signal
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function buildTierFeatures(
  request: RoutingRequest,
  triage: TriageResult,
  hydraRequirements?: RequirementVector,
  clusterMatch?: ClusterMatchResult,
): TierFeatureVector {
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
export function scoreLowIntensity(
  features: TierFeatureVector,
  weights: LowIntensityWeights = DEFAULT_LOW_INTENSITY_WEIGHTS,
): number {
  const promptShortness = 1 - clamp01(features.prompt_length_chars / PROMPT_LENGTH_NORM);
  const tokenShortness =
    1 - clamp01(features.estimated_input_tokens / TOKEN_NORM);
  const cyclomaticLow =
    1 - clamp01(features.cyclomatic_score / CYCLOMATIC_THRESHOLD);
  const trivialSignal = clamp01(features.trivial_hits / MAX_KEYWORD_HITS);
  const complexInverse = 1 - clamp01(features.complex_hits / MAX_KEYWORD_HITS);
  const triageVerdictSignal = TRIAGE_VERDICT_LOW_INTENSITY[features.triage_verdict];
  const turnTypeSignal = TURN_TYPE_LOW_INTENSITY[features.turn_type];
  const noToolContext = features.has_tool_context ? 0 : 1;
  const messageShallow =
    1 - clamp01(features.message_count / MESSAGE_COUNT_NORM);
  const proseRatio = 1 - features.code_block_ratio;
  const requirementLow = 1 - clamp01(features.requirement_magnitude);
  const clusterSignal = clusterLowIntensitySignal(
    features.cluster_similarity === null
      ? undefined
      : {
          similarity: features.cluster_similarity,
          confidence: features.cluster_confidence ?? 'none',
          tierBias: features.cluster_tier_bias ?? 'frontier-cloud',
        },
  );

  const weighted =
    weights.prompt_shortness * promptShortness +
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
export function exportTierFeaturesForDataset(
  features: TierFeatureVector,
  lowIntensityScore: number,
): TierFeatureDatasetScalars {
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
