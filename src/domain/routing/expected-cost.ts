/**
 * Expected-cost tier selection — SP-106, #68.
 *
 * E[cost_T] = P(success | T) × directCost(T)
 *           + (1 - P(success | T)) × E[cost_escalation]
 *
 * Selects the tier minimizing adjusted expected cost subject to context-fit,
 * local readiness, and pin/cache economics (FR-008).
 */

import type {
  ModelProfile,
  PriceCatalog,
  SessionPin,
  Tier,
} from '../types/index.js';
import { resolveFrugalityCostPer1M } from '../../infrastructure/pricing/price-broker.js';
import {
  evaluateCacheEconomics,
  type CacheEconomicsConfig,
} from '../pinning/cache-economics.js';
import { selectLowestCostModel } from '../pinning/sub-route-policy.js';

/** Frontier-tier success probability when evaluating escalation terminal cost. */
export const FRONTIER_P_SUCCESS = 1;

/** Minimum per-1M-token spread required before economical tiers compete. */
export const MIN_PRICE_DELTA_PER_1M = 0.25;

export interface ExpectedCostBreakdown {
  readonly tier: Tier;
  readonly pSuccess: number;
  readonly costPer1M: number;
  readonly directCostUsd: number;
  readonly escalationCostUsd: number;
  readonly expectedCostUsd: number;
  readonly adjustedExpectedCostUsd: number;
}

export interface SelectTierByExpectedCostInput {
  readonly fleet: readonly ModelProfile[];
  readonly priceCatalog: PriceCatalog | null;
  readonly estTokens: number;
  readonly pSuccessCheap: number;
  /** Cost-quality tradeoff in [0, 1]; higher favors economical tiers (SP-106). */
  readonly alpha: number;
  readonly localZeroReady: boolean;
  readonly pinnedModel?: ModelProfile;
  readonly sessionPin?: SessionPin;
  readonly cacheEconomicsConfig?: CacheEconomicsConfig;
}

