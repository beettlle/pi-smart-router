import { describe, expect, it } from 'vitest';

import {
  computeCacheReprimeCost,
  computeFutureCacheValue,
  evaluateCacheBreakeven,
  evaluateCacheBreakevenForPrefix,
} from '../../src/domain/pinning/cache-breakeven.js';

const WARM_100K_PREFIX = 100_000;

describe('evaluateCacheBreakeven', () => {
  it('allows switch when marginal savings plus cache value exceed reprime cost', () => {
    const result = evaluateCacheBreakeven(1.0, 0.5, 0.8);

    expect(result.shouldSwitch).toBe(true);
    expect(result.total_benefit).toBe(1.5);
    expect(result.reason).toBe('breakeven_pass');
  });

  it('blocks switch when total benefit does not exceed reprime cost', () => {
    const result = evaluateCacheBreakeven(0.3, 0.2, 0.8);

    expect(result.shouldSwitch).toBe(false);
    expect(result.total_benefit).toBe(0.5);
    expect(result.reason).toBe('breakeven_not_met');
  });

  it('blocks switch when total benefit equals reprime cost', () => {
    const result = evaluateCacheBreakeven(0.5, 0.5, 1.0);

    expect(result.shouldSwitch).toBe(false);
    expect(result.reason).toBe('breakeven_not_met');
  });

  it('denies switch on negative or non-finite inputs', () => {
    expect(evaluateCacheBreakeven(-0.1, 0.5, 0.2).shouldSwitch).toBe(false);
    expect(evaluateCacheBreakeven(0.5, -0.1, 0.2).shouldSwitch).toBe(false);
    expect(evaluateCacheBreakeven(0.5, 0.2, -0.1).shouldSwitch).toBe(false);
    expect(evaluateCacheBreakeven(Number.NaN, 0.5, 0.2).shouldSwitch).toBe(false);
    expect(evaluateCacheBreakeven(0.5, Number.POSITIVE_INFINITY, 0.2).shouldSwitch).toBe(false);

    for (const result of [
      evaluateCacheBreakeven(-0.1, 0.5, 0.2),
      evaluateCacheBreakeven(Number.NaN, 0.5, 0.2),
    ]) {
      expect(result.reason).toBe('invalid_input');
    }
  });
});

describe('computeFutureCacheValue', () => {
  it('returns zero for a cold session with no warm prefix', () => {
    expect(computeFutureCacheValue(0, 30)).toBe(0);
  });

  it('applies prefix_cache_weight from SAAR config on warm prefix', () => {
    const value = computeFutureCacheValue(WARM_100K_PREFIX, 30, {
      prefix_cache_weight: 0.2,
      prefix_cache_discount: 0.9,
    });

    // 100k @ $30/1M = $3 prefix; 90% discount × 0.20 weight = $0.54 retained value
    expect(value).toBeCloseTo(0.54, 6);
  });
});

describe('computeCacheReprimeCost', () => {
  it('returns zero when there is no warm prefix to reprime', () => {
    expect(computeCacheReprimeCost(0, 30)).toBe(0);
  });

  it('charges full candidate input rate for the warm prefix token count', () => {
    expect(computeCacheReprimeCost(WARM_100K_PREFIX, 30)).toBeCloseTo(3.0, 6);
  });
});

describe('evaluateCacheBreakevenForPrefix', () => {
  it('allows switch on cold session when there is no cache penalty to repay', () => {
    const result = evaluateCacheBreakevenForPrefix(0.2, 0, 15, 12);

    expect(result.shouldSwitch).toBe(true);
    expect(result.future_cache_value).toBe(0);
    expect(result.cache_reprime_cost).toBe(0);
    expect(result.reason).toBe('breakeven_pass');
  });

  it('blocks cold-session switch when explicit reprime cost exceeds savings', () => {
    const result = evaluateCacheBreakeven(0.3, 0, 0.5);

    expect(result.shouldSwitch).toBe(false);
    expect(result.future_cache_value).toBe(0);
    expect(result.cache_reprime_cost).toBe(0.5);
    expect(result.reason).toBe('breakeven_not_met');
  });

  it('blocks switch on warm 100k prefix when savings are smaller than reprime', () => {
    const result = evaluateCacheBreakevenForPrefix(
      0.3,
      WARM_100K_PREFIX,
      30,
      30,
      { prefix_cache_weight: 0.2, prefix_cache_discount: 0.9 },
    );

    expect(result.shouldSwitch).toBe(false);
    expect(result.future_cache_value).toBeCloseTo(0.54, 6);
    expect(result.cache_reprime_cost).toBeCloseTo(3.0, 6);
    expect(result.total_benefit).toBeCloseTo(0.84, 6);
    expect(result.reason).toBe('breakeven_not_met');
  });

  it('allows switch when marginal savings plus cache value exceed reprime', () => {
    const result = evaluateCacheBreakevenForPrefix(
      5.0,
      WARM_100K_PREFIX,
      30,
      30,
      { prefix_cache_weight: 0.2, prefix_cache_discount: 0.9 },
    );

    expect(result.shouldSwitch).toBe(true);
    expect(result.total_benefit).toBeCloseTo(5.54, 6);
    expect(result.reason).toBe('breakeven_pass');
  });

  it('denies switch when SAAR prefix_cache_weight is out of bounds', () => {
    const result = evaluateCacheBreakevenForPrefix(5.0, WARM_100K_PREFIX, 30, 30, {
      prefix_cache_weight: 1.5,
    });

    expect(result.shouldSwitch).toBe(false);
    expect(result.reason).toBe('invalid_input');
  });
});
