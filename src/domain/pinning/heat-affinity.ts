/**
 * Live heat affinity at pin-safe boundaries (SP-215, #115).
 *
 * Colibri REPIN analog: OPTIONAL live affinity updates that let the hot tier
 * track the live workload without thrashing. Updates are only evaluated at
 * pin-safe boundaries — moments where the session pin is already broken or
 * reopened, so affinity never smashes a warm pin:
 *
 *   - FR-008 pin breaks (compaction, context overflow, cache economics, ...)
 *   - SAAR idle reopen (`saar_idle_reopen`)
 *
 * Hysteresis (Colibri-style): a swap toward the heat-preferred tier requires
 * a success-rate advantage of at least `hysteresis_band` (~25%) over the
 * active tier, and at most `swap_cap` live swaps per session. Heat counts are
 * decayed at each swap so stale workload history cannot pin the affinity
 * forever.
 *
 * Default OFF (`live_update_enabled: false`) — the persisted histogram and
 * the first-turn soft bias (expected-cost.ts) work without live repinning.
 * This module never flips frugality defaults or absolute release gates.
 */

import type { Tier } from '../types/index.js';
import type { WorkloadHeatConfig } from '../types/schemas.js';
import type { WorkloadHeatKey, WorkloadHeatMap } from '../routing/workload-heat.js';
import type { PinLookupResult } from './session-pinner.js';

// ─── Pin-safe boundary detection ─────────────────────────────────────────────

/**
 * True when a pin lookup result represents a pin-safe boundary: the pin is
 * already broken or reopened, so a live affinity update cannot smash a warm
 * pin. Hard-locked / sub-routed / in-use pins are NOT safe boundaries.
 */
export function isPinSafeBoundary(result: PinLookupResult): boolean {
  if (result.action === 'break') {
    return true;
  }
  return result.action === 'no_pin' && result.saarReason === 'saar_idle_reopen';
}

// ─── Swap decisions ──────────────────────────────────────────────────────────

export type AffinitySwapReason =
  | 'live_update_disabled'
  | 'not_pin_safe_boundary'
  | 'no_heat_data'
  | 'affinity_already_active'
  | 'hysteresis_hold'
  | 'swap_cap_reached'
  | 'heat_affinity_swap';

export interface AffinitySwapDecision {
  readonly shouldSwap: boolean;
  readonly targetTier: Tier | null;
  readonly reasonCode: AffinitySwapReason;
  /** Success-rate advantage of the candidate over the active tier (0 when N/A). */
  readonly advantage: number;
}

export interface SessionAffinityState {
  readonly activeTier: Tier;
  readonly swapsThisSession: number;
}

interface MutableSessionAffinityState {
  activeTier: Tier;
  swapsThisSession: number;
}

/** Heat decay factor applied at each live swap (Colibri decaying heat). */
export const AFFINITY_SWAP_HEAT_DECAY = 0.5;

/**
 * Per-session live affinity controller. Evaluates heat-preferred tier swaps
 * at pin-safe boundaries with hysteresis + swap cap. Stateless callers may
 * construct one controller per process; sessions are bounded by pin lifecycle
 * (`clearSession` on pin break/end).
 */
export class HeatAffinityController {
  private readonly config: WorkloadHeatConfig;
  private readonly sessions = new Map<string, MutableSessionAffinityState>();

  constructor(config: WorkloadHeatConfig) {
    this.config = config;
  }

  /** Read-only per-session affinity state (telemetry/tests). */
  getState(sessionId: string): SessionAffinityState | null {
    const state = this.sessions.get(sessionId);
    return state ? { ...state } : null;
  }

  /** Drop session affinity state (pin break / session end). */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Evaluate a live affinity swap at a pin-safe boundary.
   *
   * Gates, in order: live updates enabled → pin-safe boundary → heat data →
   * not already active → hysteresis band → swap cap. On swap, the session's
   * active tier moves and heat counts decay so the hot set tracks the live
   * workload.
   */
  evaluateSwap(
    sessionId: string,
    boundary: PinLookupResult,
    key: WorkloadHeatKey,
    currentTier: Tier,
    heat: WorkloadHeatMap,
  ): AffinitySwapDecision {
    if (!this.config.live_update_enabled) {
      return {
        shouldSwap: false,
        targetTier: null,
        reasonCode: 'live_update_disabled',
        advantage: 0,
      };
    }

    if (!isPinSafeBoundary(boundary)) {
      return {
        shouldSwap: false,
        targetTier: null,
        reasonCode: 'not_pin_safe_boundary',
        advantage: 0,
      };
    }

    const summaries = heat.summarize(key);
    if (!summaries || summaries.length === 0) {
      return {
        shouldSwap: false,
        targetTier: null,
        reasonCode: 'no_heat_data',
        advantage: 0,
      };
    }

    const ranked = [...summaries].sort((a, b) => b.successRate - a.successRate);
    const candidate = ranked[0]!;
    if (candidate.attempts < this.config.min_samples) {
      return {
        shouldSwap: false,
        targetTier: null,
        reasonCode: 'no_heat_data',
        advantage: 0,
      };
    }

    const state = this.sessions.get(sessionId) ?? {
      activeTier: currentTier,
      swapsThisSession: 0,
    };

    if (candidate.tier === state.activeTier) {
      this.sessions.set(sessionId, state);
      return {
        shouldSwap: false,
        targetTier: null,
        reasonCode: 'affinity_already_active',
        advantage: 0,
      };
    }

    const activeSummary = summaries.find((s) => s.tier === state.activeTier);
    const activeRate = activeSummary?.successRate ?? 0;
    const advantage = candidate.successRate - activeRate;

    if (advantage < this.config.hysteresis_band) {
      this.sessions.set(sessionId, state);
      return {
        shouldSwap: false,
        targetTier: null,
        reasonCode: 'hysteresis_hold',
        advantage,
      };
    }

    if (state.swapsThisSession >= this.config.swap_cap) {
      return {
        shouldSwap: false,
        targetTier: null,
        reasonCode: 'swap_cap_reached',
        advantage,
      };
    }

    state.activeTier = candidate.tier;
    state.swapsThisSession += 1;
    this.sessions.set(sessionId, state);
    heat.decay(AFFINITY_SWAP_HEAT_DECAY);

    return {
      shouldSwap: true,
      targetTier: candidate.tier,
      reasonCode: 'heat_affinity_swap',
      advantage,
    };
  }
}
