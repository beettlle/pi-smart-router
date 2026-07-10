/**
 * Session pinner — FR-006, FR-007, FR-008, FR-024.
 *
 * Pins a session to one model after the initial routing decision.
 * Pin holds across subsequent turns until a qualified break event.
 *
 * Break rules (FR-008, exhaustive):
 *   1. History compaction
 *   2. Context overflow (estimated tokens exceed pinned model window)
 *   3. Explicit operator/user override
 *   4. Qualified loop escalation (threshold managed externally)
 *   5. Cache-warmup economics when a cross-provider switch is proposed
 *
 * Sub-routing (FR-024): tool-result turns below the payload threshold
 * may use an economical model on the same provider without breaking the pin.
 */

import type {
  ModelProfile,
  PinReason,
  PriceCatalog,
  RoutingRequest,
  SaarConfig,
  SaarSessionState,
  SessionPin,
  Tier,
} from '../types/index.js';
import type { QuotaWindowPosition } from '../types/entities.js';
import { DEFAULT_SAAR_CONFIG, type VirtualCostV2Config } from '../types/schemas.js';
import type { StorePort } from '../types/store-port.js';
import { resolveFrugalityCostPer1M } from '../../infrastructure/pricing/price-broker.js';
import {
  computeKvCacheSavings,
  computeVirtualCostV2,
} from '../pricing/virtual-cost-v2.js';
import {
  evaluateCacheEconomics,
  type CacheEconomicsConfig,
} from './cache-economics.js';
import {
  evaluateCacheBreakevenForPrefix,
  type CacheBreakevenResult,
} from './cache-breakeven.js';
import {
  FlipFlopGuard,
  type FlipFlopObservation,
  type FlipFlopSessionState,
} from './flip-flop-guard.js';
import { SaarSessionStateTracker } from './saar-session-state.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PinAction = 'use_pin' | 'sub_route' | 'saar_route' | 'break' | 'no_pin';

export type PinSaarReason =
  | 'saar_buffer_active'
  | 'saar_hard_lock'
  | 'saar_idle_reopen'
  | 'saar_tier_upgrade';

export type PinFlipFlopReason = 'flip_flop_tier_pinned';

export interface PinLookupResult {
  readonly action: PinAction;
  readonly pinnedModel?: ModelProfile;
  readonly subRouteModel?: ModelProfile;
  readonly saarRouteModel?: ModelProfile;
  readonly saarReason?: PinSaarReason;
  readonly flipFlopReason?: PinFlipFlopReason;
  readonly breakReason?: PinReason;
}

