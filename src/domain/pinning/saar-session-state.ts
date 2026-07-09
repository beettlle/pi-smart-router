/**
 * SAAR per-session state tracker (SP-122, #72).
 *
 * Tracks turn index, planning buffer window, hard-lock, and idle timeout
 * per Session-Aware Agentic Routing semantics.
 */

import type { SaarConfig, SaarSessionState } from '../types/index.js';

export interface SaarSessionStateTrackerOptions {
  readonly config: SaarConfig;
  readonly initial?: Partial<SaarSessionState>;
  /** Injectable clock for tests. */
  readonly now?: () => number;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export class SaarSessionStateTracker {
  private state: SaarSessionState;
  private readonly config: SaarConfig;
  private readonly now: () => number;

  constructor(options: SaarSessionStateTrackerOptions) {
    const clock = options.now ?? (() => Date.now());
    this.now = clock;
    this.config = options.config;
    this.state = {
      turn_index: options.initial?.turn_index ?? 0,
      hard_lock: options.initial?.hard_lock ?? false,
      last_activity_at:
        options.initial?.last_activity_at ?? toIso(clock()),
    };
  }

  getState(): Readonly<SaarSessionState> {
    return this.state;
  }

  /**
   * Advance turn index after a routed turn and refresh hard-lock.
   * Hard-lock engages once turn_index reaches planning_turn_buffer.
   */
  recordTurn(): SaarSessionState {
    const nextIndex = this.state.turn_index + 1;
    this.state = {
      turn_index: nextIndex,
      hard_lock: nextIndex >= this.config.planning_turn_buffer,
      last_activity_at: toIso(this.now()),
    };
    return this.state;
  }

  /** Turns 0..(planning_turn_buffer - 1) are inside the planning buffer. */
  isInBufferWindow(): boolean {
    return this.state.turn_index < this.config.planning_turn_buffer;
  }

  /** True after the planning buffer has been exhausted. */
  shouldHardLock(): boolean {
    return this.state.hard_lock;
  }

  /** True when idle time since last activity exceeds configured timeout. */
  isIdleExpired(): boolean {
    const lastMs = Date.parse(this.state.last_activity_at);
    if (Number.isNaN(lastMs)) {
      return false;
    }
    const idleMs = this.config.idle_timeout_seconds * 1000;
    return this.now() - lastMs >= idleMs;
  }

  /** Reset SAAR weight and reopen routing after idle timeout. */
  resetForIdleReopen(): SaarSessionState {
    this.state = {
      turn_index: 0,
      hard_lock: false,
      last_activity_at: toIso(this.now()),
    };
    return this.state;
  }

  /** Refresh last-activity without advancing turn index. */
  touchActivity(): void {
    this.state = {
      ...this.state,
      last_activity_at: toIso(this.now()),
    };
  }
}
