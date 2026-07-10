/**
 * Flip-flop shadow guard (SP-155, #82 part 2).
 *
 * Tracks consecutive per-turn tier changes within a session. When the shadow
 * routing tier flips `FLIP_FLOP_PIN_THRESHOLD` times in a row (each turn differs
 * from the prior observed tier), the session tier is pinned for the remainder
 * of the session to stop adversarial paraphrase / suffix oscillation.
 *
 * False-positive rate monitoring (dogfood corpus):
 * - Shadow-log `flip_flop_tier_flip` events without blocking until threshold.
 * - Compare `flip_flop_tier_pinned` rate vs sessions with manual tier override
 *   or loop escalation on the operator dogfood corpus (`SMART_ROUTER_LOG_ROUTING=1`
 *   JSON `flip_flop_summary` lines).
 * - Treat >5% of non-adversarial sessions hitting tier pin within 10 turns as a
 *   calibration regression; raise threshold or require flip alternation only.
 * - Legitimate planning→execution tier changes should stay below threshold when
 *   SAAR `planning_turn_buffer` defers pin commit (observe shadow tier after buffer).
 */

import type { Tier } from '../types/index.js';

/** Consecutive tier flips required before session tier pin engages. */
export const FLIP_FLOP_PIN_THRESHOLD = 3;

/** Shadow log: tier changed from prior turn observation. */
export const FLIP_FLOP_SHADOW_TIER_FLIP = 'flip_flop_tier_flip' as const;

/** Shadow log: threshold reached; tier pinned for session. */
export const FLIP_FLOP_SHADOW_TIER_PINNED = 'flip_flop_tier_pinned' as const;

export type FlipFlopShadowEvent =
  | typeof FLIP_FLOP_SHADOW_TIER_FLIP
  | typeof FLIP_FLOP_SHADOW_TIER_PINNED;

export interface FlipFlopSessionState {
  readonly last_observed_tier: Tier | null;
  readonly consecutive_tier_flips: number;
  readonly tier_pinned: Tier | null;
}

export interface FlipFlopObservation {
  readonly tier_flip_detected: boolean;
  readonly consecutive_tier_flips: number;
  readonly tier_pinned: Tier | null;
  readonly shadow_event: FlipFlopShadowEvent | null;
}

export interface FlipFlopGuardConfig {
  readonly threshold?: number;
}

const EMPTY_STATE: FlipFlopSessionState = {
  last_observed_tier: null,
  consecutive_tier_flips: 0,
  tier_pinned: null,
};

export class FlipFlopGuard {
  private readonly sessions = new Map<string, FlipFlopSessionState>();
  private readonly threshold: number;

  constructor(config?: FlipFlopGuardConfig) {
    this.threshold = config?.threshold ?? FLIP_FLOP_PIN_THRESHOLD;
  }

  /** Read-only session state for telemetry and tests. */
  getState(sessionId: string): FlipFlopSessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /** Tier pinned by flip-flop guard, or null when not engaged. */
  isTierPinned(sessionId: string): Tier | null {
    return this.sessions.get(sessionId)?.tier_pinned ?? null;
  }

  /**
   * Record shadow routing tier for a turn and update flip counters.
   * Idempotent once tier pin is active for the session.
   */
  observeTier(sessionId: string, observedTier: Tier): FlipFlopObservation {
    const current = this.sessions.get(sessionId) ?? EMPTY_STATE;

    if (current.tier_pinned !== null) {
      return {
        tier_flip_detected: false,
        consecutive_tier_flips: current.consecutive_tier_flips,
        tier_pinned: current.tier_pinned,
        shadow_event: null,
      };
    }

    if (current.last_observed_tier === null) {
      const next: FlipFlopSessionState = {
        last_observed_tier: observedTier,
        consecutive_tier_flips: 0,
        tier_pinned: null,
      };
      this.sessions.set(sessionId, next);
      return {
        tier_flip_detected: false,
        consecutive_tier_flips: 0,
        tier_pinned: null,
        shadow_event: null,
      };
    }

    if (current.last_observed_tier === observedTier) {
      const next: FlipFlopSessionState = {
        last_observed_tier: observedTier,
        consecutive_tier_flips: 0,
        tier_pinned: null,
      };
      this.sessions.set(sessionId, next);
      return {
        tier_flip_detected: false,
        consecutive_tier_flips: 0,
        tier_pinned: null,
        shadow_event: null,
      };
    }

    const consecutive = current.consecutive_tier_flips + 1;
    if (consecutive >= this.threshold) {
      const next: FlipFlopSessionState = {
        last_observed_tier: observedTier,
        consecutive_tier_flips: consecutive,
        tier_pinned: observedTier,
      };
      this.sessions.set(sessionId, next);
      return {
        tier_flip_detected: true,
        consecutive_tier_flips: consecutive,
        tier_pinned: observedTier,
        shadow_event: FLIP_FLOP_SHADOW_TIER_PINNED,
      };
    }

    const next: FlipFlopSessionState = {
      last_observed_tier: observedTier,
      consecutive_tier_flips: consecutive,
      tier_pinned: null,
    };
    this.sessions.set(sessionId, next);
    return {
      tier_flip_detected: true,
      consecutive_tier_flips: consecutive,
      tier_pinned: null,
      shadow_event: FLIP_FLOP_SHADOW_TIER_FLIP,
    };
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
