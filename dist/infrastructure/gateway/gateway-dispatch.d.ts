/**
 * Gateway dispatch — T020, T055, T056, FR-001, FR-017, FR-018, FR-022, FR-023.
 *
 * Infrastructure entry point that delegates routing to the domain pipeline.
 * Integrates circuit breaker for resilient failover (FR-018: infra errors only),
 * weighted distribution across same-tier model endpoints (T056), and
 * per-key rate limiting with 429 + Retry-After responses (T057, FR-017).
 *
 * FR-023: preserves provider context-caching semantics on same-provider
 * request paths by tracking the last-used provider per session.
 */
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../domain/types/index.js';
import type { PipelineOptions } from '../../domain/pipeline/router-pipeline.js';
import { CircuitBreaker } from './circuit-breaker.js';
import type { CircuitBreakerConfig } from './circuit-breaker.js';
export interface CacheMarker {
    readonly sessionId: string;
    readonly provider: string;
    readonly modelId: string;
    readonly cacheFriendly: boolean;
}
export interface RateLimitResult {
    readonly limited: true;
    readonly error: 'rate_limit_exceeded';
    /** Seconds until the bucket refills enough for the next request. */
    readonly retry_after_seconds: number;
}
export interface RateLimitPort {
    /** Attempt to consume a token for the given key. */
    consumeToken(key: string, cost?: number): {
        allowed: boolean;
        remaining: number;
        retryAfterSeconds: number | null;
    };
}
export interface GatewayDispatchOptions extends PipelineOptions {
    readonly circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
    readonly rateLimiter?: RateLimitPort;
}
/**
 * Select a model from same-tier candidates using inverse-cost weighting.
 * Models with lower cost get proportionally more traffic. Falls back to
 * uniform random when all costs are equal.
 */
export declare function weightedSelect(candidates: readonly ModelProfile[]): ModelProfile | undefined;
export declare class GatewayDispatch {
    private readonly pipeline;
    private readonly fleet;
    private readonly cacheMarkers;
    private readonly circuitBreaker;
    private readonly rateLimiter;
    constructor(fleet: readonly ModelProfile[], options?: GatewayDispatchOptions);
    /**
     * Route a single request through the pipeline.
     *
     * 1. Run pipeline to get routing decision.
     * 2. Verify circuit breaker allows dispatch to the selected model.
     * 3. If the selected model's circuit is open, attempt failover to a
     *    same-tier alternative (T056).
     * 4. Update FR-023 cache marker.
     *
     * Never throws.
     */
    dispatch(request: RoutingRequest): Promise<RoutingDecision>;
    /**
     * Route with per-key rate limiting (T057, FR-017).
     *
     * Checks the token bucket before routing. Returns a RateLimitResult with
     * 429-compatible body `{ error, retry_after_seconds }` when the bucket is
     * exhausted. Otherwise delegates to dispatch().
     */
    dispatchWithRateLimit(request: RoutingRequest, rateLimitKey: string): Promise<RoutingDecision | RateLimitResult>;
    /**
     * Record an upstream response outcome for circuit breaker tracking.
     * Only infra errors trip the breaker; policy/safety rejections are ignored (FR-018).
     */
    recordOutcome(modelId: string, error?: {
        statusCode?: number;
        code?: string;
    }): void;
    /** Expose circuit breaker for observability and testing. */
    getCircuitBreaker(): CircuitBreaker;
    /**
     * Retrieve the current cache marker for a session (FR-023 inspection).
     */
    getCacheMarker(sessionId: string): CacheMarker | null;
    /**
     * Select an alternate model when the current target is unavailable or failed.
     * Prefers same-tier healthy models with closed circuits, then any tier.
     */
    selectFailover(decision: RoutingDecision, excludeModelIds?: readonly string[]): RoutingDecision | undefined;
    /**
     * If the selected model's circuit is open, attempt to fail over to
     * an alternative model on the same tier (T056 weighted distribution).
     * Falls back to any healthy model on any tier if no same-tier alternative exists.
     */
    private applyCircuitBreaker;
    /**
     * FR-023: track the provider and cache-friendly status for the session.
     * Sub-routed requests on the same provider preserve the existing marker
     * rather than replacing it — the pin model's cache state is authoritative.
     */
    private updateCacheMarker;
}
//# sourceMappingURL=gateway-dispatch.d.ts.map