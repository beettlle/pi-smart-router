/**
 * Virtual cost v2 — SP-148, #78.
 *
 * Deterministic subscription-quota economics beyond SP-096 flat
 * `quota_cost_per_1m`: rolling-window λ decay, quota arbitrage premium,
 * exhaustion risk premium, and KV-cache savings credit (negative).
 *
 * Pure functions only — pipeline wiring is SP-149.
 */

import type { QuotaWindowPosition } from '../types/entities.js';
import type { VirtualCostV2Config } from '../types/schemas.js';
import { DEFAULT_VIRTUAL_COST_V2_CONFIG } from '../types/schemas.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VirtualCostV2Input {
  /** SP-096 subscription virtual cost USD per 1M tokens. */
  readonly base_cost_per_1m: number;
  readonly est_tokens: number;
  /** Rolling window position; omitted ⇒ full window (λ = 1, no premiums). */
  readonly window_position?: QuotaWindowPosition;
  /** When true with warm prefix tokens, apply KV-cache savings credit. */
  readonly pin_active?: boolean;
  readonly warm_prefix_tokens?: number;
  readonly config?: VirtualCostV2Config;
}

export interface VirtualCostV2Breakdown {
  readonly base_cost_usd: number;
  readonly quota_decay_lambda: number;
  readonly quota_arbitrage_premium: number;
  readonly exhaustion_risk_premium: number;
  /** Negative when prefix cache credit applies. */
  readonly kv_cache_savings: number;
  readonly effective_cost_usd: number;
  readonly effective_cost_per_1m: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const TOKENS_PER_M = 1_000_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveConfig(config?: VirtualCostV2Config): VirtualCostV2Config {
  return config ?? DEFAULT_VIRTUAL_COST_V2_CONFIG;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function resolveRemainingFraction(window_position?: QuotaWindowPosition): number {
  if (!window_position) {
    return 1;
  }
  return clamp01(window_position.remaining_window_fraction);
}

function baseCostUsd(base_cost_per_1m: number, est_tokens: number): number {
  if (!isFiniteNonNegative(base_cost_per_1m) || !isFiniteNonNegative(est_tokens)) {
    return 0;
  }
  return (est_tokens / TOKENS_PER_M) * base_cost_per_1m;
}

// ─── Component functions ──────────────────────────────────────────────────────

/**
 * Quota decay multiplier λ(remaining_window).
 *
 * λ = 1 at full window; rises toward `lambda_max_multiplier` as budget depletes.
 */
export function computeQuotaDecayLambda(
  remaining_window_fraction: number,
  config?: VirtualCostV2Config,
): number {
  const resolved = resolveConfig(config);
  const remaining = clamp01(remaining_window_fraction);
  const consumed = 1 - remaining;
  const { lambda_decay_exponent, lambda_max_multiplier } = resolved;

  if (!Number.isFinite(lambda_decay_exponent) || lambda_decay_exponent <= 0) {
    return 1;
  }
  if (!Number.isFinite(lambda_max_multiplier) || lambda_max_multiplier < 1) {
    return 1;
  }

  const uplift = lambda_max_multiplier - 1;
  return 1 + uplift * consumed ** lambda_decay_exponent;
}

/**
 * Opportunity-cost premium for burning subscription quota late in the window.
 */
export function computeQuotaArbitragePremium(
  base_cost_usd: number,
  remaining_window_fraction: number,
  config?: VirtualCostV2Config,
): number {
  if (!isFiniteNonNegative(base_cost_usd)) {
    return 0;
  }

  const resolved = resolveConfig(config);
  const remaining = clamp01(remaining_window_fraction);
  const weight = resolved.quota_arbitrage_weight;

  if (!Number.isFinite(weight) || weight <= 0) {
    return 0;
  }

  return base_cost_usd * weight * (1 - remaining);
}

/**
 * Exhaustion risk premium when remaining window budget falls below threshold.
 */
export function computeExhaustionRiskPremium(
  base_cost_usd: number,
  remaining_window_fraction: number,
  config?: VirtualCostV2Config,
): number {
  if (!isFiniteNonNegative(base_cost_usd)) {
    return 0;
  }

  const resolved = resolveConfig(config);
  const remaining = clamp01(remaining_window_fraction);
  const threshold = clamp01(resolved.exhaustion_risk_threshold);
  const weight = resolved.exhaustion_risk_weight;

  if (!Number.isFinite(weight) || weight <= 0 || threshold <= 0) {
    return 0;
  }

  if (remaining >= threshold) {
    return 0;
  }

  const pressure = (threshold - remaining) / threshold;
  return base_cost_usd * weight * pressure ** 2;
}

/**
 * KV-cache savings credit (negative) for an active pin with a warm prefix.
 */
export function computeKvCacheSavings(
  warm_prefix_tokens: number,
  cost_per_1m: number,
  pin_active: boolean,
  config?: VirtualCostV2Config,
): number {
  if (!pin_active || !isFiniteNonNegative(warm_prefix_tokens) || warm_prefix_tokens === 0) {
    return 0;
  }
  if (!isFiniteNonNegative(cost_per_1m)) {
    return 0;
  }

  const resolved = resolveConfig(config);
  const { prefix_cache_discount, prefix_cache_weight } = resolved;

  if (
    !Number.isFinite(prefix_cache_discount) ||
    prefix_cache_discount < 0 ||
    prefix_cache_discount > 1 ||
    !Number.isFinite(prefix_cache_weight) ||
    prefix_cache_weight < 0 ||
    prefix_cache_weight > 1
  ) {
    return 0;
  }

  const prefixCostUsd = (warm_prefix_tokens / TOKENS_PER_M) * cost_per_1m;
  const discountedValueUsd = prefixCostUsd * prefix_cache_discount;
  const retainedValueUsd = discountedValueUsd * prefix_cache_weight;

  return -retainedValueUsd;
}

function effectiveCostPer1M(
  effective_cost_usd: number,
  est_tokens: number,
  base_cost_per_1m: number,
  quota_decay_lambda: number,
): number {
  if (!isFiniteNonNegative(est_tokens) || est_tokens === 0) {
    return base_cost_per_1m * quota_decay_lambda;
  }
  return (effective_cost_usd / est_tokens) * TOKENS_PER_M;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Compute virtual cost v2 for a routing turn.
 *
 * `effective_cost_usd` = base × λ + quota_arbitrage_premium
 *                      + exhaustion_risk_premium + kv_cache_savings
 */
export function computeVirtualCostV2(input: VirtualCostV2Input): VirtualCostV2Breakdown {
  const resolved = resolveConfig(input.config);
  const remaining = resolveRemainingFraction(input.window_position);
  const baseUsd = baseCostUsd(input.base_cost_per_1m, input.est_tokens);
  const lambda = computeQuotaDecayLambda(remaining, resolved);
  const arbitragePremium = computeQuotaArbitragePremium(baseUsd, remaining, resolved);
  const exhaustionPremium = computeExhaustionRiskPremium(baseUsd, remaining, resolved);
  const cacheSavings = computeKvCacheSavings(
    input.warm_prefix_tokens ?? 0,
    input.base_cost_per_1m,
    input.pin_active === true,
    resolved,
  );

  const effectiveUsd =
    baseUsd * lambda + arbitragePremium + exhaustionPremium + cacheSavings;

  return {
    base_cost_usd: baseUsd,
    quota_decay_lambda: lambda,
    quota_arbitrage_premium: arbitragePremium,
    exhaustion_risk_premium: exhaustionPremium,
    kv_cache_savings: cacheSavings,
    effective_cost_usd: effectiveUsd,
    effective_cost_per_1m: effectiveCostPer1M(
      effectiveUsd,
      input.est_tokens,
      input.base_cost_per_1m,
      lambda,
    ),
  };
}

/**
 * Derive remaining window fraction from elapsed seconds in a rolling window.
 */
export function deriveRemainingWindowFraction(
  elapsed_window_seconds: number,
  consumed_window_fraction: number,
  config?: VirtualCostV2Config,
): number {
  const resolved = resolveConfig(config);
  const duration = resolved.window_duration_seconds;

  if (!Number.isFinite(duration) || duration <= 0) {
    return 1;
  }

  const elapsedFraction = clamp01(elapsed_window_seconds / duration);
  const consumed = clamp01(consumed_window_fraction);
  const remainingFromTime = 1 - elapsedFraction;
  const remainingFromQuota = 1 - consumed;

  return clamp01(Math.min(remainingFromTime, remainingFromQuota));
}
