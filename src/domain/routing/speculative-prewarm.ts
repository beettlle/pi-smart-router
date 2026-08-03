/**
 * Speculative prewarm with acceptance guard — SP-217, #117.
 *
 * Colibri PILOT pattern (prefetch + adaptive acceptance guard), adapted to the
 * pre-generation routing domain: when early signals lean local / economical,
 * optionally prewarm the local runtime (or encoder) within a strict TTFT
 * deadline, and disable speculation for the session when the recent warm
 * acceptance rate falls below a guard band.
 *
 * Guarantees:
 * - Default OFF (operator opt-in via `speculative_prewarm` config).
 * - Hard deadline: a prewarm attempt never blocks routing longer than
 *   `deadline_ms`; on timeout the warm call is aborted and routing proceeds
 *   (fail open — no hang, no FrugalGPT cascade).
 * - Pre-generation only: the warm function is an I/O readiness/warmup probe;
 *   it never waits on generated tokens.
 * - Adaptive guard: after `min_attempts_before_guard` recorded attempts, an
 *   acceptance rate below `min_acceptance_rate` disables prewarm for the
 *   session with a telemetry-visible reason.
 */

import type { SpeculativePrewarmConfig } from '../types/schemas.js';
import { DEFAULT_SPECULATIVE_PREWARM_CONFIG } from '../types/schemas.js';

export type { SpeculativePrewarmConfig } from '../types/schemas.js';
export { DEFAULT_SPECULATIVE_PREWARM_CONFIG } from '../types/schemas.js';

/** What the prewarm is warming. Only `local_runtime` is wired in the pipeline. */
export type PrewarmTarget = 'local_runtime' | 'encoder';

// ─── Reason codes (telemetry-visible) ────────────────────────────────────────

/** Warm target confirmed ready within the deadline. */
export const PREWARM_WARM = 'prewarm_warm' as const;
/** Warm probe completed within the deadline but the target was not ready. */
export const PREWARM_NOT_WARM = 'prewarm_not_warm' as const;
/** Deadline exceeded; warm call aborted and routing proceeded (fail open). */
export const PREWARM_DEADLINE_EXCEEDED = 'prewarm_deadline_exceeded' as const;
/** Warm probe threw; treated as a miss and routing proceeded (fail open). */
export const PREWARM_ERROR = 'prewarm_error' as const;
/** Session disabled by the adaptive acceptance guard. */
export const PREWARM_DISABLED_LOW_ACCEPTANCE = 'prewarm_disabled_low_acceptance' as const;

/** Outcome of a single prewarm decision point. */
export interface PrewarmOutcome {
  /** True when a warm call was actually issued. */
  readonly attempted: boolean;
  /** True when the target was warm within the deadline; null when not attempted. */
  readonly accepted: boolean | null;
  readonly target: PrewarmTarget | null;
  /** Wall-clock ms for the attempt; null when not attempted. */
  readonly elapsed_ms: number | null;
  /** Reason code (`prewarm_*`); carries the disabled reason when gated off. */
  readonly reason: string | null;
}

/** Canonical outcome when prewarm never ran (config off / not applicable). */
export const PREWARM_NOT_ATTEMPTED: PrewarmOutcome = {
  attempted: false,
  accepted: null,
  target: null,
  elapsed_ms: null,
  reason: null,
} as const;

/** Injectable clock/timers so tests can control time without flakiness. */
export interface PrewarmDeps {
  readonly now?: () => number;
  readonly setTimeoutFn?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

/**
 * Warm function contract: probe/warm the target and resolve true when warm.
 * Receives an AbortSignal fired at the hard deadline — implementations should
 * stop work promptly when aborted. Must never wait on generated tokens.
 */
export type PrewarmWarmFn = (signal: AbortSignal) => Promise<boolean>;

/** Per-session guard snapshot for tests and telemetry. */
export interface PrewarmSessionStats {
  readonly attempts: number;
  readonly accepted: number;
  readonly acceptance_rate: number | null;
  readonly disabled_reason: string | null;
}

/** Rolling outcome window per session (bounds memory; large enough for the guard). */
const SESSION_WINDOW_SIZE = 16;

/**
 * Speculative prewarm orchestrator with per-session acceptance guard.
 * Holds session state across route() calls; inject one per pipeline.
 */
export class SpeculativePrewarmGuard {
  private readonly config: SpeculativePrewarmConfig;
  private readonly now: () => number;
  private readonly setTimeoutFn: PrewarmDeps['setTimeoutFn'];
  private readonly clearTimeoutFn: PrewarmDeps['clearTimeoutFn'];
  /** Per-session rolling window of attempt outcomes (true = accepted). */
  private readonly sessionOutcomes = new Map<string, boolean[]>();
  /** Per-session disabled reason once the adaptive guard trips. */
  private readonly sessionDisabled = new Map<string, string>();

