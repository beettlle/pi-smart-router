/**
 * Expected-cost tier selection — SP-106, #68; virtual cost v2 — SP-149, #78.
 *
 * E[cost_T] = P(success | T) × directCost(T)
 *           + (1 - P(success | T)) × E[cost_escalation]
 *
 * directCost uses SP-148 virtual cost v2 (λ decay, quota premiums, KV credit).
 * Selects the tier minimizing adjusted expected cost subject to context-fit,
 * local readiness, and pin/cache economics (FR-008).
 */

import {
  computeVirtualCostV2,
  type VirtualCostV2Breakdown,
} from '../pricing/virtual-cost-v2.js';
import type {
  ModelProfile,
  PriceCatalog,
  SessionPin,
  Tier,
} from '../types/index.js';
import type { QuotaWindowPosition } from '../types/entities.js';
import type { VirtualCostV2Config } from '../types/schemas.js';
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

/** V2 virtual-cost breakdown attached to expected-cost explain (SP-149). */
export interface ExpectedCostVirtualCostV2 {
  readonly baseCostUsd: number;
  readonly quotaDecayLambda: number;
  readonly quotaArbitragePremium: number;
  readonly exhaustionRiskPremium: number;
  readonly kvCacheSavings: number;
  readonly effectiveCostUsd: number;
  readonly effectiveCostPer1M: number;
}

