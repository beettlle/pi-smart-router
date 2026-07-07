/**
 * Context-fit gate — SP-093, overflow fallback — SP-095.
 *
 * Filters fleet models whose context window cannot accommodate the estimated
 * input token count (with a configurable safety margin).
 */

import type {
  CandidateScore,
  ModelProfile,
  RoutingRequest,
} from '../types/index.js';
import { selectLowestCostModel } from '../pinning/sub-route-policy.js';

export const CONTEXT_FIT_EXCEEDED = 'context_fit_exceeded' as const;

export const CONTEXT_OVERFLOW_SAME_PROVIDER_FALLBACK =
  'context_overflow_same_provider_fallback' as const;
export const CONTEXT_OVERFLOW_FRONTIER_FALLBACK =
  'context_overflow_frontier_fallback' as const;
export const CONTEXT_OVERFLOW_NO_FIT = 'context_overflow_no_fit' as const;

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

export interface ContextOverflowFallbackResult {
  readonly kind: 'selected' | 'no_fit';
  readonly model?: ModelProfile;
  readonly reasonCode:
    | typeof CONTEXT_OVERFLOW_SAME_PROVIDER_FALLBACK
    | typeof CONTEXT_OVERFLOW_FRONTIER_FALLBACK
    | typeof CONTEXT_OVERFLOW_NO_FIT;
}

function resolveEstimatedInputTokens(request: RoutingRequest): number {
  return request.estimated_input_tokens ?? request.prompt_text.length;
}

export function resolveSafetyMargin(config?: ContextFitConfig): number {
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

export function modelFitsContext(
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

function isHealthy(model: ModelProfile): boolean {
  return model.healthy !== false;
}

/**
 * Select the model with the largest declared context window.
 * Models without declared limits sort last (treated as unknown / unbounded).
 */
export function selectLargestWindowModel(
  candidates: readonly ModelProfile[],
): ModelProfile | undefined {
  let best: ModelProfile | undefined;
  let bestWindow = -1;

  for (const model of candidates) {
    if (!isHealthy(model)) continue;
    const window = model.limits?.max_input_tokens ?? Number.MAX_SAFE_INTEGER;
    if (window > bestWindow) {
      bestWindow = window;
      best = model;
    }
  }

  return best;
}

/**
 * SP-095: escalate when economical/pinned models cannot fit context.
 *
 * 1. Same-provider largest-fit model
 * 2. Cheapest frontier model that fits
 * 3. Structured no-fit (never dispatch undersized)
 */
export function resolveContextOverflowFallback(
  fleet: readonly ModelProfile[],
  request: RoutingRequest,
  preferredProvider: string | null,
  config?: ContextFitConfig,
): ContextOverflowFallbackResult {
  const estimatedInputTokens = resolveEstimatedInputTokens(request);
  const safetyMargin = resolveSafetyMargin(config);
  const fits = (model: ModelProfile): boolean =>
    modelFitsContext(model, estimatedInputTokens, safetyMargin);

  if (preferredProvider) {
    const sameProviderCandidates = fleet.filter(
      (model) => model.provider === preferredProvider && fits(model),
    );
    const sameProviderModel = selectLargestWindowModel(sameProviderCandidates);
    if (sameProviderModel) {
      return {
        kind: 'selected',
        model: sameProviderModel,
        reasonCode: CONTEXT_OVERFLOW_SAME_PROVIDER_FALLBACK,
      };
    }
  }

  const frontierCandidates = fleet.filter(
    (model) => model.tier === 'frontier-cloud' && fits(model),
  );
  const frontierModel = selectLowestCostModel(frontierCandidates);
  if (frontierModel) {
    return {
      kind: 'selected',
      model: frontierModel,
      reasonCode: CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
    };
  }

  return {
    kind: 'no_fit',
    reasonCode: CONTEXT_OVERFLOW_NO_FIT,
  };
}

/**
 * True when economical models were rejected for context fit and none remain
 * in the post-filter fleet.
 */
export function needsContextOverflowFallback(
  activeFleet: readonly ModelProfile[],
  rejected: readonly CandidateScore[],
  fullFleet: readonly ModelProfile[],
): boolean {
  if (rejected.length === 0) {
    return false;
  }

  const hasActiveEconomical = activeFleet.some(
    (model) => model.tier === 'economical-cloud' && isHealthy(model),
  );
  if (hasActiveEconomical) {
    return false;
  }

  return rejected.some((candidate) => {
    const profile = fullFleet.find((model) => model.id === candidate.model_id);
    return profile?.tier === 'economical-cloud';
  });
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
