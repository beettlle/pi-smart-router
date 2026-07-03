import { describe, expect, it } from 'vitest';

import {
  CircuitBreaker,
  isInfraError,
} from '../../src/infrastructure/gateway/circuit-breaker.js';

describe('CircuitBreaker', () => {
  const config = { failureThreshold: 3, resetTimeoutMs: 1000, halfOpenSuccesses: 2 };

  // ─── canDispatch ─────────────────────────────────────────────────────

  describe('canDispatch', () => {
    it('allows dispatch for unknown models (closed by default)', () => {
      const cb = new CircuitBreaker(config);
      expect(cb.canDispatch('model-1')).toBe(true);
    });

    it('allows dispatch while failures are below threshold', () => {
      const cb = new CircuitBreaker(config);
      cb.recordFailure('model-1');
      cb.recordFailure('model-1');
      expect(cb.canDispatch('model-1')).toBe(true);
    });

    it('blocks dispatch after threshold failures', () => {
      const cb = new CircuitBreaker(config);
      cb.recordFailure('model-1');
      cb.recordFailure('model-1');
      cb.recordFailure('model-1');
      expect(cb.canDispatch('model-1')).toBe(false);
    });

    it('does not block other models when one trips', () => {
      const cb = new CircuitBreaker(config);
      for (let i = 0; i < 3; i++) cb.recordFailure('model-1');
      expect(cb.canDispatch('model-2')).toBe(true);
    });
  });

  // ─── State transitions ──────────────────────────────────────────────

  describe('state transitions', () => {
    it('transitions CLOSED → OPEN on threshold failures', () => {
      const cb = new CircuitBreaker(config);
      for (let i = 0; i < 3; i++) cb.recordFailure('model-1');

      expect(cb.getSnapshot('model-1').state).toBe('open');
    });

    it('transitions OPEN → HALF_OPEN after reset timeout', async () => {
      const cb = new CircuitBreaker({ ...config, resetTimeoutMs: 10 });
      for (let i = 0; i < 3; i++) cb.recordFailure('model-1');
      expect(cb.getSnapshot('model-1').state).toBe('open');

      await new Promise((r) => setTimeout(r, 20));

      expect(cb.canDispatch('model-1')).toBe(true);
      expect(cb.getSnapshot('model-1').state).toBe('half_open');
    });

    it('transitions HALF_OPEN → CLOSED after consecutive successes', async () => {
      const cb = new CircuitBreaker({ ...config, resetTimeoutMs: 10 });
      for (let i = 0; i < 3; i++) cb.recordFailure('model-1');

      await new Promise((r) => setTimeout(r, 20));
      cb.canDispatch('model-1'); // triggers half_open

      cb.recordSuccess('model-1');
      expect(cb.getSnapshot('model-1').state).toBe('half_open');

      cb.recordSuccess('model-1');
      expect(cb.getSnapshot('model-1').state).toBe('closed');
    });

    it('transitions HALF_OPEN → OPEN on failure', async () => {
      const cb = new CircuitBreaker({ ...config, resetTimeoutMs: 10 });
      for (let i = 0; i < 3; i++) cb.recordFailure('model-1');

      await new Promise((r) => setTimeout(r, 20));
      cb.canDispatch('model-1'); // triggers half_open

      cb.recordFailure('model-1');
      expect(cb.getSnapshot('model-1').state).toBe('open');
    });
  });

  // ─── recordSuccess ──────────────────────────────────────────────────

  describe('recordSuccess', () => {
    it('resets consecutive failures in closed state', () => {
      const cb = new CircuitBreaker(config);
      cb.recordFailure('model-1');
      cb.recordFailure('model-1');
      cb.recordSuccess('model-1');

      expect(cb.getSnapshot('model-1').consecutiveFailures).toBe(0);
    });

    it('is a no-op for unknown models', () => {
      const cb = new CircuitBreaker(config);
      cb.recordSuccess('unknown');
      expect(cb.getSnapshot('unknown').state).toBe('closed');
    });
  });

  // ─── getSnapshot ────────────────────────────────────────────────────

  describe('getSnapshot', () => {
    it('returns default snapshot for unknown models', () => {
      const cb = new CircuitBreaker(config);
      const snap = cb.getSnapshot('unknown');

      expect(snap.modelId).toBe('unknown');
      expect(snap.state).toBe('closed');
      expect(snap.consecutiveFailures).toBe(0);
      expect(snap.lastFailureAt).toBeNull();
    });

    it('tracks failure count and timestamp', () => {
      const cb = new CircuitBreaker(config);
      cb.recordFailure('model-1');

      const snap = cb.getSnapshot('model-1');
      expect(snap.consecutiveFailures).toBe(1);
      expect(snap.lastFailureAt).not.toBeNull();
    });
  });

  // ─── reset ──────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears a tripped circuit back to default closed state', () => {
      const cb = new CircuitBreaker(config);
      for (let i = 0; i < 3; i++) cb.recordFailure('model-1');
      expect(cb.canDispatch('model-1')).toBe(false);

      cb.reset('model-1');
      expect(cb.canDispatch('model-1')).toBe(true);
      expect(cb.getSnapshot('model-1').state).toBe('closed');
    });
  });

  // ─── getOpenCircuits ────────────────────────────────────────────────

  describe('getOpenCircuits', () => {
    it('returns empty when no circuits are open', () => {
      const cb = new CircuitBreaker(config);
      expect(cb.getOpenCircuits()).toEqual([]);
    });

    it('lists only open circuits', () => {
      const cb = new CircuitBreaker(config);
      for (let i = 0; i < 3; i++) cb.recordFailure('model-1');
      cb.recordFailure('model-2');

      const open = cb.getOpenCircuits();
      expect(open).toContain('model-1');
      expect(open).not.toContain('model-2');
    });
  });
});

// ─── isInfraError ─────────────────────────────────────────────────────

describe('isInfraError', () => {
  it('returns true for 5xx status codes', () => {
    expect(isInfraError({ statusCode: 500 })).toBe(true);
    expect(isInfraError({ statusCode: 502 })).toBe(true);
    expect(isInfraError({ statusCode: 503 })).toBe(true);
  });

  it('returns true for 429 rate limit', () => {
    expect(isInfraError({ statusCode: 429 })).toBe(true);
  });

  it('returns false for policy/safety rejections (4xx)', () => {
    expect(isInfraError({ statusCode: 400 })).toBe(false);
    expect(isInfraError({ statusCode: 403 })).toBe(false);
    expect(isInfraError({ statusCode: 422 })).toBe(false);
    expect(isInfraError({ statusCode: 451 })).toBe(false);
  });

  it('returns true for network error codes', () => {
    expect(isInfraError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isInfraError({ code: 'ECONNRESET' })).toBe(true);
    expect(isInfraError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isInfraError({ code: 'ENOTFOUND' })).toBe(true);
  });

  it('returns false for non-infra error codes', () => {
    expect(isInfraError({ code: 'ERR_INVALID_ARG_TYPE' })).toBe(false);
    expect(isInfraError({})).toBe(false);
  });

  it('checks code before statusCode', () => {
    expect(isInfraError({ code: 'ECONNREFUSED', statusCode: 200 })).toBe(true);
  });
});
