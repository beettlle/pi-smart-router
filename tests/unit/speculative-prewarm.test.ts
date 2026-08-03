import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SPECULATIVE_PREWARM_CONFIG,
  PREWARM_DEADLINE_EXCEEDED,
  PREWARM_DISABLED_LOW_ACCEPTANCE,
  PREWARM_ERROR,
  PREWARM_NOT_ATTEMPTED,
  PREWARM_NOT_WARM,
  PREWARM_WARM,
  SpeculativePrewarmGuard,
  type PrewarmDeps,
} from '../../src/domain/routing/speculative-prewarm.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import type { SpeculativePrewarmConfig } from '../../src/domain/types/schemas.js';

/**
 * SP-217 / #117 — Speculative prewarm with acceptance guard (Colibri PILOT
 * pattern). Default off; hard deadline fail-open; adaptive session disable.
 * Pre-generation only: warm probes never wait on generated tokens.
 */

function makeConfig(overrides?: Partial<SpeculativePrewarmConfig>): SpeculativePrewarmConfig {
  return { ...DEFAULT_SPECULATIVE_PREWARM_CONFIG, ...overrides };
}

/** Controlled timer set: tests drive deadline firing manually or via real timers. */
function makeManualTimers(): {
  deps: PrewarmDeps;
  fireAll: () => void;
  pendingCount: () => number;
} {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  const deps: PrewarmDeps = {
    now: () => Date.now(),
    setTimeoutFn: (cb) => {
      const id = nextId++;
      pending.set(id, cb);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (handle) => {
      pending.delete(handle as unknown as number);
    },
  };
  return {
    deps,
    fireAll: () => {
      for (const cb of [...pending.values()]) cb();
      pending.clear();
    },
    pendingCount: () => pending.size,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('SP-217 / #117 — speculative prewarm guard', () => {
  describe('default-off behavior', () => {
    it('ships disabled by default in operator config', () => {
      expect(DEFAULT_OPERATOR_CONFIG.speculative_prewarm?.enabled).toBe(false);
      expect(DEFAULT_SPECULATIVE_PREWARM_CONFIG.enabled).toBe(false);
    });

    it('does not attempt when config is default (off)', async () => {
      const guard = new SpeculativePrewarmGuard();
      const warm = vi.fn(async () => true);

      expect(guard.isEnabled()).toBe(false);
      expect(guard.shouldAttempt('sess-1')).toBe(false);

      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);

      expect(outcome).toEqual(PREWARM_NOT_ATTEMPTED);
      expect(warm).not.toHaveBeenCalled();
    });

    it('does not attempt when explicitly disabled', async () => {
      const guard = new SpeculativePrewarmGuard(makeConfig({ enabled: false }));
      const warm = vi.fn(async () => true);

      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);

      expect(outcome.attempted).toBe(false);
      expect(outcome.accepted).toBeNull();
      expect(warm).not.toHaveBeenCalled();
    });
  });

  describe('hard deadline (fail open, no hang)', () => {
    it('cancels and resolves when the warm probe exceeds the deadline', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 20 }),
      );
      let observedAbort = false;
      const warm = vi.fn(
        (signal: AbortSignal) =>
          new Promise<boolean>((resolve) => {
            signal.addEventListener('abort', () => {
              observedAbort = true;
            });
            // Artificial delay far beyond the budget; resolves late.
            setTimeout(() => resolve(true), 500);
          }),
      );

      const start = Date.now();
      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);
      const elapsed = Date.now() - start;

      expect(outcome.attempted).toBe(true);
      expect(outcome.accepted).toBe(false);
      expect(outcome.reason).toBe(PREWARM_DEADLINE_EXCEEDED);
      expect(observedAbort).toBe(true);
      // No hang: resolves near the deadline, not the 500ms warm delay.
      expect(elapsed).toBeLessThan(200);
    });

    it('fires the injected timer on deadline (manual clock)', async () => {
      const timers = makeManualTimers();
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 50 }),
        timers.deps,
      );
      const warm = vi.fn(() => new Promise<boolean>(() => {})); // never resolves

      const attemptPromise = guard.attempt('sess-1', 'local_runtime', warm);
      // Let the warm promise start, then fire the deadline.
      await Promise.resolve();
      expect(timers.pendingCount()).toBe(1);
      timers.fireAll();

      const outcome = await attemptPromise;
      expect(outcome.accepted).toBe(false);
      expect(outcome.reason).toBe(PREWARM_DEADLINE_EXCEEDED);
    });

    it('accepts a warm probe that resolves within the deadline', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 100 }),
      );
      const warm = vi.fn(async () => {
        await delay(5);
        return true;
      });

      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);

      expect(outcome.attempted).toBe(true);
      expect(outcome.accepted).toBe(true);
      expect(outcome.reason).toBe(PREWARM_WARM);
      expect(outcome.elapsed_ms).not.toBeNull();
    });

    it('records a miss when the probe completes but the target is not warm', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 100 }),
      );

      const outcome = await guard.attempt('sess-1', 'local_runtime', async () => false);

      expect(outcome.attempted).toBe(true);
      expect(outcome.accepted).toBe(false);
      expect(outcome.reason).toBe(PREWARM_NOT_WARM);
    });

    it('fails open when the warm probe throws', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 100 }),
      );

      const outcome = await guard.attempt('sess-1', 'encoder', async () => {
        throw new Error('encoder load failed');
      });

      expect(outcome.attempted).toBe(true);
      expect(outcome.accepted).toBe(false);
      expect(outcome.target).toBe('encoder');
      expect(outcome.reason).toBe(PREWARM_ERROR);
    });
  });

  describe('adaptive acceptance guard', () => {
    it('disables prewarm for the session after sustained low acceptance', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({
          enabled: true,
          deadline_ms: 100,
          min_acceptance_rate: 0.5,
          min_attempts_before_guard: 4,
        }),
      );

      // 1 accepted, 3 rejected → 25% acceptance over 4 attempts (< 50%).
      await guard.attempt('sess-1', 'local_runtime', async () => true);
      await guard.attempt('sess-1', 'local_runtime', async () => false);
      await guard.attempt('sess-1', 'local_runtime', async () => false);
      expect(guard.shouldAttempt('sess-1')).toBe(true);
      await guard.attempt('sess-1', 'local_runtime', async () => false);

      expect(guard.shouldAttempt('sess-1')).toBe(false);
      expect(guard.disabledReason('sess-1')).toBe(PREWARM_DISABLED_LOW_ACCEPTANCE);

      // Subsequent attempts are gated off — warm is never called again.
      const warm = vi.fn(async () => true);
      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);
      expect(outcome.attempted).toBe(false);
      expect(outcome.accepted).toBeNull();
      expect(outcome.reason).toBe(PREWARM_DISABLED_LOW_ACCEPTANCE);
      expect(warm).not.toHaveBeenCalled();
    });

    it('counts deadline misses toward the acceptance guard', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({
          enabled: true,
          deadline_ms: 10,
          min_acceptance_rate: 0.5,
          min_attempts_before_guard: 3,
        }),
      );
      const slowWarm = () =>
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 300));

      await guard.attempt('sess-1', 'local_runtime', slowWarm);
      await guard.attempt('sess-1', 'local_runtime', slowWarm);
      await guard.attempt('sess-1', 'local_runtime', slowWarm);

      expect(guard.disabledReason('sess-1')).toBe(PREWARM_DISABLED_LOW_ACCEPTANCE);
    });

    it('keeps prewarm enabled while acceptance stays at or above the guard band', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({
          enabled: true,
          deadline_ms: 100,
          min_acceptance_rate: 0.5,
          min_attempts_before_guard: 4,
        }),
      );

      await guard.attempt('sess-1', 'local_runtime', async () => true);
      await guard.attempt('sess-1', 'local_runtime', async () => true);
      await guard.attempt('sess-1', 'local_runtime', async () => false);
      await guard.attempt('sess-1', 'local_runtime', async () => true);

      expect(guard.shouldAttempt('sess-1')).toBe(true);
      expect(guard.disabledReason('sess-1')).toBeNull();
      const stats = guard.sessionStats('sess-1');
      expect(stats.attempts).toBe(4);
      expect(stats.accepted).toBe(3);
      expect(stats.acceptance_rate).toBe(0.75);
    });

    it('tracks the guard per session, not globally', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({
          enabled: true,
          deadline_ms: 100,
          min_acceptance_rate: 0.5,
          min_attempts_before_guard: 2,
        }),
      );

      await guard.attempt('sess-bad', 'local_runtime', async () => false);
      await guard.attempt('sess-bad', 'local_runtime', async () => false);

      expect(guard.shouldAttempt('sess-bad')).toBe(false);
      expect(guard.shouldAttempt('sess-good')).toBe(true);

      const outcome = await guard.attempt('sess-good', 'local_runtime', async () => true);
      expect(outcome.accepted).toBe(true);
      expect(guard.shouldAttempt('sess-good')).toBe(true);
    });
  });
});
