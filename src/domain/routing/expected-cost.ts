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
import type { RoutingTelemetry } from '../types/index.js';

/** Frontier-tier success probability when evaluating escalation terminal cost. */
export const FRONTIER_P_SUCCESS = 1;

/** Minimum per-1M-token spread required before economical tiers compete. */
export const MIN_PRICE_DELTA_PER_1M = 0.25;

/**
 * Maximum soft heat-affinity discount (SP-215, #115). Caps the expected-cost
 * discount a workload heat map may apply so serve-time affinity can never
 * dominate hard gates (price delta, pin cache economics, capability
 * shortfall) — matches the Colibri-style ~25% hysteresis band.
 */
export const MAX_HEAT_BIAS_STRENGTH = 0.25;

/**
 * Soft first-turn / cold-start heat affinity (SP-215, #115). Discounts the
 * adjusted expected cost of `tier` by `strength` (fraction, clamped to
 * [0, MAX_HEAT_BIAS_STRENGTH]). Applied AFTER expected-cost computation and
 * BEFORE the price-delta and pin-economics gates, so it can only ever soften
 * — never override — hard routing gates.
 */
export interface ExpectedCostHeatBias {
  readonly tier: Tier;
  readonly strength: number;
}

// ─── Rolling cost calibration (SP-242, #164) ──────────────────────────────

/** One warm actual/estimate ratio bucket (SP-242, #164). */
export interface CostCalibrationSample {
  /** Model id (`kind === 'model'`) or tier name (`kind === 'tier'`). */
  readonly key: string;
  readonly kind: 'model' | 'tier';
  /** Mean actual/estimate ratio over the warm window, clamped soft. */
  readonly ratio: number;
  /** Number of usable actual/estimate pairs behind the ratio. */
  readonly samples: number;
}

/**
 * Privacy-safe rolling cost-calibration prior built from routing telemetry
 * (SP-242, #164). Carries only model ids, tier names, ratios, and counts —
 * never prompt/message bodies. Null / empty maps = cold (fail open to
 * catalog estimates).
 */
export interface CostCalibrationPrior {
  readonly byModel: ReadonlyMap<string, CostCalibrationSample>;
  readonly byTier: ReadonlyMap<string, CostCalibrationSample>;
}

/** Calibration knobs; defaults keep the bias soft and warmup-gated. */
export interface CostCalibrationConfig {
  /** Buckets with fewer usable pairs stay cold (degrade to catalog). */
  readonly minSamples: number;
  /** Aggregate ratio clamp — the bias can never exceed this band. */
  readonly minRatio: number;
  readonly maxRatio: number;
  /** Per-pair outlier clamp before averaging (one wild turn ≠ pivot). */
  readonly sampleMinRatio: number;
  readonly sampleMaxRatio: number;
}

export const DEFAULT_COST_CALIBRATION_CONFIG: CostCalibrationConfig = {
  minSamples: 3,
  minRatio: 0.5,
  maxRatio: 2.0,
  sampleMinRatio: 0.1,
  sampleMaxRatio: 10,
};