export interface ExpectedCostBreakdown {
  readonly tier: Tier;
  readonly pSuccess: number;
  readonly costPer1M: number;
  readonly directCostUsd: number;
  readonly escalationCostUsd: number;
  readonly expectedCostUsd: number;
  readonly adjustedExpectedCostUsd: number;
  readonly virtualCostV2: ExpectedCostVirtualCostV2 | null;
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
  /** Rolling subscription quota position for v2 λ and premiums (SP-149). */
  readonly quotaWindowPosition?: QuotaWindowPosition;
  readonly virtualCostV2Config?: VirtualCostV2Config;
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

function mapVirtualCostV2Breakdown(
  breakdown: VirtualCostV2Breakdown,
): ExpectedCostVirtualCostV2 {
  return {
    baseCostUsd: breakdown.base_cost_usd,
    quotaDecayLambda: breakdown.quota_decay_lambda,
    quotaArbitragePremium: breakdown.quota_arbitrage_premium,
    exhaustionRiskPremium: breakdown.exhaustion_risk_premium,
    kvCacheSavings: breakdown.kv_cache_savings,
    effectiveCostUsd: breakdown.effective_cost_usd,
    effectiveCostPer1M: breakdown.effective_cost_per_1m,
  };
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

export interface ResolveTierVirtualCostInput {
  readonly tier: Tier;
  readonly fleet: readonly ModelProfile[];
  readonly priceCatalog: PriceCatalog | null;
  readonly estTokens: number;
  readonly quotaWindowPosition?: QuotaWindowPosition;
  readonly virtualCostV2Config?: VirtualCostV2Config;
  readonly sessionPin?: SessionPin;
  readonly pinnedModel?: ModelProfile;
}

/**
 * Resolve SP-148 virtual cost v2 for a tier representative model (SP-149).
 */
export function resolveTierVirtualCost(
  input: ResolveTierVirtualCostInput,
): {
  readonly costPer1M: number;
  readonly directCostUsd: number;
  readonly virtualCostV2: ExpectedCostVirtualCostV2;
} {
  const baseCostPer1M = resolveTierCostPer1M(
    input.tier,
    input.fleet,
    input.priceCatalog,
  );
  const pinActive =
    input.sessionPin !== undefined &&
    input.pinnedModel !== undefined &&
    input.pinnedModel.tier === input.tier;
  const warmPrefixTokens =
    pinActive && input.estTokens > 0 ? input.estTokens : 0;

  const breakdown = computeVirtualCostV2({
    base_cost_per_1m: baseCostPer1M,
    est_tokens: input.estTokens,
    pin_active: pinActive,
    warm_prefix_tokens: warmPrefixTokens,
    ...(input.quotaWindowPosition !== undefined
      ? { window_position: input.quotaWindowPosition }
      : {}),
    ...(input.virtualCostV2Config !== undefined
      ? { config: input.virtualCostV2Config }
      : {}),
  });

  return {
    costPer1M: breakdown.effective_cost_per_1m,
    directCostUsd: breakdown.effective_cost_usd,
    virtualCostV2: mapVirtualCostV2Breakdown(breakdown),
  };
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
 * Format v2 cost breakdown for operator explain output (SP-149).
 */
export function formatVirtualCostV2Explain(
  virtualCostV2: ExpectedCostVirtualCostV2 | null,
): string {
  if (!virtualCostV2) {
    return '';
  }

  return (
    `v2 λ=${virtualCostV2.quotaDecayLambda.toFixed(3)}` +
    ` quota_premium=${virtualCostV2.quotaArbitragePremium.toFixed(6)}` +
    ` exhaustion=${virtualCostV2.exhaustionRiskPremium.toFixed(6)}` +
    ` cache_credit=${virtualCostV2.kvCacheSavings.toFixed(6)}`
  );
}

/**
 * Compute per-tier expected routing cost under uncertainty.
 *
 * Tier direct cost uses SP-148 virtual cost v2 when resolved via fleet/catalog.
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
    readonly directCostUsd?: number;
    readonly fleet?: readonly ModelProfile[];
    readonly virtualCostV2?: ExpectedCostVirtualCostV2 | null;
    readonly quotaWindowPosition?: QuotaWindowPosition;
    readonly virtualCostV2Config?: VirtualCostV2Config;
    readonly sessionPin?: SessionPin;
    readonly pinnedModel?: ModelProfile;
  },
): ExpectedCostBreakdown {
  const alpha = options?.alpha ?? 1;
  const fleet = options?.fleet ?? [];

  let costPer1M: number;
  let direct: number;
  let virtualCostV2 = options?.virtualCostV2 ?? null;

  if (options?.costPer1M !== undefined) {
    costPer1M = options.costPer1M;
    direct = options.directCostUsd ?? (estTokens / 1_000_000) * costPer1M;
  } else {
    const resolved = resolveTierVirtualCost({
      tier,
      fleet,
      priceCatalog,
      estTokens,
      ...(options?.quotaWindowPosition !== undefined
        ? { quotaWindowPosition: options.quotaWindowPosition }
        : {}),
      ...(options?.virtualCostV2Config !== undefined
        ? { virtualCostV2Config: options.virtualCostV2Config }
        : {}),
      ...(options?.sessionPin !== undefined ? { sessionPin: options.sessionPin } : {}),
      ...(options?.pinnedModel !== undefined ? { pinnedModel: options.pinnedModel } : {}),
    });
    costPer1M = resolved.costPer1M;
    direct = resolved.directCostUsd;
    virtualCostV2 = resolved.virtualCostV2;
  }

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
    virtualCostV2,
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

function buildTierRationale(
  tier: Tier,
  breakdown: ExpectedCostBreakdown,
): string {
  const v2Explain = formatVirtualCostV2Explain(breakdown.virtualCostV2);
  const tierLabel = tier === 'frontier-cloud' ? 'Frontier' : 'Economical tier';
  const base = `${tierLabel} minimizes E[cost]=${breakdown.adjustedExpectedCostUsd.toFixed(6)} with P(success)=${breakdown.pSuccess.toFixed(3)}`;
  return v2Explain ? `${base} (${v2Explain})` : base;
}

/**
 * Compare expected cost across context-fit-viable tiers and return argmin tier hint.
 */
export function selectTierByExpectedCost(
  input: SelectTierByExpectedCostInput,
): SelectTierByExpectedCostResult {
  const viableTiers = listViableTiers(input.fleet, input.localZeroReady);
  const virtualCostOptions = {
    ...(input.quotaWindowPosition !== undefined
      ? { quotaWindowPosition: input.quotaWindowPosition }
      : {}),
    ...(input.virtualCostV2Config !== undefined
      ? { virtualCostV2Config: input.virtualCostV2Config }
      : {}),
    ...(input.sessionPin !== undefined ? { sessionPin: input.sessionPin } : {}),
    ...(input.pinnedModel !== undefined ? { pinnedModel: input.pinnedModel } : {}),
  };

  const frontierResolved = resolveTierVirtualCost({
    tier: 'frontier-cloud',
    fleet: input.fleet,
    priceCatalog: input.priceCatalog,
    estTokens: input.estTokens,
    ...virtualCostOptions,
  });
  const economicalResolved = resolveTierVirtualCost({
    tier: 'economical-cloud',
    fleet: input.fleet,
    priceCatalog: input.priceCatalog,
    estTokens: input.estTokens,
    ...virtualCostOptions,
  });
  const zeroResolved = resolveTierVirtualCost({
    tier: 'zero-tier',
    fleet: input.fleet,
    priceCatalog: input.priceCatalog,
    estTokens: input.estTokens,
    ...virtualCostOptions,
  });

  const frontierCostPer1M = frontierResolved.costPer1M;
  const economicalCostPer1M = Math.min(
    economicalResolved.costPer1M,
    zeroResolved.costPer1M || Infinity,
  );
  const frontierDirectUsd = frontierResolved.directCostUsd;
  const priceDeltaSignificant = hasSignificantPriceDelta(
    economicalCostPer1M,
    frontierCostPer1M,
  );

  const tierCosts = viableTiers.map((tier) => {
    const resolved = resolveTierVirtualCost({
      tier,
      fleet: input.fleet,
      priceCatalog: input.priceCatalog,
      estTokens: input.estTokens,
      ...virtualCostOptions,
    });
    const escalationCostUsd = buildEscalationCostUsd(
      tier,
      resolved.directCostUsd,
      frontierDirectUsd,
    );

    return computeExpectedCost(
      tier,
      input.pSuccessCheap,
      input.priceCatalog,
      input.estTokens,
      escalationCostUsd,
      {
        alpha: input.alpha,
        costPer1M: resolved.costPer1M,
        directCostUsd: resolved.directCostUsd,
        virtualCostV2: resolved.virtualCostV2,
        fleet: input.fleet,
        ...virtualCostOptions,
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

  return {
    tierHint: best.tier,
    reasonCode: `expected_cost_${best.tier.replace('-', '_')}`,
    tierCosts,
    rationale: buildTierRationale(best.tier, best),
    blockedByPinEconomics: false,
  };
}