  constructor(
    config?: SpeculativePrewarmConfig | null,
    deps?: PrewarmDeps,
  ) {
    this.config = config ?? DEFAULT_SPECULATIVE_PREWARM_CONFIG;
    this.now = deps?.now ?? (() => Date.now());
    this.setTimeoutFn = deps?.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimeoutFn = deps?.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** True when prewarm may run for this session (enabled and guard not tripped). */
  shouldAttempt(sessionId: string): boolean {
    return this.config.enabled && !this.sessionDisabled.has(sessionId);
  }

  /** Telemetry-visible reason the guard disabled prewarm for this session. */
  disabledReason(sessionId: string): string | null {
    return this.sessionDisabled.get(sessionId) ?? null;
  }

  sessionStats(sessionId: string): PrewarmSessionStats {
    const outcomes = this.sessionOutcomes.get(sessionId) ?? [];
    const accepted = outcomes.filter(Boolean).length;
    return {
      attempts: outcomes.length,
      accepted,
      acceptance_rate: outcomes.length > 0 ? accepted / outcomes.length : null,
      disabled_reason: this.disabledReason(sessionId),
    };
  }

  /**
   * Attempt a bounded prewarm. Never throws; never blocks longer than
   * `deadline_ms`. Records the outcome for the adaptive guard.
   */
  async attempt(
    sessionId: string,
    target: PrewarmTarget,
    warm: PrewarmWarmFn,
  ): Promise<PrewarmOutcome> {
    if (!this.config.enabled) {
      return PREWARM_NOT_ATTEMPTED;
    }

    const disabledReason = this.disabledReason(sessionId);
    if (disabledReason !== null) {
      return {
        attempted: false,
        accepted: null,
        target,
        elapsed_ms: null,
        reason: disabledReason,
      };
    }

    const start = this.now();
    const controller = new AbortController();
    let timerHandle: ReturnType<typeof setTimeout> | null = null;

    const timeoutRace = new Promise<'timeout'>((resolve) => {
      timerHandle = this.setTimeoutFn!(() => {
        controller.abort();
        resolve('timeout');
      }, this.config.deadline_ms);
    });

    // Errors are captured (never rethrown): fail open, recorded as a miss.
    const warmRace: Promise<{ kind: 'ok'; warm: boolean } | { kind: 'error' }> =
      Promise.resolve()
        .then(() => warm(controller.signal))
        .then((warmOk) => ({ kind: 'ok' as const, warm: warmOk }))
        .catch(() => ({ kind: 'error' as const }));

    const raced = await Promise.race([timeoutRace, warmRace]);
    if (timerHandle !== null) {
      this.clearTimeoutFn!(timerHandle);
    }
    const elapsed = Math.max(0, this.now() - start);

    const outcome = this.resolveOutcome(target, elapsed, raced);
    this.recordOutcome(sessionId, outcome.accepted === true);
    return outcome;
  }

  private resolveOutcome(
    target: PrewarmTarget,
    elapsed: number,
    raced: 'timeout' | { kind: 'ok'; warm: boolean } | { kind: 'error' },
  ): PrewarmOutcome {
    if (raced === 'timeout') {
      return {
        attempted: true,
        accepted: false,
        target,
        elapsed_ms: elapsed,
        reason: PREWARM_DEADLINE_EXCEEDED,
      };
    }
    if (raced.kind === 'error') {
      return {
        attempted: true,
        accepted: false,
        target,
        elapsed_ms: elapsed,
        reason: PREWARM_ERROR,
      };
    }
    return {
      attempted: true,
      accepted: raced.warm,
      target,
      elapsed_ms: elapsed,
      reason: raced.warm ? PREWARM_WARM : PREWARM_NOT_WARM,
    };
  }

  /**
   * Record an attempt outcome and trip the adaptive guard when the rolling
   * acceptance rate (over at least `min_attempts_before_guard` attempts) falls
   * below `min_acceptance_rate`. Deadline misses count as rejections.
   */
  private recordOutcome(sessionId: string, accepted: boolean): void {
    if (this.sessionDisabled.has(sessionId)) {
      return;
    }

    const outcomes = this.sessionOutcomes.get(sessionId) ?? [];
    outcomes.push(accepted);
    if (outcomes.length > SESSION_WINDOW_SIZE) {
      outcomes.shift();
    }
    this.sessionOutcomes.set(sessionId, outcomes);

    if (outcomes.length < this.config.min_attempts_before_guard) {
      return;
    }

    const acceptedCount = outcomes.filter(Boolean).length;
    const acceptanceRate = acceptedCount / outcomes.length;
    if (acceptanceRate < this.config.min_acceptance_rate) {
      this.sessionDisabled.set(sessionId, PREWARM_DISABLED_LOW_ACCEPTANCE);
    }
  }
}
