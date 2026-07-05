/**
 * Cache-warmup economics — FR-008 rule #4, SC-006.
 *
 * Decides whether switching providers justifies the cache-warmup penalty.
 * A provider switch invalidates upstream KV-cache, so the router must
 * compare the warmup cost against projected savings from the candidate
 * model before breaking a pin.
 *
 * When warmup cost exceeds projected savings the pin holds (User Story 4,
 * scenario 4).
 */
// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_WARMUP_COST_MULTIPLIER = 1.15;
const DEFAULT_MIN_SAVINGS_THRESHOLD = 0.10;
const DEFAULT_PROJECTED_REMAINING_TURNS = 5;
// ─── Evaluation ───────────────────────────────────────────────────────────────
/**
 * Evaluate whether switching from the currently-pinned model to a candidate
 * on a different provider is justified by projected cost savings.
 *
 * Returns `shouldSwitch: false` when:
 * - Candidate is on the same provider (no cache penalty).
 *   Caller should handle same-provider switches without this check.
 * - Warmup cost exceeds projected savings.
 * - Savings fall below the minimum threshold.
 *
 * Returns `shouldSwitch: true` only when projected savings meaningfully
 * exceed the cache-warmup penalty.
 */
export function evaluateCacheEconomics(pin, pinnedModel, candidate, estimatedInputTokens, config) {
    const warmupMultiplier = config?.warmupCostMultiplier ?? DEFAULT_WARMUP_COST_MULTIPLIER;
    const minSavings = config?.minSavingsThreshold ?? DEFAULT_MIN_SAVINGS_THRESHOLD;
    const remainingTurns = config?.projectedRemainingTurns ?? DEFAULT_PROJECTED_REMAINING_TURNS;
    if (pinnedModel.provider === candidate.provider) {
        return {
            shouldSwitch: false,
            warmupCostUsd: 0,
            projectedSavingsUsd: 0,
            reason: 'same_provider_no_cache_penalty',
        };
    }
    const tokenCountM = estimatedInputTokens / 1_000_000;
    const warmupTokens = estimatedInputTokens * (warmupMultiplier - 1);
    const warmupCostUsd = (warmupTokens / 1_000_000) * candidate.pricing.fallback_cost_per_1m;
    const perTurnSavings = (pinnedModel.pricing.fallback_cost_per_1m -
        candidate.pricing.fallback_cost_per_1m) *
        tokenCountM;
    const projectedSavingsUsd = perTurnSavings * remainingTurns;
    if (projectedSavingsUsd < minSavings) {
        return {
            shouldSwitch: false,
            warmupCostUsd,
            projectedSavingsUsd,
            reason: 'savings_below_threshold',
        };
    }
    if (warmupCostUsd >= projectedSavingsUsd) {
        return {
            shouldSwitch: false,
            warmupCostUsd,
            projectedSavingsUsd,
            reason: 'warmup_exceeds_savings',
        };
    }
    return {
        shouldSwitch: true,
        warmupCostUsd,
        projectedSavingsUsd,
        reason: 'switch_justified',
    };
}
//# sourceMappingURL=cache-economics.js.map
