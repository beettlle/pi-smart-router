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
 *
 * SP-097: Cursor subscription quota exhaustion detection and failover to
 * `cursor/auto` or economical API models with `cursor_quota_exhausted` telemetry.
 */

import type {
  ModelProfile,
  RoutingDecision,
  RoutingRequest,
} from '../../domain/types/index.js';
import { RouterPipeline } from '../../domain/pipeline/router-pipeline.js';
import type { PipelineOptions } from '../../domain/pipeline/router-pipeline.js';
import { CircuitBreaker, isInfraError } from './circuit-breaker.js';
import type { CircuitBreakerConfig } from './circuit-breaker.js';

// ─── Cache marker tracking (FR-023) ──────────────────────────────────────────

export interface CacheMarker {
  readonly sessionId: string;
  readonly provider: string;
  readonly modelId: string;
  readonly cacheFriendly: boolean;
}

// ─── Rate limit rejection (T057, FR-017) ─────────────────────────────────────

export interface RateLimitResult {
  readonly limited: true;
  readonly error: 'rate_limit_exceeded';
  /** Seconds until the bucket refills enough for the next request. */
  readonly retry_after_seconds: number;
}

export interface RateLimitPort {
  /** Attempt to consume a token for the given key. */
  consumeToken(key: string, cost?: number): { allowed: boolean; remaining: number; retryAfterSeconds: number | null };
}

// ─── Cursor quota exhaustion (SP-097 / #70) ──────────────────────────────────

export interface ProviderErrorShape {
  readonly statusCode?: number;
  readonly code?: string;
  readonly message?: string;
}

const CURSOR_QUOTA_MESSAGE_PATTERNS: readonly RegExp[] = [
  /usage\s+limit/i,
  /hit your usage/i,
  /quota\s+exhaust/i,
  /subscription.*limit/i,
  /switch to auto/i,
];

const CURSOR_QUOTA_ERROR_CODES = new Set([
  'usage_limit_exceeded',
  'resource_exhausted',
  'quota_exceeded',
  'insufficient_quota',
]);

/**
 * Classify Cursor subscription quota / usage-limit errors from dogfood evidence
 * (#70: "You've hit your usage limit… Switch to Auto for more usage…").
 */
export function isCursorQuotaExhaustedError(error: ProviderErrorShape): boolean {
  const code = error.code?.trim().toLowerCase();
  if (code && CURSOR_QUOTA_ERROR_CODES.has(code)) {
    return true;
  }

  const message = error.message ?? '';
  if (message.length > 0 && CURSOR_QUOTA_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }

  if (error.statusCode === 429 && /usage|quota|limit/i.test(message)) {
    return true;
  }

  return false;
}

/** Cursor frontier models billed against subscription quota (composer-*, cursor/*). */
export function isCursorSubscriptionModel(model: ModelProfile): boolean {
  const provider = model.provider.trim().toLowerCase();
  if (provider === 'cursor') {
    return true;
  }

  const id = model.id.trim().toLowerCase();
  return id.startsWith('composer-') || id.startsWith('cursor/');
}

/** Cursor opaque-auto models (`cursor/auto`, `cursor/*`). */
export function isCursorAutoModel(model: ModelProfile): boolean {
  const id = model.id.trim().toLowerCase();
  return id === 'cursor/auto' || id === 'auto' || id.startsWith('cursor/');
}

/**
 * Whether a provider error should trigger model failover (infra or Cursor quota).
 * Quota exhaustion on Cursor subscription models must not trip the circuit breaker.
 */
export function shouldFailoverOnProviderError(
  error: ProviderErrorShape,
  failedModel?: ModelProfile,
): boolean {
  if (isCursorQuotaExhaustedError(error)) {
    return true;
  }

  if (failedModel && isCursorSubscriptionModel(failedModel) && error.statusCode === 429) {
    return true;
  }

  return isInfraError(error);
}

// ─── Dispatch options ────────────────────────────────────────────────────────

export interface GatewayDispatchOptions extends PipelineOptions {
  readonly circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  readonly rateLimiter?: RateLimitPort;
}

export interface GatewayDispatchRequestOptions {
  readonly effectiveFleet?: readonly ModelProfile[];
}

// ─── Weighted model selection (T056) ─────────────────────────────────────────

/**
 * Select a model from same-tier candidates using inverse-cost weighting.
 * Models with lower cost get proportionally more traffic. Falls back to
 * uniform random when all costs are equal.
 */
