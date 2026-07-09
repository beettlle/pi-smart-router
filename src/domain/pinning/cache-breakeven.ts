/**
 * Cache breakeven economics — SAAR gate (#73), routing-roadmap P0.
 *
 * Decides whether a proposed tier switch is justified when a warm prefix
 * cache would be invalidated. Switch only when:
 *
 *   marginal_savings + future_cache_value > cache_reprime_cost
 *
 * Distinct from legacy FR-008 warmup rule in `cache-economics.ts` (#32).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** SAAR knobs used when deriving future_cache_value from a warm prefix. */
export interface SaarBreakevenConfig {
  /**
   * Weight applied to discounted prefix value when estimating future cache
   * benefit. SAAR default: 0.20.
   */
  readonly prefix_cache_weight?: number;

  /**
   * Input-token discount rate for a cache hit on the warm prefix.
   * Default: 0.90 (90 % discount per routing-roadmap / provider caching).
   */
  readonly prefix_cache_discount?: number;
}

export interface CacheBreakevenResult {
  readonly shouldSwitch: boolean;
  readonly marginal_savings: number;
  readonly future_cache_value: number;
  readonly cache_reprime_cost: number;
  readonly total_benefit: number;
  readonly reason: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PREFIX_CACHE_WEIGHT = 0.2;
const DEFAULT_PREFIX_CACHE_DISCOUNT = 0.9;
const TOKENS_PER_M = 1_000_000;

// ─── Component helpers ────────────────────────────────────────────────────────

function resolveSaarConfig(config?: SaarBreakevenConfig): {
  prefixCacheWeight: number;
  prefixCacheDiscount: number;
} {
  return {
    prefixCacheWeight: config?.prefix_cache_weight ?? DEFAULT_PREFIX_CACHE_WEIGHT,
    prefixCacheDiscount: config?.prefix_cache_discount ?? DEFAULT_PREFIX_CACHE_DISCOUNT,
  };
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isValidUsdComponent(value: number): boolean {
  return isFiniteNonNegative(value);
}

function isValidPrefixCacheWeight(weight: number): boolean {
  return Number.isFinite(weight) && weight >= 0 && weight <= 1;
}

function isValidPrefixCacheDiscount(discount: number): boolean {
  return Number.isFinite(discount) && discount >= 0 && discount <= 1;
}

function denySwitch(
  marginal_savings: number,
  future_cache_value: number,
  cache_reprime_cost: number,
  reason: string,
): CacheBreakevenResult {
  return {
    shouldSwitch: false,
    marginal_savings,
    future_cache_value,
    cache_reprime_cost,
    total_benefit: marginal_savings + future_cache_value,
    reason,
  };
}

/**
 * Estimate the retained value of a warm prefix cache using SAAR
 * `prefix_cache_weight`.
 */
export function computeFutureCacheValue(
  warm_prefix_tokens: number,
  pinned_cost_per_1m: number,
  config?: SaarBreakevenConfig,
): number {
  if (!isFiniteNonNegative(warm_prefix_tokens) || !isFiniteNonNegative(pinned_cost_per_1m)) {
    return 0;
  }

  if (warm_prefix_tokens === 0) {
    return 0;
  }

  const { prefixCacheWeight, prefixCacheDiscount } = resolveSaarConfig(config);
  if (!isValidPrefixCacheWeight(prefixCacheWeight) || !isValidPrefixCacheDiscount(prefixCacheDiscount)) {
    return 0;
  }

  const prefixCostUsd = (warm_prefix_tokens / TOKENS_PER_M) * pinned_cost_per_1m;
  const discountedValueUsd = prefixCostUsd * prefixCacheDiscount;
  return discountedValueUsd * prefixCacheWeight;
}

/**
 * Cost to re-transmit a cold prefix on the candidate provider after a switch.
 */
export function computeCacheReprimeCost(
  warm_prefix_tokens: number,
  candidate_cost_per_1m: number,
): number {
  if (!isFiniteNonNegative(warm_prefix_tokens) || !isFiniteNonNegative(candidate_cost_per_1m)) {
    return 0;
  }

  if (warm_prefix_tokens === 0) {
    return 0;
  }

  return (warm_prefix_tokens / TOKENS_PER_M) * candidate_cost_per_1m;
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/**
 * Evaluate whether a proposed switch clears the cache breakeven gate.
 *
 * Returns `shouldSwitch: false` on invalid inputs (fail-safe deny).
 */
export function evaluateCacheBreakeven(
  marginal_savings: number,
  future_cache_value: number,
  cache_reprime_cost: number,
): CacheBreakevenResult {
  if (
    !isValidUsdComponent(marginal_savings) ||
    !isValidUsdComponent(future_cache_value) ||
    !isValidUsdComponent(cache_reprime_cost)
  ) {
    return denySwitch(
      marginal_savings,
      future_cache_value,
      cache_reprime_cost,
      'invalid_input',
    );
  }

  const total_benefit = marginal_savings + future_cache_value;

  if (total_benefit <= cache_reprime_cost) {
    return {
      shouldSwitch: false,
      marginal_savings,
      future_cache_value,
      cache_reprime_cost,
      total_benefit,
      reason: 'breakeven_not_met',
    };
  }

  return {
    shouldSwitch: true,
    marginal_savings,
    future_cache_value,
    cache_reprime_cost,
    total_benefit,
    reason: 'breakeven_pass',
  };
}

/**
 * Derive breakeven components from prefix token economics, then evaluate.
 */
export function evaluateCacheBreakevenForPrefix(
  marginal_savings: number,
  warm_prefix_tokens: number,
  pinned_cost_per_1m: number,
  candidate_cost_per_1m: number,
  config?: SaarBreakevenConfig,
): CacheBreakevenResult {
  const { prefixCacheWeight, prefixCacheDiscount } = resolveSaarConfig(config);

  if (
    !isValidUsdComponent(marginal_savings) ||
    !isFiniteNonNegative(warm_prefix_tokens) ||
    !isFiniteNonNegative(pinned_cost_per_1m) ||
    !isFiniteNonNegative(candidate_cost_per_1m) ||
    !isValidPrefixCacheWeight(prefixCacheWeight) ||
    !isValidPrefixCacheDiscount(prefixCacheDiscount)
  ) {
    return denySwitch(marginal_savings, 0, 0, 'invalid_input');
  }

  const future_cache_value = computeFutureCacheValue(
    warm_prefix_tokens,
    pinned_cost_per_1m,
    config,
  );
  const cache_reprime_cost = computeCacheReprimeCost(
    warm_prefix_tokens,
    candidate_cost_per_1m,
  );

  return evaluateCacheBreakeven(
    marginal_savings,
    future_cache_value,
    cache_reprime_cost,
  );
}
