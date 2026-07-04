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

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  halfOpenSuccesses: 2,
};

export interface CircuitSnapshot {
  readonly modelId: string;
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly consecutiveSuccesses: number;
  readonly lastFailureAt: number | null;
  readonly lastStateChangeAt: number;
}

interface CircuitEntry {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureAt: number | null;
  lastStateChangeAt: number;
}

/**
 * Returns true when the error is an infrastructure failure that should
 * trigger the circuit breaker. Policy/safety rejections are excluded
 * per FR-018.
 */
export function isInfraError(error: { statusCode?: number; code?: string; message?: string }): boolean {
  if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' ||
      error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.code === 'UND_ERR_SOCKET') {
    return true;
  }

  if (error.statusCode !== undefined) {
    if (error.statusCode >= 500 || error.statusCode === 429) {
      return true;
    }
    // Handle Gemini 2.0 thought_signature generation failures as transient infra errors
    if (error.statusCode === 400 && error.message?.includes('thought_signature')) {
      return true;
    }
  }

  return false;
}

export class CircuitBreaker {
  private readonly circuits = new Map<string, CircuitEntry>();
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Check whether a model endpoint is available for requests.
   * OPEN circuits reject immediately. OPEN circuits whose reset timeout
   * has elapsed transition to HALF_OPEN and allow a probe.
   */
  canDispatch(modelId: string): boolean {
    const entry = this.circuits.get(modelId);
    if (!entry) return true;

    if (entry.state === 'closed' || entry.state === 'half_open') {
      return true;
    }

    const elapsed = Date.now() - entry.lastStateChangeAt;
    if (elapsed >= this.config.resetTimeoutMs) {
      entry.state = 'half_open';
      entry.consecutiveSuccesses = 0;
      entry.lastStateChangeAt = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Record a successful response from a model endpoint.
   * In HALF_OPEN, accumulates successes until the threshold is met,
   * then transitions to CLOSED. In CLOSED, resets the failure counter.
   */
  recordSuccess(modelId: string): void {
    const entry = this.circuits.get(modelId);
    if (!entry) return;

    entry.consecutiveFailures = 0;

    if (entry.state === 'half_open') {
      entry.consecutiveSuccesses += 1;
      if (entry.consecutiveSuccesses >= this.config.halfOpenSuccesses) {
        entry.state = 'closed';
        entry.lastStateChangeAt = Date.now();
      }
    } else if (entry.state === 'closed') {
      entry.consecutiveSuccesses = 0;
    }
  }

  /**
   * Record an infrastructure failure from a model endpoint.
   * Only infra errors should be reported here (caller checks isInfraError).
   * HALF_OPEN → OPEN immediately. CLOSED → OPEN when threshold exceeded.
   */
  recordFailure(modelId: string): void {
    const now = Date.now();
    let entry = this.circuits.get(modelId);

    if (!entry) {
      entry = {
        state: 'closed',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureAt: null,
        lastStateChangeAt: now,
      };
      this.circuits.set(modelId, entry);
    }

    entry.consecutiveFailures += 1;
    entry.lastFailureAt = now;
    entry.consecutiveSuccesses = 0;

    if (entry.state === 'half_open') {
      entry.state = 'open';
      entry.lastStateChangeAt = now;
      return;
    }

    if (entry.consecutiveFailures >= this.config.failureThreshold) {
      entry.state = 'open';
      entry.lastStateChangeAt = now;
    }
  }

  /** Get a read-only snapshot of a model's circuit state. */
  getSnapshot(modelId: string): CircuitSnapshot {
    const entry = this.circuits.get(modelId);
    if (!entry) {
      return {
        modelId,
        state: 'closed',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureAt: null,
        lastStateChangeAt: 0,
      };
    }

    return {
      modelId,
      state: entry.state,
      consecutiveFailures: entry.consecutiveFailures,
      consecutiveSuccesses: entry.consecutiveSuccesses,
      lastFailureAt: entry.lastFailureAt,
      lastStateChangeAt: entry.lastStateChangeAt,
    };
  }

  /** Reset a specific model's circuit to CLOSED. */
  reset(modelId: string): void {
    this.circuits.delete(modelId);
  }

  /** List all model IDs with OPEN circuits (unhealthy endpoints). */
  getOpenCircuits(): readonly string[] {
    const open: string[] = [];
    for (const [modelId, entry] of this.circuits) {
      if (entry.state === 'open') {
        open.push(modelId);
      }
    }
    return open;
  }
}