export interface SelectTierByExpectedCostResult {
  readonly tierHint: Tier | null;
  readonly reasonCode: string;
  readonly tierCosts: readonly ExpectedCostBreakdown[];
  readonly rationale: string;
  readonly blockedByPinEconomics: boolean;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function directCostUsd(costPer1M: number, estTokens: number): number {
  return (estTokens / 1_000_000) * costPer1M;
}

function resolveCheapestModelForTier(
  fleet: readonly ModelProfile[],
  tier: Tier,
): ModelProfile | undefined {
  return selectLowestCostModel(fleet.filter((model) => model.tier === tier));
}

/**
 * Resolve representative per-1M cost for a tier using subscription-aware pricing (SP-096).
 */
export function resolveTierCostPer1M(
  tier: Tier,
  fleet: readonly ModelProfile[],
  priceCatalog: PriceCatalog | null,
): number {
  const model = resolveCheapestModelForTier(fleet, tier);
  if (!model) {
    return 0;
  }
  return resolveFrugalityCostPer1M(model, priceCatalog);
}

function resolvePSuccessForTier(tier: Tier, pSuccessCheap: number): number {
  if (tier === 'frontier-cloud') {
    return FRONTIER_P_SUCCESS;
  }
  return clamp01(pSuccessCheap);
}

function applyCostQualityAlpha(
  expectedCostUsd: number,
  pSuccess: number,
  escalationCostUsd: number,
  alpha: number,
): number {
  const riskPenalty = (1 - clamp01(alpha)) * (1 - clamp01(pSuccess)) * escalationCostUsd;
  return expectedCostUsd + riskPenalty;
}

/**
 * Compute per-tier expected routing cost under uncertainty.
 *
 * `priceCatalog` drives subscription virtual cost resolution; pass `costPer1M`
 * via options when the caller already resolved tier pricing.
 */
export function computeExpectedCost(
  tier: Tier,
  pSuccess: number,
  priceCatalog: PriceCatalog | null,
  estTokens: number,
  escalationCostUsd: number,
  options?: {
    readonly alpha?: number;
    readonly costPer1M?: number;
    readonly fleet?: readonly ModelProfile[];
  },
): ExpectedCostBreakdown {
  const alpha = options?.alpha ?? 1;
  const fleet = options?.fleet ?? [];
  const costPer1M =
    options?.costPer1M ?? resolveTierCostPer1M(tier, fleet, priceCatalog);
  const direct = directCostUsd(costPer1M, estTokens);
  const boundedPSuccess = resolvePSuccessForTier(tier, pSuccess);
  const expectedCostUsd =
    boundedPSuccess * direct + (1 - boundedPSuccess) * escalationCostUsd;
  const adjustedExpectedCostUsd = applyCostQualityAlpha(
    expectedCostUsd,
    boundedPSuccess,
    escalationCostUsd,
    alpha,
  );

  return {
    tier,
    pSuccess: boundedPSuccess,
    costPer1M,
    directCostUsd: direct,
    escalationCostUsd,
    expectedCostUsd,
    adjustedExpectedCostUsd,
  };
}

function listViableTiers(
  fleet: readonly ModelProfile[],
  localZeroReady: boolean,
): Tier[] {
  const tiers = new Set<Tier>();

  for (const model of fleet) {
    if (model.healthy === false) {
      continue;
    }
    if (model.tier === 'zero-tier' && !localZeroReady) {
      continue;
    }
    tiers.add(model.tier);
  }

  return [...tiers];
}

function buildEscalationCostUsd(
  tier: Tier,
  cheapDirectUsd: number,
  frontierDirectUsd: number,
): number {
  if (tier === 'frontier-cloud') {
    return 0;
  }
  return cheapDirectUsd + frontierDirectUsd;
}

function hasSignificantPriceDelta(
  economicalCostPer1M: number,
  frontierCostPer1M: number,
): boolean {
  return frontierCostPer1M - economicalCostPer1M >= MIN_PRICE_DELTA_PER_1M;
}

function pickCheaperTierModel(
  fleet: readonly ModelProfile[],
  tier: Tier,
): ModelProfile | undefined {
  return resolveCheapestModelForTier(fleet, tier);
}

function shouldKeepPinnedTier(
  input: SelectTierByExpectedCostInput,
  selectedTier: Tier,
): boolean {
  const pinnedModel = input.pinnedModel;
  const sessionPin = input.sessionPin;
  if (!pinnedModel || !sessionPin) {
    return false;
  }

  const candidate = pickCheaperTierModel(input.fleet, selectedTier);
  if (!candidate || candidate.id === pinnedModel.id) {
    return false;
  }

  const economics = evaluateCacheEconomics(
    sessionPin,
    pinnedModel,
    candidate,
    input.estTokens,
    input.cacheEconomicsConfig,
  );

  return !economics.shouldSwitch;
}

/**
 * Compare expected cost across context-fit-viable tiers and return argmin tier hint.
 */
export function selectTierByExpectedCost(
  input: SelectTierByExpectedCostInput,
): SelectTierByExpectedCostResult {
  const viableTiers = listViableTiers(input.fleet, input.localZeroReady);
  const frontierCostPer1M = resolveTierCostPer1M(
    'frontier-cloud',
    input.fleet,
    input.priceCatalog,
  );
  const economicalCostPer1M = Math.min(
    resolveTierCostPer1M('economical-cloud', input.fleet, input.priceCatalog),
    resolveTierCostPer1M('zero-tier', input.fleet, input.priceCatalog) || Infinity,
  );
  const frontierDirectUsd = directCostUsd(frontierCostPer1M, input.estTokens);
  const priceDeltaSignificant = hasSignificantPriceDelta(
    economicalCostPer1M,
    frontierCostPer1M,
  );

  const tierCosts = viableTiers.map((tier) => {
    const costPer1M = resolveTierCostPer1M(tier, input.fleet, input.priceCatalog);
    const direct = directCostUsd(costPer1M, input.estTokens);
    const escalationCostUsd = buildEscalationCostUsd(tier, direct, frontierDirectUsd);

    return computeExpectedCost(
      tier,
      input.pSuccessCheap,
      input.priceCatalog,
      input.estTokens,
      escalationCostUsd,
      {
        alpha: input.alpha,
        costPer1M,
        fleet: input.fleet,
      },
    );
  });

  if (tierCosts.length === 0) {
    return {
      tierHint: null,
      reasonCode: 'expected_cost_no_viable_tier',
      tierCosts,
      rationale: 'No viable tiers after context-fit and local readiness filters',
      blockedByPinEconomics: false,
    };
  }

  let best = tierCosts[0]!;
  for (const candidate of tierCosts.slice(1)) {
    if (candidate.adjustedExpectedCostUsd < best.adjustedExpectedCostUsd) {
      best = candidate;
    }
  }

  if (
    (best.tier === 'economical-cloud' || best.tier === 'zero-tier') &&
    !priceDeltaSignificant
  ) {
    return {
      tierHint: null,
      reasonCode: 'expected_cost_price_delta_insufficient',
      tierCosts,
      rationale:
        'Economical tier expected cost is lowest but frontier–economical price delta is below threshold',
      blockedByPinEconomics: false,
    };
  }

  if (shouldKeepPinnedTier(input, best.tier)) {
    const pinnedTier = input.pinnedModel!.tier;
    return {
      tierHint: pinnedTier,
      reasonCode: 'expected_cost_pin_cache_economics',
      tierCosts,
      rationale:
        'Expected-cost tier switch blocked because cache reprime exceeds projected savings (FR-008)',
      blockedByPinEconomics: true,
    };
  }

  const rationale =
    best.tier === 'frontier-cloud'
      ? `Frontier minimizes E[cost]=${best.adjustedExpectedCostUsd.toFixed(6)} with P(success)=${best.pSuccess.toFixed(3)}`
      : `Economical tier minimizes E[cost]=${best.adjustedExpectedCostUsd.toFixed(6)} with P(success)=${best.pSuccess.toFixed(3)}`;

  return {
    tierHint: best.tier,
    reasonCode: `expected_cost_${best.tier.replace('-', '_')}`,
    tierCosts,
    rationale,
    blockedByPinEconomics: false,
  };
}