export interface SessionPinnerConfig {
  /** FR-024: max payload size (bytes or token estimate) for sub-routing. Default 2048. */
  readonly toolResultSizeThreshold?: number;
  /** Optional persistence — pins survive process restart when set. */
  readonly store?: StorePort;
  /**
   * FR-008 rule #4: cache-warmup economics thresholds.
   */
  readonly cacheEconomicsConfig?: CacheEconomicsConfig;
  /** SAAR pin policy (SP-122). When omitted, SAAR behavior is disabled. */
  readonly saarConfig?: SaarConfig;
  /** Injectable clock for SAAR idle-timeout tests. */
  readonly saarClock?: () => number;
  /**
   * Emergency pin-only fallback (#83, SP-161). When true, warm sessions always
   * return use_pin after break rules — SAAR sub-routes and tier upgrades are skipped.
   */
  readonly pinOnlyFallback?: boolean;
  /**
   * Break pin when estimated input tokens exceed the pinned model's
   * max_input_tokens multiplied by this margin. Default 0.90.
   */
  readonly contextOverflowSafetyMargin?: number;
  /** Flip-flop tier pin guard (SP-155, #82). Injectable for tests. */
  readonly flipFlopGuard?: FlipFlopGuard;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_TOOL_RESULT_SIZE_THRESHOLD = 2048;
const DEFAULT_CONTEXT_OVERFLOW_SAFETY_MARGIN = 0.9;

const TIER_RANK: Readonly<Record<Tier, number>> = {
  'zero-tier': 0,
  'economical-cloud': 1,
  'frontier-cloud': 2,
};

function isTierUpgrade(from: Tier, to: Tier): boolean {
  return TIER_RANK[to] > TIER_RANK[from];
}

function isToolLoopTurn(turnType: RoutingRequest['turn_type']): boolean {
  return turnType === 'main_loop' || turnType === 'tool_result';
}

const TOKENS_PER_M = 1_000_000;

/** Virtual cost v2 context for subscription-aware breakeven (SP-149). */
export interface ModelSwitchBreakevenContext {
  readonly priceCatalog?: PriceCatalog | null;
  readonly quotaWindowPosition?: QuotaWindowPosition;
  readonly virtualCostV2Config?: VirtualCostV2Config;
}

/** Breakeven result with v2 economics observability (SP-149). */
export interface ModelSwitchBreakevenResult extends CacheBreakevenResult {
  readonly quota_premium_usd: number;
  readonly kv_cache_credit_usd: number;
}

function resolveEffectiveTurnCostUsd(
  model: ModelProfile,
  estimatedInputTokens: number,
  context: ModelSwitchBreakevenContext | undefined,
  pinActive: boolean,
  warmPrefixTokens: number,
): number {
  const baseCostPer1M = resolveFrugalityCostPer1M(
    model,
    context?.priceCatalog ?? null,
  );

  return computeVirtualCostV2({
    base_cost_per_1m: baseCostPer1M,
    est_tokens: estimatedInputTokens,
    pin_active: pinActive,
    warm_prefix_tokens: warmPrefixTokens,
    ...(context?.quotaWindowPosition !== undefined
      ? { window_position: context.quotaWindowPosition }
      : {}),
    ...(context?.virtualCostV2Config !== undefined
      ? { config: context.virtualCostV2Config }
      : {}),
  }).effective_cost_usd;
}

/**
 * Per-turn marginal savings from switching pinned → candidate on this request.
 * Uses SP-148 virtual cost v2 when context is provided (SP-149).
 */
export function computeMarginalSwitchSavings(
  pinnedModel: ModelProfile,
  candidateModel: ModelProfile,
  estimatedInputTokens: number,
  context?: ModelSwitchBreakevenContext,
): number {
  if (!Number.isFinite(estimatedInputTokens) || estimatedInputTokens < 0) {
    return 0;
  }

  if (!context) {
    return (
      ((pinnedModel.pricing.fallback_cost_per_1m -
        candidateModel.pricing.fallback_cost_per_1m) *
        estimatedInputTokens) /
      TOKENS_PER_M
    );
  }

  const pinnedCost = resolveEffectiveTurnCostUsd(
    pinnedModel,
    estimatedInputTokens,
    context,
    true,
    estimatedInputTokens,
  );
  const candidateCost = resolveEffectiveTurnCostUsd(
    candidateModel,
    estimatedInputTokens,
    context,
    false,
    0,
  );

  return pinnedCost - candidateCost;
}

/**
 * SAAR cache breakeven gate (#73) — shared by turn_envelope and session_pin.
 * `warmPrefixTokens` is 0 on cold sessions (no pin); otherwise the warm prefix size.
 * Composes KV-cache savings credit into total benefit when v2 context is set (SP-149).
 */
export function evaluateModelSwitchBreakeven(
  pinnedModel: ModelProfile,
  candidateModel: ModelProfile,
  estimatedInputTokens: number,
  warmPrefixTokens: number,
  saarConfig?: SaarConfig,
  breakevenContext?: ModelSwitchBreakevenContext,
): ModelSwitchBreakevenResult {
  if (pinnedModel.id === candidateModel.id) {
    return {
      shouldSwitch: true,
      marginal_savings: 0,
      future_cache_value: 0,
      cache_reprime_cost: 0,
      total_benefit: 0,
      reason: 'breakeven_pass',
      quota_premium_usd: 0,
      kv_cache_credit_usd: 0,
    };
  }

  if (!breakevenContext) {
    const marginal_savings = computeMarginalSwitchSavings(
      pinnedModel,
      candidateModel,
      estimatedInputTokens,
    );

    const prefixResult = evaluateCacheBreakevenForPrefix(
      marginal_savings,
      warmPrefixTokens,
      pinnedModel.pricing.fallback_cost_per_1m,
      candidateModel.pricing.fallback_cost_per_1m,
      saarConfig
        ? { prefix_cache_weight: saarConfig.prefix_cache_weight }
        : undefined,
    );

    return {
      ...prefixResult,
      quota_premium_usd: 0,
      kv_cache_credit_usd: 0,
    };
  }

  const marginal_savings = computeMarginalSwitchSavings(
    pinnedModel,
    candidateModel,
    estimatedInputTokens,
    breakevenContext,
  );

  const pinnedCostPer1M = resolveFrugalityCostPer1M(
    pinnedModel,
    breakevenContext.priceCatalog ?? null,
  );
  const candidateCostPer1M = resolveFrugalityCostPer1M(
    candidateModel,
    breakevenContext.priceCatalog ?? null,
  );

  const pinnedV2 = computeVirtualCostV2({
    base_cost_per_1m: pinnedCostPer1M,
    est_tokens: estimatedInputTokens,
    pin_active: warmPrefixTokens > 0,
    warm_prefix_tokens: warmPrefixTokens,
    ...(breakevenContext.quotaWindowPosition !== undefined
      ? { window_position: breakevenContext.quotaWindowPosition }
      : {}),
    ...(breakevenContext.virtualCostV2Config !== undefined
      ? { config: breakevenContext.virtualCostV2Config }
      : {}),
  });

  const quota_premium_usd =
    pinnedV2.quota_arbitrage_premium + pinnedV2.exhaustion_risk_premium;
  const kv_cache_credit_usd =
    warmPrefixTokens > 0
      ? breakevenContext.virtualCostV2Config !== undefined
        ? -computeKvCacheSavings(
            warmPrefixTokens,
            pinnedCostPer1M,
            true,
            breakevenContext.virtualCostV2Config,
          )
        : -computeKvCacheSavings(warmPrefixTokens, pinnedCostPer1M, true)
      : 0;

  const prefixResult = evaluateCacheBreakevenForPrefix(
    marginal_savings,
    warmPrefixTokens,
    pinnedCostPer1M,
    candidateCostPer1M,
    saarConfig
      ? { prefix_cache_weight: saarConfig.prefix_cache_weight }
      : undefined,
  );

  return {
    ...prefixResult,
    quota_premium_usd,
    kv_cache_credit_usd,
  };
}

// ─── SessionPinner ────────────────────────────────────────────────────────────

export class SessionPinner {
  private readonly pins = new Map<string, SessionPin>();
  private readonly saarTrackers = new Map<string, SaarSessionStateTracker>();
  private readonly flipFlopGuard: FlipFlopGuard;
  private readonly toolResultSizeThreshold: number;
  private readonly store: StorePort | undefined;
  private readonly cacheEconomicsConfig: CacheEconomicsConfig | undefined;
  private readonly saarConfig: SaarConfig | undefined;
  private readonly saarClock: (() => number) | undefined;
  private readonly pinOnlyFallback: boolean;
  private readonly contextOverflowSafetyMargin: number;
  private lastFleet: readonly ModelProfile[] | undefined;
  private lastFlipFlopObservation: FlipFlopObservation | null = null;

