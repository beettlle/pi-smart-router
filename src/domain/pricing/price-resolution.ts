/**
 * Pure per-token price resolution — FR-019 tri-tier cascade (SP-276, #143).
 *
 * Domain-owned pricing policy (moved from
 * `infrastructure/pricing/price-broker.js` to finish the #143 domain→infra
 * inversion): override → registry snapshot → YAML fallback, plus the
 * frugality scoring rate (subscription quota cost takes precedence,
 * soft-biased by the peak/off-peak schedule adapters).
 *
 * Pure functions over domain types only — no catalog I/O here. The
 * infrastructure price broker re-exports these for import-path stability;
 * external snapshot refresh stays in `infrastructure/pricing/`.
 */

import type { ModelProfile, PriceCatalog, PriceSource } from '../types/index.js';
import {
  resolvePeakPricingAdjustment,
  type PeakPricingOptions,
} from './peak-pricing.js';

export interface ResolvedPrice {
  readonly model_id: string;
  readonly cost_per_1m_tokens: number;
  readonly source: PriceSource;
}

/**
 * Resolve the effective per-1M-token price using a strict priority cascade:
 *   1. Operator overrides (highest priority)
 *   2. Registry snapshot (refreshed external data)
 *   3. YAML/catalog fallback (ModelProfile.pricing.fallback_cost_per_1m)
 */
export function resolvePrice(
  model: ModelProfile,
  catalog: PriceCatalog | null,
): ResolvedPrice {
  if (catalog) {
    const override = catalog.user_overrides[model.id];
    if (override !== undefined) {
      return {
        model_id: model.id,
        cost_per_1m_tokens: override,
        source: 'override',
      };
    }

    const registryKey = model.pricing.registry_key ?? model.id;
    const registryPrice = catalog.registry_snapshot[registryKey];
    if (registryPrice !== undefined) {
      return {
        model_id: model.id,
        cost_per_1m_tokens: registryPrice,
        source: 'registry',
      };
    }
  }

  return {
    model_id: model.id,
    cost_per_1m_tokens: model.pricing.fallback_cost_per_1m,
    source: 'yaml_fallback',
  };
}

/**
 * Resolve per-request cost rate for frugality scoring and telemetry (SP-096).
 * Subscription-quota virtual cost takes precedence over API/catalog rates.
 *
 * SP-243 (#165): the resolved rate is soft-biased by the peak/off-peak
 * schedule adapters (Z.ai credits default 0.5× off-peak; DeepSeek 0.5×
 * off-peak) via `peak.now` (defaults to the current time). Non-target
 * providers resolve multiplier 1 — no invented clocks, fail open.
 */
export function resolveFrugalityCostPer1M(
  model: ModelProfile,
  catalog: PriceCatalog | null,
  peak?: PeakPricingOptions,
): number {
  const base =
    model.pricing.quota_cost_per_1m !== undefined
      ? model.pricing.quota_cost_per_1m
      : resolvePrice(model, catalog).cost_per_1m_tokens;
  return base * resolvePeakPricingAdjustment(model, peak).cost_multiplier;
}