export function weightedSelect(
  candidates: readonly ModelProfile[],
): ModelProfile | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const costs = candidates.map((c) => c.pricing.fallback_cost_per_1m);
  const maxCost = Math.max(...costs);

  if (maxCost === 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  const weights = costs.map((c) => (maxCost + 1) / (c + 1));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let random = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    random -= weights[i]!;
    if (random <= 0) return candidates[i];
  }

  return candidates[candidates.length - 1];
}

export class GatewayDispatch {
  private readonly pipeline: RouterPipeline;
  private readonly fleet: readonly ModelProfile[];
  private readonly cacheMarkers = new Map<string, CacheMarker>();
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimitPort | undefined;
  private readonly quotaExhaustedModels = new Set<string>();

  constructor(fleet: readonly ModelProfile[], options?: GatewayDispatchOptions) {
    this.fleet = fleet;
    this.pipeline = new RouterPipeline(fleet, options);
    this.circuitBreaker = new CircuitBreaker(options?.circuitBreakerConfig);
    this.rateLimiter = options?.rateLimiter;
  }

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
  async dispatch(
    request: RoutingRequest,
    options?: GatewayDispatchRequestOptions,
  ): Promise<RoutingDecision> {
    const effectiveFleet = options?.effectiveFleet ?? this.fleet;
    const decision = await this.pipeline.route(request, effectiveFleet);
    const finalDecision = this.applyCircuitBreaker(decision, effectiveFleet);
    this.updateCacheMarker(request.session_id, finalDecision);
    return finalDecision;
  }

  /**
   * Route with per-key rate limiting (T057, FR-017).
   *
   * Checks the token bucket before routing. Returns a RateLimitResult with
   * 429-compatible body `{ error, retry_after_seconds }` when the bucket is
   * exhausted. Otherwise delegates to dispatch().
   */
  async dispatchWithRateLimit(
    request: RoutingRequest,
    rateLimitKey: string,
  ): Promise<RoutingDecision | RateLimitResult> {
    if (this.rateLimiter) {
      const bucket = this.rateLimiter.consumeToken(rateLimitKey);
      if (!bucket.allowed) {
        return {
          limited: true,
          error: 'rate_limit_exceeded',
          retry_after_seconds: bucket.retryAfterSeconds ?? 0,
        };
      }
    }

    return this.dispatch(request);
  }

  /**
   * Record an upstream response outcome for circuit breaker tracking.
   * Only infra errors trip the breaker; policy/safety rejections are ignored (FR-018).
   * Cursor quota exhaustion is tracked for SP-097 failover without opening circuits.
   */
  recordOutcome(
    modelId: string,
    error?: ProviderErrorShape,
  ): void {
    if (!error) {
      this.circuitBreaker.recordSuccess(modelId);
      return;
    }

    if (isCursorQuotaExhaustedError(error)) {
      this.quotaExhaustedModels.add(modelId);
      return;
    }

    const failedModel = this.fleet.find((m) => m.id === modelId);
    if (failedModel && isCursorSubscriptionModel(failedModel) && error.statusCode === 429) {
      this.quotaExhaustedModels.add(modelId);
      return;
    }

    if (isInfraError(error)) {
      this.circuitBreaker.recordFailure(modelId);
    }
  }

  /** Expose circuit breaker for observability and testing. */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /** Whether a model recently returned a Cursor quota exhaustion error (SP-097). */
  hasQuotaExhaustion(modelId: string): boolean {
    return this.quotaExhaustedModels.has(modelId);
  }

  /**
   * Retrieve the current cache marker for a session (FR-023 inspection).
   */
  getCacheMarker(sessionId: string): CacheMarker | null {
    return this.cacheMarkers.get(sessionId) ?? null;
  }

