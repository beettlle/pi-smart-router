import { describe, expect, it } from 'vitest';

import { SaarSessionStateTracker } from '../../src/domain/pinning/saar-session-state.js';
import { DEFAULT_SAAR_CONFIG } from '../../src/domain/types/schemas.js';

const BASE_TIME = Date.parse('2026-07-08T12:00:00.000Z');

function makeTracker(
  overrides?: {
    config?: Partial<typeof DEFAULT_SAAR_CONFIG>;
    initial?: { turn_index?: number; hard_lock?: boolean; last_activity_at?: string };
    now?: () => number;
  },
): SaarSessionStateTracker {
  const options: {
    config: typeof DEFAULT_SAAR_CONFIG;
    initial?: { turn_index?: number; hard_lock?: boolean; last_activity_at?: string };
    now?: () => number;
  } = {
    config: { ...DEFAULT_SAAR_CONFIG, ...overrides?.config },
  };
  if (overrides?.initial) {
    options.initial = overrides.initial;
  }
  if (overrides?.now) {
    options.now = overrides.now;
  } else {
    options.now = () => BASE_TIME;
  }
  return new SaarSessionStateTracker(options);
}

describe('SaarSessionStateTracker', () => {
  describe('isInBufferWindow', () => {
    it('is true for turn indices 0 and 1 when buffer=2', () => {
      const turn0 = makeTracker({ initial: { turn_index: 0 } });
      expect(turn0.isInBufferWindow()).toBe(true);

      const turn1 = makeTracker({ initial: { turn_index: 1 } });
      expect(turn1.isInBufferWindow()).toBe(true);
    });

    it('is false once turn index reaches planning_turn_buffer', () => {
      const turn2 = makeTracker({ initial: { turn_index: 2 } });
      expect(turn2.isInBufferWindow()).toBe(false);
    });
  });

  describe('recordTurn', () => {
    it('advances turn index and engages hard-lock after buffer', () => {
      const tracker = makeTracker({ now: () => BASE_TIME });

      expect(tracker.recordTurn()).toEqual({
        turn_index: 1,
        hard_lock: false,
        last_activity_at: '2026-07-08T12:00:00.000Z',
      });

      expect(tracker.recordTurn()).toEqual({
        turn_index: 2,
        hard_lock: true,
        last_activity_at: '2026-07-08T12:00:00.000Z',
      });
    });
  });

  describe('shouldHardLock', () => {
    it('reflects hard_lock flag on state', () => {
      const unlocked = makeTracker({ initial: { turn_index: 1, hard_lock: false } });
      expect(unlocked.shouldHardLock()).toBe(false);

      const locked = makeTracker({ initial: { turn_index: 2, hard_lock: true } });
      expect(locked.shouldHardLock()).toBe(true);
    });
  });

  describe('isIdleExpired', () => {
    it('is false inside idle timeout window', () => {
      const tracker = makeTracker({
        config: { idle_timeout_seconds: 300 },
        initial: { last_activity_at: '2026-07-08T12:00:00.000Z' },
        now: () => BASE_TIME + 299_000,
      });

      expect(tracker.isIdleExpired()).toBe(false);
    });

    it('is true when idle timeout elapsed', () => {
      const tracker = makeTracker({
        config: { idle_timeout_seconds: 300 },
        initial: { last_activity_at: '2026-07-08T12:00:00.000Z' },
        now: () => BASE_TIME + 300_000,
      });

      expect(tracker.isIdleExpired()).toBe(true);
    });
  });

  describe('resetForIdleReopen', () => {
    it('resets turn index and hard-lock after idle', () => {
      const tracker = makeTracker({
        initial: { turn_index: 5, hard_lock: true },
      });

      expect(tracker.resetForIdleReopen()).toEqual({
        turn_index: 0,
        hard_lock: false,
        last_activity_at: '2026-07-08T12:00:00.000Z',
      });
      expect(tracker.isInBufferWindow()).toBe(true);
    });
  });

  describe('touchActivity', () => {
    it('updates last_activity_at without changing turn index', () => {
      let now = BASE_TIME;
      const tracker = makeTracker({
        initial: { turn_index: 1, hard_lock: false },
        now: () => now,
      });

      now += 60_000;
      tracker.touchActivity();

      expect(tracker.getState()).toEqual({
        turn_index: 1,
        hard_lock: false,
        last_activity_at: '2026-07-08T12:01:00.000Z',
      });
    });
  });
});
