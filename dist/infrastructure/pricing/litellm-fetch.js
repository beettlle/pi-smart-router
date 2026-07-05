/**
 * LiteLLM pricing fetch — manual refresh path (SP-045).
 *
 * Fetches the public LiteLLM model pricing JSON and normalizes chat-model
 * rates into PriceCatalog.registry_snapshot entries keyed by model id and
 * provider/model aliases for tri-tier broker lookup.
 */
export const DEFAULT_LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const CHAT_MODES = new Set(['chat', 'completion']);
export class LitellmFetchError extends Error {
    name = 'LitellmFetchError';
}
/**
 * Resolve pricing URL from env with documented LiteLLM GitHub default.
 */
export function getLitellmPricingUrl(env = process.env) {
    const configured = env.LITELLM_PRICING_URL?.trim();
    return configured && configured.length > 0 ? configured : DEFAULT_LITELLM_PRICING_URL;
}
/**
 * Weighted blend of input/output per-token rates → USD per 1M tokens.
 * Matches the registry-cost formula planned for SP-046.
 */
export function computeCostPer1MTokens(inputCostPerToken, outputCostPerToken) {
    const inputPer1M = inputCostPerToken * 1_000_000;
    const outputPer1M = outputCostPerToken * 1_000_000;
    return (inputPer1M + outputPer1M) / 2;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readNumberField(entry, field) {
    const value = entry[field];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function readStringField(entry, field) {
    const value = entry[field];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
/**
 * Normalize LiteLLM pricing JSON into registry_snapshot rates.
 * Validates shape and fails fast with actionable errors.
 */
export function normalizeLitellmPricing(raw) {
    if (!isRecord(raw)) {
        throw new LitellmFetchError('LiteLLM pricing response must be a JSON object. Check LITELLM_PRICING_URL points at model_prices_and_context_window.json.');
    }
    const registry_snapshot = {};
    let modelCount = 0;
    for (const [modelKey, entry] of Object.entries(raw)) {
        if (modelKey === 'sample_spec') {
            continue;
        }
        if (!isRecord(entry)) {
            throw new LitellmFetchError(`LiteLLM pricing entry "${modelKey}" must be an object. Received ${typeof entry}.`);
        }
        const mode = readStringField(entry, 'mode');
        if (mode !== undefined && !CHAT_MODES.has(mode)) {
            continue;
        }
        const inputCost = readNumberField(entry, 'input_cost_per_token');
        const outputCost = readNumberField(entry, 'output_cost_per_token');
        if (inputCost === undefined || outputCost === undefined) {
            continue;
        }
        const costPer1M = computeCostPer1MTokens(inputCost, outputCost);
        registry_snapshot[modelKey] = costPer1M;
        modelCount += 1;
        const provider = readStringField(entry, 'litellm_provider');
        if (provider !== undefined) {
            registry_snapshot[`${provider}/${modelKey}`] = costPer1M;
        }
    }
    if (Object.keys(registry_snapshot).length === 0) {
        throw new LitellmFetchError('LiteLLM pricing response contained no chat models with input/output token costs.');
    }
    return {
        registry_snapshot,
        model_count: modelCount,
    };
}
/**
 * Fetch LiteLLM pricing and build a PriceCatalog payload (does not persist).
 */
export async function fetchLitellmPriceCatalog(deps = {}) {
    const fetchFn = deps.fetchFn ?? fetch;
    const url = deps.pricingUrl ?? getLitellmPricingUrl();
    let response;
    try {
        response = await fetchFn(url);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new LitellmFetchError(`Failed to fetch LiteLLM pricing from ${url}: ${detail}`);
    }
    if (!response.ok) {
        throw new LitellmFetchError(`LiteLLM pricing fetch failed (${response.status} ${response.statusText}) from ${url}`);
    }
    let raw;
    try {
        raw = await response.json();
    }
    catch {
        throw new LitellmFetchError(`LiteLLM pricing response from ${url} is not valid JSON.`);
    }
    const normalized = normalizeLitellmPricing(raw);
    return {
        catalog: {
            registry_snapshot: normalized.registry_snapshot,
            user_overrides: {},
            last_updated: new Date().toISOString(),
            source: 'registry',
        },
        model_count: normalized.model_count,
    };
}
//# sourceMappingURL=litellm-fetch.js.map