export interface BuildCostCalibrationPriorOptions {
  readonly config?: CostCalibrationConfig;
  /** Optional model_id → tier map (e.g. from fleet) for per-tier buckets. */
  readonly tierByModelId?: ReadonlyMap<string, Tier>;
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

interface RatioAccumulator {
  sum: number;
  count: number;
}

/**
 * Build a rolling actual/estimate cost-calibration prior from telemetry
 * entries carrying SP-241 usage actuals (SP-242, #164).
 *
 * Only entries with a host-reported positive `actual_cost_usd` and a positive
 * `estimated_cost_usd` contribute — subscription rows (actual cost null/zero)
 * never invent USD and simply fail open. Per-pair ratios are outlier-clamped
 * before averaging; aggregate ratios are clamped to [minRatio, maxRatio] so
 * the bias stays soft. Returns null when no bucket reaches `minSamples`
 * (cold → callers degrade to catalog estimates).
 */
export function buildCostCalibrationPrior(
  entries: readonly RoutingTelemetry[],
  options?: BuildCostCalibrationPriorOptions,
): CostCalibrationPrior | null {
  const config = options?.config ?? DEFAULT_COST_CALIBRATION_CONFIG;
  const tierByModelId = options?.tierByModelId;
  const modelAcc = new Map<string, RatioAccumulator>();
  const tierAcc = new Map<string, RatioAccumulator>();

  for (const entry of entries) {
    const actual = entry.actual_cost_usd;
    const estimate = entry.estimated_cost_usd;
    if (
      typeof actual !== 'number' ||
      !Number.isFinite(actual) ||
      actual <= 0 ||
      !Number.isFinite(estimate) ||
      estimate <= 0
    ) {
      continue;
    }

    const ratio = clampNumber(
      actual / estimate,
      config.sampleMinRatio,
      config.sampleMaxRatio,
    );

    const modelAccum = modelAcc.get(entry.selected_model_id);
    if (modelAccum) {
      modelAccum.sum += ratio;
      modelAccum.count += 1;
    } else {
      modelAcc.set(entry.selected_model_id, { sum: ratio, count: 1 });
    }

    const tier = tierByModelId?.get(entry.selected_model_id) ?? entry.tier_hint;
    if (tier !== null && tier !== undefined) {
      const tierAccum = tierAcc.get(tier);
      if (tierAccum) {
        tierAccum.sum += ratio;
        tierAccum.count += 1;
      } else {
        tierAcc.set(tier, { sum: ratio, count: 1 });
      }
    }
  }

  const finalize = (
    acc: ReadonlyMap<string, RatioAccumulator>,
    kind: CostCalibrationSample['kind'],
  ): ReadonlyMap<string, CostCalibrationSample> => {
    const out = new Map<string, CostCalibrationSample>();
    for (const [key, { sum, count }] of acc) {
      if (count < config.minSamples) {
        continue;
      }
      const ratio = clampNumber(sum / count, config.minRatio, config.maxRatio);
      out.set(key, { key, kind, ratio, samples: count });
    }
    return out;
  };

  const byModel = finalize(modelAcc, 'model');
  const byTier = finalize(tierAcc, 'tier');

  if (byModel.size === 0 && byTier.size === 0) {
    return null;
  }

  return { byModel, byTier };
}

/** Target for ratio lookup: model id first, tier as fallback. */
export interface CostCalibrationTarget {
  readonly modelId?: string;
  readonly tier?: Tier;
}

/**
 * Resolve the calibration ratio for a routing target (SP-242, #164).
 * Model-level buckets win over tier-level; anything cold / missing / null
 * returns exactly 1 — catalog estimate unchanged (fail open).
 */
export function resolveCostCalibrationRatio(
  prior: CostCalibrationPrior | null | undefined,
  target: CostCalibrationTarget,
): number {
  if (!prior) {
    return 1;
  }
  const byModel = target.modelId !== undefined ? prior.byModel.get(target.modelId) : undefined;
  if (byModel !== undefined && Number.isFinite(byModel.ratio) && byModel.ratio > 0) {
    return byModel.ratio;
  }
  const byTier = target.tier !== undefined ? prior.byTier.get(target.tier) : undefined;
  if (byTier !== undefined && Number.isFinite(byTier.ratio) && byTier.ratio > 0) {
    return byTier.ratio;
  }
  return 1;
}

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
  /** True when the SP-215 soft heat bias discounted this tier's cost. */
  readonly heatBiasApplied?: boolean;
  /** Applied rolling actual/estimate ratio (SP-242); present only when ≠ 1. */
  readonly calibrationRatio?: number;
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
  /** Soft heat affinity for first-turn / cold-start bias (SP-215, #115). */
  readonly heatBias?: ExpectedCostHeatBias;
  /** Rolling actual/estimate calibration prior (SP-242, #164); cold → catalog. */
  readonly costCalibration?: CostCalibrationPrior | null;
}

export interface SelectTierByExpectedCostResult {
  readonly tierHint: Tier | null;
  readonly reasonCode: string;
  readonly tierCosts: readonly ExpectedCostBreakdown[];
  readonly rationale: string;
  readonly blockedByPinEconomics: boolean;
  /** True when the SP-215 soft heat bias changed the winning tier. */
  readonly heatBiasApplied?: boolean;
  /** True when SP-242 rolling calibration biased the winning tier's cost. */
  readonly calibrationApplied?: boolean;
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
  /** Rolling actual/estimate calibration prior (SP-242, #164); cold → catalog. */
  readonly costCalibration?: CostCalibrationPrior | null;
}

/**
 * Resolve SP-148 virtual cost v2 for a tier representative model (SP-149).
 *
 * SP-242 (#164): when a warm calibration prior is supplied, the tier's base
 * per-1M cost is soft-biased by the rolling actual/estimate ratio (model
 * bucket first, tier bucket fallback) BEFORE the v2 λ/premium/KV chain, so
 * quota decay and cache credits compound on the calibrated base. Cold or
 * missing buckets resolve ratio 1 — catalog estimate unchanged (fail open).
 */
