/**
 * Tri-tier price broker — FR-019 (T053).
 *
 * Resolves per-model pricing using a strict priority cascade:
 *   1. Operator overrides (highest priority)
 *   2. Registry snapshot (refreshed external data)
 *   3. YAML/catalog fallback (ModelProfile.pricing.fallback_cost_per_1m)
 *
 * SP-276 (#143): the pure cascade (`resolvePrice`) and the frugality rate
 * (`resolveFrugalityCostPer1M`) moved to `domain/pricing/price-resolution.js`
 * to finish the domain→infra inversion; this module re-exports them for
 * import-path stability. What remains here is limit resolution and
 * fleet-mapping, which depend on `config/pi-model-mapper` tier defaults.
 */

import type { ModelProfile, ModelLimits, PriceCatalog } from '../../domain/types/index.js';
import { getDefaultLimitsForTier } from '../../config/pi-model-mapper.js';

export {
  resolvePrice,
  resolveFrugalityCostPer1M,
  type ResolvedPrice,
} from '../../domain/pricing/price-resolution.js';
import {
  resolvePrice,
  type ResolvedPrice,
} from '../../domain/pricing/price-resolution.js';

export interface ResolvedLimits {
  readonly model_id: string;
  readonly limits: ModelLimits;
}

function lookupRegistryLimits(
  model: ModelProfile,
  catalog: PriceCatalog,
): ModelLimits | undefined {
  const snapshot = catalog.registry_limits_snapshot;
  if (!snapshot) {
    return undefined;
  }

  const registryKey = model.pricing.registry_key ?? model.id;
  return snapshot[registryKey] ?? snapshot[model.id];
}

/**
 * Resolve effective context limits for a model.
 *
 * Priority: YAML/profile override → LiteLLM registry snapshot → tier default.
 */
export function resolveLimits(
  model: ModelProfile,
  catalog: PriceCatalog | null,
): ResolvedLimits {
  const yamlLimits = model.limits;
  const registryLimits = catalog ? lookupRegistryLimits(model, catalog) : undefined;
  const defaults = getDefaultLimitsForTier(model.tier);

  return {
    model_id: model.id,
    limits: {
      max_input_tokens:
        yamlLimits?.max_input_tokens ??
        registryLimits?.max_input_tokens ??
        defaults.max_input_tokens,
      max_output_tokens:
        yamlLimits?.max_output_tokens ??
        registryLimits?.max_output_tokens ??
        defaults.max_output_tokens,
    },
  };
}

/**
 * Apply resolved context limits to fleet profiles for routing gates (SP-092).
 */
export function applyCatalogLimitsToFleet(
  fleet: readonly ModelProfile[],
  catalog: PriceCatalog | null,
): ModelProfile[] {
  return fleet.map((profile) => {
    const resolved = resolveLimits(profile, catalog);
    return {
      ...profile,
      limits: resolved.limits,
    };
  });
}

/**
 * Resolve prices for the entire fleet in a single pass.
 *
 * Returns a Map keyed by model ID for O(1) lookup during scoring.
 */
export function resolveFleetPrices(
  fleet: readonly ModelProfile[],
  catalog: PriceCatalog | null,
): ReadonlyMap<string, ResolvedPrice> {
  const prices = new Map<string, ResolvedPrice>();
  for (const model of fleet) {
    prices.set(model.id, resolvePrice(model, catalog));
  }
  return prices;
}

/**
 * Apply tri-tier resolved prices and context limits to fleet profiles.
 * When no catalog is loaded, applies tier default limits only.
 */
export function applyCatalogPricesToFleet(
  fleet: readonly ModelProfile[],
  catalog: PriceCatalog | null,
): ModelProfile[] {
  if (!catalog) {
    return applyCatalogLimitsToFleet(fleet, catalog);
  }

  const prices = resolveFleetPrices(fleet, catalog);

  const priced = fleet.map((profile) => {
    const resolved = prices.get(profile.id);
    if (!resolved || resolved.source === 'yaml_fallback') {
      return profile;
    }

    return {
      ...profile,
      pricing: {
        ...profile.pricing,
        fallback_cost_per_1m: resolved.cost_per_1m_tokens,
      },
    };
  });

  return applyCatalogLimitsToFleet(priced, catalog);
}
