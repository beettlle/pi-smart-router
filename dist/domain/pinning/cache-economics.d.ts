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
import type { ModelProfile, SessionPin } from '../types/index.js';
export interface CacheEconomicsConfig {
    /**
     * Multiplier applied to estimated_input_tokens to approximate
     * the token cost of re-prompting a cold provider cache.
     * Default: 1.15 (15 % warmup overhead).
     */
    readonly warmupCostMultiplier?: number;
    /**
     * Minimum per-1M-token savings required to justify a provider switch.
     * Prevents switching for negligible price differences.
     * Default: 0.10 (USD).
     */
    readonly minSavingsThreshold?: number;
    /**
     * Number of remaining turns to amortize savings over.
     * Higher values favor switching; lower values favor keeping the pin.
     * Default: 5.
     */
    readonly projectedRemainingTurns?: number;
}
export interface CacheEconomicsResult {
    readonly shouldSwitch: boolean;
    readonly warmupCostUsd: number;
    readonly projectedSavingsUsd: number;
    readonly reason: string;
}
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
export declare function evaluateCacheEconomics(pin: SessionPin, pinnedModel: ModelProfile, candidate: ModelProfile, estimatedInputTokens: number, config?: CacheEconomicsConfig): CacheEconomicsResult;
//# sourceMappingURL=cache-economics.d.ts.map