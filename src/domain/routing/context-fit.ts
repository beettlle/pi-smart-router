/**
 * Context-fit gate — SP-093.
 *
 * Filters fleet models whose context window cannot accommodate the estimated
 * input token count (with a configurable safety margin).
 */

import type {
  CandidateScore,
  ModelProfile,
  RoutingRequest,
} from '../types/index.js';

export const CONTEXT_FIT_EXCEEDED = 'context_fit_exceeded' as const;

export const DEFAULT_CONTEXT_FIT_SAFETY_MARGIN = 0.9;

export const CONTEXT_FIT_SAFETY_MARGIN_ENV = 'CONTEXT_FIT_SAFETY_MARGIN';

export interface ContextFitConfig {
  /** Fraction of max_input_tokens treated as usable (default 0.90). */
  readonly safetyMargin?: number;
}

export interface ContextFitFilterResult {
  readonly effectiveFleet: readonly ModelProfile[];
  readonly rejected: readonly CandidateScore[];
}

function resolveEstimatedInputTokens(request: RoutingRequest): number {
  return request.estimated_input_tokens ?? request.prompt_text.length;
}

function resolveSafetyMargin(config?: ContextFitConfig): number {
  if (config?.safetyMargin !== undefined) {
    return config.safetyMargin;
  }

  const raw = process.env[CONTEXT_FIT_SAFETY_MARGIN_ENV];
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_CONTEXT_FIT_SAFETY_MARGIN;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return DEFAULT_CONTEXT_FIT_SAFETY_MARGIN;
  }

  return parsed;
}

function modelFitsContext(
  profile: ModelProfile,
  estimatedInputTokens: number,
  safetyMargin: number,
): boolean {
  const maxInput = profile.limits?.max_input_tokens;
  if (maxInput === undefined) {
    return true;
  }

  const effectiveLimit = Math.floor(maxInput * safetyMargin);
  return estimatedInputTokens <= effectiveLimit;
}

/**
 * Remove fleet entries whose max_input_tokens cannot fit estimated_input_tokens
 * at the given safety margin. Honors `force_model_id` by leaving fleet unchanged.
 * Models without declared limits are retained (unknown window).
 */
export function filterFleetByContextFit(
  fleet: readonly ModelProfile[],
  request: RoutingRequest,
  config?: ContextFitConfig,
): ContextFitFilterResult {
  if (request.force_model_id) {
    return { effectiveFleet: fleet, rejected: [] };
  }

  const estimatedInputTokens = resolveEstimatedInputTokens(request);
  const safetyMargin = resolveSafetyMargin(config);

  const effectiveFleet: ModelProfile[] = [];
  const rejected: CandidateScore[] = [];

  for (const profile of fleet) {
    if (modelFitsContext(profile, estimatedInputTokens, safetyMargin)) {
      effectiveFleet.push(profile);
      continue;
    }

    const maxInput = profile.limits!.max_input_tokens!;
    const effectiveLimit = Math.floor(maxInput * safetyMargin);
    rejected.push({
      model_id: profile.id,
      score: 0,
      shortfall: estimatedInputTokens - effectiveLimit,
      rejected_reason: CONTEXT_FIT_EXCEEDED,
    });
  }

  return { effectiveFleet, rejected };
}
