/**
 * Session pinner — FR-006, FR-007, FR-008, FR-024.
 *
 * Pins a session to one model after the initial routing decision.
 * Pin holds across subsequent turns until a qualified break event.
 *
 * Break rules (FR-008, exhaustive):
 *   1. History compaction
 *   2. Explicit operator/user override
 *   3. Qualified loop escalation (threshold managed externally)
 *   4. Cache-warmup economics when a cross-provider switch is proposed
 *
 * Sub-routing (FR-024): tool-result turns below the payload threshold
 * may use an economical model on the same provider without breaking the pin.
 */

import type {
  ModelProfile,
  PinReason,
  RoutingRequest,
  SessionPin,
} from '../types/index.js';
import type { StorePort } from '../types/store-port.js';
import {
  evaluateCacheEconomics,
  type CacheEconomicsConfig,
} from './cache-economics.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PinAction = 'use_pin' | 'sub_route' | 'break' | 'no_pin';

export interface PinLookupResult {
  readonly action: PinAction;
  readonly pinnedModel?: ModelProfile;
  readonly subRouteModel?: ModelProfile;
  readonly breakReason?: PinReason;
}

export interface SessionPinnerConfig {
  /** FR-024: max payload size (bytes or token estimate) for sub-routing. Default 2048. */
  readonly toolResultSizeThreshold?: number;
  /** Optional persistence — pins survive process restart when set. */
  readonly store?: StorePort;
  /** FR-008 rule #4: cache-warmup economics thresholds. */
  readonly cacheEconomicsConfig?: CacheEconomicsConfig;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_TOOL_RESULT_SIZE_THRESHOLD = 2048;

// ─── SessionPinner ────────────────────────────────────────────────────────────

export class SessionPinner {
  private readonly pins = new Map<string, SessionPin>();
  private readonly toolResultSizeThreshold: number;
  private readonly store: StorePort | undefined;
  private readonly cacheEconomicsConfig: CacheEconomicsConfig | undefined;

  constructor(config?: SessionPinnerConfig) {
    this.toolResultSizeThreshold =
      config?.toolResultSizeThreshold ?? DEFAULT_TOOL_RESULT_SIZE_THRESHOLD;
    this.store = config?.store;
    this.cacheEconomicsConfig = config?.cacheEconomicsConfig;
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
    const pin = this.pins.get(request.session_id);

    if (!pin) {
      return { action: 'no_pin' };
    }

    // ── Break rule evaluation (FR-008) ──────────────────────────────────────

    const breakResult = this.evaluateBreakRules(request, pin, fleet);
    if (breakResult) {
      return breakResult;
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
    this.deletePersistedPin(sessionId);
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

    // 2. Explicit operator / user override → pin to forced model
    if (request.force_model_id) {
      return this.handleForceOverride(request, pin, fleet);
    }

    // 3. Loop escalation — threshold tracking is on the pin record;
    //    the loop_escalation pipeline stage calls breakPin() externally
    //    when the threshold fires. No evaluation here beyond what the
    //    pin record already reflects (consecutive_tool_failures).

    // 4. Cache-warmup economics (FR-008 rule #4)
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
      this.breakPin(request.session_id);
      return { action: 'break', breakReason: 'cache_economics' };
    }

    return { action: 'use_pin', pinnedModel };
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

    return {
      action: 'sub_route',
      subRouteModel: econModel,
      pinnedModel,
    };
  }
}
