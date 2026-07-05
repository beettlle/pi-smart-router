/**
 * Circuit breaker for gateway dispatch — T055, FR-018, FR-022.
 *
 * Tracks consecutive infrastructure failures per model endpoint and trips
 * the breaker when the threshold is exceeded. Only infra errors (timeouts,
 * network failures, 5xx) count — policy/safety rejections (4xx content
 * filtering, 403 auth) do NOT trigger the breaker (FR-018).
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED (on success) or OPEN (on fail).
 */
export type CircuitState = 'closed' | 'open' | 'half_open';
export interface CircuitBreakerConfig {
    /** Consecutive infra failures before tripping the breaker. */
    readonly failureThreshold: number;
    /** Milliseconds to remain in OPEN state before allowing a probe. */
    readonly resetTimeoutMs: number;
    /** Max consecutive successes in HALF_OPEN required to close. */
    readonly halfOpenSuccesses: number;
}
export declare const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig;
export interface CircuitSnapshot {
    readonly modelId: string;
    readonly state: CircuitState;
    readonly consecutiveFailures: number;
    readonly consecutiveSuccesses: number;
    readonly lastFailureAt: number | null;
    readonly lastStateChangeAt: number;
}
/**
 * Returns true when the error is an infrastructure failure that should
 * trigger the circuit breaker. Policy/safety rejections are excluded
 * per FR-018.
 */
export declare function isInfraError(error: {
    statusCode?: number;
    code?: string;
    message?: string;
}): boolean;
export declare class CircuitBreaker {
    private readonly circuits;
    private readonly config;
    constructor(config?: Partial<CircuitBreakerConfig>);
    /**
     * Check whether a model endpoint is available for requests.
     * OPEN circuits reject immediately. OPEN circuits whose reset timeout
     * has elapsed transition to HALF_OPEN and allow a probe.
     */
    canDispatch(modelId: string): boolean;
    /**
     * Record a successful response from a model endpoint.
     * In HALF_OPEN, accumulates successes until the threshold is met,
     * then transitions to CLOSED. In CLOSED, resets the failure counter.
     */
    recordSuccess(modelId: string): void;
    /**
     * Record an infrastructure failure from a model endpoint.
     * Only infra errors should be reported here (caller checks isInfraError).
     * HALF_OPEN → OPEN immediately. CLOSED → OPEN when threshold exceeded.
     */
    recordFailure(modelId: string): void;
    /** Get a read-only snapshot of a model's circuit state. */
    getSnapshot(modelId: string): CircuitSnapshot;
    /** Reset a specific model's circuit to CLOSED. */
    reset(modelId: string): void;
    /** List all model IDs with OPEN circuits (unhealthy endpoints). */
    getOpenCircuits(): readonly string[];
}
//# sourceMappingURL=circuit-breaker.d.ts.map