  constructor(config?: SessionPinnerConfig) {
    this.toolResultSizeThreshold =
      config?.toolResultSizeThreshold ?? DEFAULT_TOOL_RESULT_SIZE_THRESHOLD;
    this.store = config?.store;
    this.cacheEconomicsConfig = config?.cacheEconomicsConfig;
    this.saarConfig = config?.saarConfig;
    this.saarClock = config?.saarClock;
    this.pinOnlyFallback = config?.pinOnlyFallback ?? false;
    this.contextOverflowSafetyMargin =
      config?.contextOverflowSafetyMargin ?? DEFAULT_CONTEXT_OVERFLOW_SAFETY_MARGIN;
    this.flipFlopGuard = config?.flipFlopGuard ?? new FlipFlopGuard();
  }

  /**
   * Hydrate in-memory pin state for a session from persistent storage.
   * Call on session start after a pi restart so lookupPin stays synchronous.
   */
  async restoreSessionPin(sessionId: string): Promise<void> {
    if (!this.store) {
      return;
    }

    const pin = await this.store.getSessionPin(sessionId);
    if (pin) {
      this.pins.set(sessionId, pin);
    }
  }

  /**
   * Synchronous pin lookup — must complete in <1ms.
   * All data is in-memory (Map); no I/O.
   */
  lookupPin(
    request: RoutingRequest,
    fleet: readonly ModelProfile[],
  ): PinLookupResult {
    this.lastFleet = fleet;
    this.observeShadowTier(request, fleet);

    const flipFlopPinned = this.flipFlopGuard.isTierPinned(request.session_id);
    if (flipFlopPinned) {
      const flipFlopResult = this.resolveFlipFlopPin(
        request.session_id,
        flipFlopPinned,
        fleet,
      );
      if (flipFlopResult) {
        return flipFlopResult;
      }
    }

    const pin = this.pins.get(request.session_id);

    if (!pin) {
      return { action: 'no_pin' };
    }

    // ── Break rule evaluation (FR-008) ──────────────────────────────────────

    const breakResult = this.evaluateBreakRules(request, pin, fleet);
    if (breakResult) {
      return breakResult;
    }

    // ── Pin-only emergency fallback (#83, SP-161) ───────────────────────────

    if (this.pinOnlyFallback) {
      const pinnedModel = fleet.find(
        (m) => m.id === pin.pinned_model_id && m.healthy !== false,
      );
      if (!pinnedModel) {
        this.breakPin(request.session_id);
        return { action: 'no_pin' };
      }
      return { action: 'use_pin', pinnedModel };
    }

    // ── SAAR policy (SP-122) ────────────────────────────────────────────────

    const saarResult = this.evaluateSaarPolicy(request, pin, fleet);
    if (saarResult) {
      return saarResult;
    }

    // ── Sub-routing (FR-024) ────────────────────────────────────────────────

    const subRouteResult = this.evaluateSubRouting(request, pin, fleet);
    if (subRouteResult) {
      return subRouteResult;
    }

    // ── Default: use pinned model (FR-006, FR-007) ──────────────────────────

    const pinnedModel = fleet.find(
      (m) => m.id === pin.pinned_model_id && m.healthy !== false,
    );

    if (!pinnedModel) {
      this.breakPin(request.session_id);
      return { action: 'no_pin' };
    }

    return { action: 'use_pin', pinnedModel };
  }

