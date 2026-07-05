/**
 * LiteLLM pricing fetch — manual refresh path (SP-045).
 *
 * Fetches the public LiteLLM model pricing JSON and normalizes chat-model
 * rates into PriceCatalog.registry_snapshot entries keyed by model id and
 * provider/model aliases for tri-tier broker lookup.
 */
import type { PriceCatalog } from '../../domain/types/index.js';
export declare const DEFAULT_LITELLM_PRICING_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
export interface LitellmFetchResult {
    readonly registry_snapshot: Readonly<Record<string, number>>;
    /** Number of LiteLLM chat/completion models normalized (before alias keys). */
    readonly model_count: number;
}
export interface LitellmFetchDeps {
    readonly fetchFn?: typeof fetch;
    readonly pricingUrl?: string;
}
export declare class LitellmFetchError extends Error {
    readonly name = "LitellmFetchError";
}
/**
 * Resolve pricing URL from env with documented LiteLLM GitHub default.
 */
export declare function getLitellmPricingUrl(env?: NodeJS.ProcessEnv): string;
/**
 * Weighted blend of input/output per-token rates → USD per 1M tokens.
 * Matches the registry-cost formula planned for SP-046.
 */
export declare function computeCostPer1MTokens(inputCostPerToken: number, outputCostPerToken: number): number;
/**
 * Normalize LiteLLM pricing JSON into registry_snapshot rates.
 * Validates shape and fails fast with actionable errors.
 */
export declare function normalizeLitellmPricing(raw: unknown): LitellmFetchResult;
export interface LitellmPriceCatalogResult {
    readonly catalog: PriceCatalog;
    /** Number of chat/completion models in the LiteLLM source payload. */
    readonly model_count: number;
}
/**
 * Fetch LiteLLM pricing and build a PriceCatalog payload (does not persist).
 */
export declare function fetchLitellmPriceCatalog(deps?: LitellmFetchDeps): Promise<LitellmPriceCatalogResult>;
//# sourceMappingURL=litellm-fetch.d.ts.map
