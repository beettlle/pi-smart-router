/**
 * Tri-tier price broker — FR-019 (T053).
 *
 * Resolves per-model pricing using a strict priority cascade:
 *   1. Operator overrides (highest priority)
 *   2. Registry snapshot (refreshed external data)
 *   3. YAML/catalog fallback (ModelProfile.pricing.fallback_cost_per_1m)
 *
 * The broker is a pure function layer; it reads from the PriceCatalog
 * and ModelProfile without side effects.
 */
import type { ModelProfile, PriceCatalog, PriceSource } from '../../domain/types/index.js';
export interface ResolvedPrice {
    readonly model_id: string;
    readonly cost_per_1m_tokens: number;
    readonly source: PriceSource;
}
/**
 * Resolve the effective price for a single model.
 *
 * Priority: operator override → registry snapshot → catalog fallback.
 * Always returns a price — the fallback from ModelProfile is guaranteed
 * by schema to exist.
 */
export declare function resolvePrice(model: ModelProfile, catalog: PriceCatalog | null): ResolvedPrice;
/**
 * Resolve prices for the entire fleet in a single pass.
 *
 * Returns a Map keyed by model ID for O(1) lookup during scoring.
 */
export declare function resolveFleetPrices(fleet: readonly ModelProfile[], catalog: PriceCatalog | null): ReadonlyMap<string, ResolvedPrice>;
/**
 * Apply tri-tier resolved prices to fleet profiles for routing/scoring.
 * When no catalog is loaded, returns the fleet unchanged.
 */
export declare function applyCatalogPricesToFleet(fleet: readonly ModelProfile[], catalog: PriceCatalog | null): ModelProfile[];
//# sourceMappingURL=price-broker.d.ts.map