  /**
   * Create or update a session pin after a routing decision.
   */
  recordPin(
    sessionId: string,
    modelId: string,
    reason: PinReason,
  ): SessionPin {
    const now = new Date().toISOString();
    const existing = this.pins.get(sessionId);

    const pin: SessionPin = {
      session_id: sessionId,
      pinned_model_id: modelId,
      pin_reason: reason,
      has_ever_switched: existing
        ? existing.pinned_model_id !== modelId || existing.has_ever_switched
        : false,
      consecutive_upstream_errors: 0,
      consecutive_tool_failures: existing?.consecutive_tool_failures ?? 0,
      last_tool_failure_signature: existing?.last_tool_failure_signature ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    this.pins.set(sessionId, pin);
    this.persistPin(pin);
    return pin;
  }

  /**
   * Delete a session pin — used by loop escalation or external callers.
   */
  breakPin(sessionId: string): void {
    this.pins.delete(sessionId);
    this.saarTrackers.delete(sessionId);
    this.flipFlopGuard.clearSession(sessionId);
    this.deletePersistedPin(sessionId);
  }

  /**
   * Record a completed turn for SAAR turn-index and hard-lock tracking.
   * Pipeline callers invoke after routing (SP-123).
   */
  recordSaarTurn(sessionId: string): SaarSessionState | null {
    if (!this.saarConfig) {
      return null;
    }

    const tracker = this.getOrCreateSaarTracker(sessionId);
    return tracker.recordTurn();
  }

  /** Read-only SAAR runtime state for telemetry (SP-126). */
  getSaarState(sessionId: string): SaarSessionState | null {
    return this.saarTrackers.get(sessionId)?.getState() ?? null;
  }

  /**
   * Hydrate a pin from persistent storage (e.g. SQLite restore).
   */
  loadPin(pin: SessionPin): void {
    this.pins.set(pin.session_id, pin);
    this.persistPin(pin);
  }

  /**
   * Read-only access to the current pin (telemetry, inspection).
   */
  getPin(sessionId: string): SessionPin | null {
    return this.pins.get(sessionId) ?? null;
  }

  /** Read-only flip-flop guard state for telemetry (SP-155). */
  getFlipFlopState(sessionId: string): FlipFlopSessionState | null {
    return this.flipFlopGuard.getState(sessionId);
  }

  /** Last shadow observation from the most recent lookupPin call (SP-155). */
  getLastFlipFlopObservation(): FlipFlopObservation | null {
    return this.lastFlipFlopObservation;
  }

  // ─── Flip-flop guard (SP-155) ─────────────────────────────────────────────

  private observeShadowTier(
    request: RoutingRequest,
    fleet: readonly ModelProfile[],
  ): void {
    const shadowTier = this.resolveShadowTier(request, fleet);
    if (!shadowTier) {
      return;
    }

    this.lastFlipFlopObservation = this.flipFlopGuard.observeTier(
      request.session_id,
      shadowTier,
    );
  }

  private resolveShadowTier(
    request: RoutingRequest,
    fleet: readonly ModelProfile[],
  ): Tier | null {
    if (!request.candidate_model_id) {
      return null;
    }

    const candidate = fleet.find(
      (model) =>
        model.id === request.candidate_model_id && model.healthy !== false,
    );
    return candidate?.tier ?? null;
  }

  private resolveFlipFlopPin(
    sessionId: string,
    pinnedTier: Tier,
    fleet: readonly ModelProfile[],
  ): PinLookupResult | null {
    const pin = this.pins.get(sessionId);
    const pinnedModel = pin
      ? fleet.find(
          (model) => model.id === pin.pinned_model_id && model.healthy !== false,
        )
      : undefined;

    if (pinnedModel?.tier === pinnedTier) {
      return {
        action: 'use_pin',
        pinnedModel,
        flipFlopReason: 'flip_flop_tier_pinned',
      };
    }

    const tierModel = fleet.find(
      (model) => model.tier === pinnedTier && model.healthy !== false,
    );
    if (!tierModel) {
      return null;
    }

    if (pin) {
      this.recordPin(sessionId, tierModel.id, pin.pin_reason);
    } else {
      this.recordPin(sessionId, tierModel.id, 'initial');
    }

    return {
      action: 'use_pin',
      pinnedModel: tierModel,
      flipFlopReason: 'flip_flop_tier_pinned',
    };
  }

  private isFlipFlopTierChangeBlocked(
    sessionId: string,
    targetTier: Tier,
  ): boolean {
    const pinnedTier = this.flipFlopGuard.isTierPinned(sessionId);
    return pinnedTier !== null && pinnedTier !== targetTier;
  }

  // ─── SAAR policy (SP-122) ─────────────────────────────────────────────────

  private getOrCreateSaarTracker(sessionId: string): SaarSessionStateTracker {
    let tracker = this.saarTrackers.get(sessionId);
    if (!tracker) {
      const options: { config: SaarConfig; now?: () => number } = {
        config: this.saarConfig ?? DEFAULT_SAAR_CONFIG,
      };
      if (this.saarClock) {
        options.now = this.saarClock;
      }
      tracker = new SaarSessionStateTracker(options);
      this.saarTrackers.set(sessionId, tracker);
    }
    return tracker;
  }

  private evaluateSaarPolicy(
    request: RoutingRequest,
    pin: SessionPin,
    fleet: readonly ModelProfile[],
  ): PinLookupResult | null {
    if (!this.saarConfig) {
      return null;
    }

    const tracker = this.getOrCreateSaarTracker(request.session_id);

    if (tracker.isIdleExpired()) {
      tracker.resetForIdleReopen();
      this.breakPin(request.session_id);
      return { action: 'no_pin', saarReason: 'saar_idle_reopen' };
    }

    tracker.touchActivity();

    const pinnedModel = fleet.find(
      (m) => m.id === pin.pinned_model_id && m.healthy !== false,
    );
    if (!pinnedModel) {
      return null;
    }

    const candidate = request.candidate_model_id
      ? fleet.find(
          (m) => m.id === request.candidate_model_id && m.healthy !== false,
        )
      : undefined;

    if (tracker.isInBufferWindow() && candidate) {
      if (
        isTierUpgrade(pinnedModel.tier, candidate.tier) &&
        !this.isFlipFlopTierChangeBlocked(request.session_id, candidate.tier)
      ) {
        return {
          action: 'saar_route',
          pinnedModel,
          saarRouteModel: candidate,
          saarReason: 'saar_buffer_active',
        };
      }
    }

    if (tracker.shouldHardLock()) {
      if (
        isToolLoopTurn(request.turn_type) &&
        candidate &&
        isTierUpgrade(pinnedModel.tier, candidate.tier) &&
        !this.isFlipFlopTierChangeBlocked(request.session_id, candidate.tier)
      ) {
        this.recordPin(request.session_id, candidate.id, pin.pin_reason);
        const upgraded = fleet.find((m) => m.id === candidate.id)!;
        return {
          action: 'use_pin',
          pinnedModel: upgraded,
          saarReason: 'saar_tier_upgrade',
        };
      }

      if (candidate && candidate.id !== pin.pinned_model_id) {
        return {
          action: 'use_pin',
          pinnedModel,
          saarReason: 'saar_hard_lock',
        };
      }
    }

    return null;
  }

  // ─── Break rules (FR-008) ───────────────────────────────────────────────────

  private evaluateBreakRules(
    request: RoutingRequest,
    pin: SessionPin,
    fleet: readonly ModelProfile[],
  ): PinLookupResult | null {
    // 1. History compaction → break pin, allow full re-route
    if (request.compaction_flag) {
      this.breakPin(request.session_id);
      return { action: 'break', breakReason: 'compaction' };
    }

    // 2. Context overflow → break pin when input exceeds pinned model window
    const overflowResult = this.evaluateContextOverflowBreak(
      request,
      pin,
      fleet,
    );
    if (overflowResult) {
      return overflowResult;
    }

    // 3. Explicit operator / user override → pin to forced model
    if (request.force_model_id) {
      return this.handleForceOverride(request, pin, fleet);
    }

    // 4. Loop escalation — threshold tracking is on the pin record;
    //    the loop_escalation pipeline stage calls breakPin() externally
    //    when the threshold fires. No evaluation here beyond what the
    //    pin record already reflects (consecutive_tool_failures).

    // 5. Cache-warmup economics (FR-008 rule #4)
    const cacheEconomicsResult = this.evaluateCacheEconomicsBreak(
      request,
      pin,
      fleet,
    );
    if (cacheEconomicsResult) {
      return cacheEconomicsResult;
    }

    return null;
  }

  private evaluateContextOverflowBreak(
    request: RoutingRequest,
    pin: SessionPin,
    fleet: readonly ModelProfile[],
  ): PinLookupResult | null {
    const pinnedModel = fleet.find(
      (m) => m.id === pin.pinned_model_id && m.healthy !== false,
    );
    const maxInputTokens = pinnedModel?.limits?.max_input_tokens;
    if (!maxInputTokens) {
      return null;
    }

    const tokenEstimate =
      request.estimated_input_tokens ?? request.prompt_text.length;
    const effectiveLimit = maxInputTokens * this.contextOverflowSafetyMargin;

    if (tokenEstimate > effectiveLimit) {
      this.breakPin(request.session_id);
      return { action: 'break', breakReason: 'context_overflow' };
    }

    return null;
  }

  private evaluateCacheEconomicsBreak(
    request: RoutingRequest,
    pin: SessionPin,
    fleet: readonly ModelProfile[],
  ): PinLookupResult | null {
    if (!request.candidate_model_id) {
      return null;
    }

    if (request.candidate_model_id === pin.pinned_model_id) {
      return null;
    }

    const pinnedModel = fleet.find(
      (m) => m.id === pin.pinned_model_id && m.healthy !== false,
    );
    const candidate = fleet.find(
      (m) => m.id === request.candidate_model_id && m.healthy !== false,
    );

    if (!pinnedModel || !candidate) {
      return null;
    }

    if (pinnedModel.provider === candidate.provider) {
      return null;
    }

    if (this.isFlipFlopTierChangeBlocked(request.session_id, candidate.tier)) {
      return null;
    }

    const tokenEstimate =
      request.estimated_input_tokens ?? request.prompt_text.length;

    const econ = evaluateCacheEconomics(
      pin,
      pinnedModel,
      candidate,
      tokenEstimate,
      this.cacheEconomicsConfig,
    );

    if (econ.shouldSwitch) {
      const breakeven = evaluateModelSwitchBreakeven(
        pinnedModel,
        candidate,
        tokenEstimate,
        tokenEstimate,
        this.saarConfig,
      );
      if (!breakeven.shouldSwitch) {
        return null;
      }

      this.breakPin(request.session_id);
      return { action: 'break', breakReason: 'cache_economics' };
    }

    return null;
  }

  private handleForceOverride(
    request: RoutingRequest,
    _pin: SessionPin,
    fleet: readonly ModelProfile[],
  ): PinLookupResult {
    const forced = fleet.find(
      (m) => m.id === request.force_model_id && m.healthy !== false,
    );

    if (forced) {
      this.recordPin(request.session_id, forced.id, 'user_forced');
      return { action: 'use_pin', pinnedModel: forced };
    }

    // Forced model unavailable — break pin, allow re-route
    this.breakPin(request.session_id);
    return { action: 'break', breakReason: 'user_forced' };
  }

  // ─── Persistence (StorePort) ────────────────────────────────────────────────

  private persistPin(pin: SessionPin): void {
    if (!this.store) {
      return;
    }

    void this.store.putSessionPin(pin).catch((error: unknown) => {
      console.warn('Failed to persist session pin', { sessionId: pin.session_id, error });
    });
  }

  private deletePersistedPin(sessionId: string): void {
    if (!this.store) {
      return;
    }

    void this.store.deleteSessionPin(sessionId).catch((error: unknown) => {
      console.warn('Failed to delete persisted session pin', { sessionId, error });
    });
  }

  // ─── Sub-routing (FR-024) ───────────────────────────────────────────────────

  private evaluateSubRouting(
    request: RoutingRequest,
    pin: SessionPin,
    fleet: readonly ModelProfile[],
  ): PinLookupResult | null {
    if (request.turn_type !== 'tool_result') {
      return null;
    }

    const payloadSize =
      request.estimated_input_tokens ?? request.prompt_text.length;

    if (payloadSize > this.toolResultSizeThreshold) {
      return null;
    }

    const pinnedModel = fleet.find((m) => m.id === pin.pinned_model_id);
    if (!pinnedModel) {
      return null;
    }

    const econModel = fleet.find(
      (m) =>
        m.tier === 'economical-cloud' &&
        m.provider === pinnedModel.provider &&
        m.id !== pin.pinned_model_id &&
        m.healthy !== false,
    );

    if (!econModel) {
      return null;
    }

    if (this.isFlipFlopTierChangeBlocked(request.session_id, econModel.tier)) {
      return null;
    }

    const tokenEstimate =
      request.estimated_input_tokens ?? request.prompt_text.length;
    const breakeven = evaluateModelSwitchBreakeven(
      pinnedModel,
      econModel,
      tokenEstimate,
      tokenEstimate,
      this.saarConfig,
    );
    if (!breakeven.shouldSwitch) {
      return null;
    }

    return {
      action: 'sub_route',
      subRouteModel: econModel,
      pinnedModel,
    };
  }
}