export function resolveTierVirtualCost(
  input: ResolveTierVirtualCostInput,
): {
  readonly costPer1M: number;
  readonly directCostUsd: number;
  readonly virtualCostV2: ExpectedCostVirtualCostV2;
  /** Applied calibration ratio (SP-242); 1 = catalog estimate untouched. */
  readonly calibrationRatio: number;
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

  const representative = resolveCheapestModelForTier(input.fleet, input.tier);
  const calibrationRatio =
    baseCostPer1M > 0
      ? resolveCostCalibrationRatio(input.costCalibration, {
          ...(representative !== undefined ? { modelId: representative.id } : {}),
          tier: input.tier,
        })
      : 1;
  const calibratedBaseCostPer1M = baseCostPer1M * calibrationRatio;

  const breakdown = computeVirtualCostV2({
    base_cost_per_1m: calibratedBaseCostPer1M,
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
    calibrationRatio,
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
 * Apply the SP-215 soft heat discount to a tier's adjusted expected cost.
 * Returns the discounted cost and whether the discount applied. Never raises
 * any tier's cost; strength is clamped to [0, MAX_HEAT_BIAS_STRENGTH].
 */
function applyHeatBias(
  adjustedExpectedCostUsd: number,
  tier: Tier,
  heatBias: ExpectedCostHeatBias | undefined,
): { readonly cost: number; readonly applied: boolean } {
  if (!heatBias || heatBias.tier !== tier || !Number.isFinite(heatBias.strength)) {
    return { cost: adjustedExpectedCostUsd, applied: false };
  }
  const strength = Math.min(Math.max(heatBias.strength, 0), MAX_HEAT_BIAS_STRENGTH);
  if (strength === 0) {
    return { cost: adjustedExpectedCostUsd, applied: false };
  }
  return { cost: adjustedExpectedCostUsd * (1 - strength), applied: true };
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
    readonly heatBias?: ExpectedCostHeatBias;
    /**
     * Annotation only (SP-242): applied calibration ratio when `costPer1M` /
     * `directCostUsd` were supplied pre-calibrated by the caller. When cost is
     * resolved internally the ratio comes from the tier resolution itself.
     */
    readonly calibrationRatio?: number;
    /**
     * Rolling calibration prior applied when cost is resolved internally
     * (SP-242, #164). Ignored when `costPer1M` is supplied explicitly — that
     * cost is treated as already calibrated, so the bias never double-applies.
     */
    readonly costCalibration?: CostCalibrationPrior | null;
  },
): ExpectedCostBreakdown {
  const alpha = options?.alpha ?? 1;
  const fleet = options?.fleet ?? [];

  let costPer1M: number;
  let direct: number;
  let virtualCostV2 = options?.virtualCostV2 ?? null;
  let calibrationRatio = 1;

  if (options?.costPer1M !== undefined) {
    costPer1M = options.costPer1M;
    direct = options.directCostUsd ?? (estTokens / 1_000_000) * costPer1M;
    virtualCostV2 = options.virtualCostV2 ?? null;
    calibrationRatio = options.calibrationRatio ?? 1;
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
      ...(options?.costCalibration != null
        ? { costCalibration: options.costCalibration }
        : {}),
    });
    costPer1M = resolved.costPer1M;
    direct = resolved.directCostUsd;
    virtualCostV2 = resolved.virtualCostV2;
    calibrationRatio = resolved.calibrationRatio;
  }

  const boundedPSuccess = resolvePSuccessForTier(tier, pSuccess);
  const expectedCostUsd =
    boundedPSuccess * direct + (1 - boundedPSuccess) * escalationCostUsd;
  const alphaAdjusted = applyCostQualityAlpha(
    expectedCostUsd,
    boundedPSuccess,
    escalationCostUsd,
    alpha,
  );
  const heat = applyHeatBias(alphaAdjusted, tier, options?.heatBias);

  return {
    tier,
    pSuccess: boundedPSuccess,
    costPer1M,
    directCostUsd: direct,
    escalationCostUsd,
    expectedCostUsd,
    adjustedExpectedCostUsd: heat.cost,
    virtualCostV2,
    ...(heat.applied ? { heatBiasApplied: true } : {}),
    ...(calibrationRatio !== 1 && Number.isFinite(calibrationRatio)
      ? { calibrationRatio }
      : {}),
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
  const heatNote = breakdown.heatBiasApplied
    ? ' [heat affinity soft bias (SP-215)]'
    : '';
  const calibNote =
    breakdown.calibrationRatio !== undefined && breakdown.calibrationRatio !== 1
      ? ` [cost-calib ×${breakdown.calibrationRatio.toFixed(2)} from rolling actuals (SP-242)]`
      : '';
  const withV2 = v2Explain ? `${base} (${v2Explain})` : base;
  return `${withV2}${heatNote}${calibNote}`;
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
    ...(input.costCalibration != null
      ? { costCalibration: input.costCalibration }
      : {}),
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
        ...(resolved.calibrationRatio !== 1
          ? { calibrationRatio: resolved.calibrationRatio }
          : {}),
        ...(input.heatBias !== undefined ? { heatBias: input.heatBias } : {}),
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
      heatBiasApplied: false,
      calibrationApplied: false,
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
      heatBiasApplied: best.heatBiasApplied === true,
      calibrationApplied: best.calibrationRatio !== undefined,
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
      heatBiasApplied: best.heatBiasApplied === true,
      calibrationApplied: best.calibrationRatio !== undefined,
    };
  }

  return {
    tierHint: best.tier,
    reasonCode: `expected_cost_${best.tier.replace('-', '_')}`,
    tierCosts,
    rationale: buildTierRationale(best.tier, best),
    blockedByPinEconomics: false,
    heatBiasApplied: best.heatBiasApplied === true,
    calibrationApplied: best.calibrationRatio !== undefined,
  };
}