  /**
   * Select an alternate model when the current target is unavailable or failed.
   * Prefers same-tier healthy models with closed circuits, then any tier.
   * When the failed model hit Cursor quota limits, prefers `cursor/auto` then
   * economical API models with `cursor_quota_exhausted`.
   */
  selectFailover(
    decision: RoutingDecision,
    excludeModelIds: readonly string[] = [],
    fleetOverride?: readonly ModelProfile[],
  ): RoutingDecision | undefined {
    const excluded = new Set(excludeModelIds);
    const fleet = fleetOverride ?? this.fleet;

    const quotaFailover = this.selectCursorQuotaFailover(decision, excluded, fleet);
    if (quotaFailover) {
      return quotaFailover;
    }

    const sameTier = fleet.filter(
      (m) =>
        m.tier === decision.tier &&
        m.id !== decision.selected_model_id &&
        !excluded.has(m.id) &&
        m.healthy !== false &&
        this.circuitBreaker.canDispatch(m.id),
    );

    const sameTierAlternative = weightedSelect(sameTier);
    if (sameTierAlternative) {
      return {
        ...decision,
        selected_model_id: sameTierAlternative.id,
        reason_code: 'circuit_breaker_failover',
      };
    }

    const anyHealthy = fleet.filter(
      (m) =>
        m.id !== decision.selected_model_id &&
        !excluded.has(m.id) &&
        m.healthy !== false &&
        this.circuitBreaker.canDispatch(m.id),
    );

    const fallback = weightedSelect(anyHealthy);
    if (fallback) {
      return {
        ...decision,
        selected_model_id: fallback.id,
        tier: fallback.tier,
        reason_code: 'circuit_breaker_failover',
      };
    }

    return undefined;
  }

  /**
   * If the selected model's circuit is open, attempt to fail over to
   * an alternative model on the same tier (T056 weighted distribution).
   * Falls back to any healthy model on any tier if no same-tier alternative exists.
   */
  private applyCircuitBreaker(
    decision: RoutingDecision,
    fleet: readonly ModelProfile[] = this.fleet,
  ): RoutingDecision {
    if (this.circuitBreaker.canDispatch(decision.selected_model_id)) {
      return decision;
    }

    return this.selectFailover(decision, [], fleet) ?? decision;
  }

  /**
   * SP-097: fail over from quota-exhausted Cursor models to `cursor/auto` or
   * the cheapest viable economical API model in the scoped fleet.
   */
  private selectCursorQuotaFailover(
    decision: RoutingDecision,
    excluded: ReadonlySet<string>,
    fleet: readonly ModelProfile[],
  ): RoutingDecision | undefined {
    const failedIds = [decision.selected_model_id, ...excluded];
    const quotaFailed = failedIds.some((id) => this.quotaExhaustedModels.has(id));
    if (!quotaFailed) {
      return undefined;
    }

    const failedModel = fleet.find((m) => m.id === decision.selected_model_id);
    if (failedModel && !isCursorSubscriptionModel(failedModel)) {
      return undefined;
    }

    const cursorAuto = fleet.find(
      (m) =>
        isCursorAutoModel(m) &&
        !excluded.has(m.id) &&
        m.id !== decision.selected_model_id &&
        m.healthy !== false &&
        this.circuitBreaker.canDispatch(m.id),
    );
    if (cursorAuto) {
      return {
        ...decision,
        selected_model_id: cursorAuto.id,
        tier: cursorAuto.tier,
        reason_code: 'cursor_quota_exhausted',
      };
    }

    const economical = fleet.filter(
      (m) =>
        m.tier === 'economical-cloud' &&
        !excluded.has(m.id) &&
        m.id !== decision.selected_model_id &&
        m.healthy !== false &&
        !isCursorSubscriptionModel(m) &&
        this.circuitBreaker.canDispatch(m.id),
    );
    const economicalFallback = weightedSelect(economical);
    if (economicalFallback) {
      return {
        ...decision,
        selected_model_id: economicalFallback.id,
        tier: economicalFallback.tier,
        reason_code: 'cursor_quota_exhausted',
      };
    }

    return undefined;
  }

  /**
   * FR-023: track the provider and cache-friendly status for the session.
   * Sub-routed requests on the same provider preserve the existing marker
   * rather than replacing it — the pin model's cache state is authoritative.
   */
  private updateCacheMarker(
    sessionId: string,
    decision: RoutingDecision,
  ): void {
    const model = this.fleet.find((m) => m.id === decision.selected_model_id);
    if (!model) return;

    const existing = this.cacheMarkers.get(sessionId);

    if (
      existing &&
      existing.provider === model.provider &&
      decision.reason_code === 'tool_result_sub_route'
    ) {
      return;
    }

    this.cacheMarkers.set(sessionId, {
      sessionId,
      provider: model.provider,
      modelId: model.id,
      cacheFriendly: model.performance?.cache_friendly ?? false,
    });
  }
}
