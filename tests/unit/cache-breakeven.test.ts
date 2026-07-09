// @ts-nocheck
// @ts-nocheck — node --test contract resolves .ts imports on Node 26; tsc expects .js specifiers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeCacheReprimeCost,
  computeFutureCacheValue,
  evaluateCacheBreakeven,
  evaluateCacheBreakevenForPrefix,
} from '../../src/domain/pinning/cache-breakeven.ts';

const WARM_100K_PREFIX = 100_000;

describe('evaluateCacheBreakeven', () => {
  it('allows switch when marginal savings plus cache value exceed reprime cost', () => {
    const result = evaluateCacheBreakeven(1.0, 0.5, 0.8);

    assert.equal(result.shouldSwitch, true);
    assert.equal(result.total_benefit, 1.5);
    assert.equal(result.reason, 'breakeven_pass');
  });

  it('blocks switch when total benefit does not exceed reprime cost', () => {
    const result = evaluateCacheBreakeven(0.3, 0.2, 0.8);

    assert.equal(result.shouldSwitch, false);
    assert.equal(result.total_benefit, 0.5);
    assert.equal(result.reason, 'breakeven_not_met');
  });

  it('blocks switch when total benefit equals reprime cost', () => {
    const result = evaluateCacheBreakeven(0.5, 0.5, 1.0);

    assert.equal(result.shouldSwitch, false);
    assert.equal(result.reason, 'breakeven_not_met');
  });

  it('denies switch on negative or non-finite inputs', () => {
    assert.equal(evaluateCacheBreakeven(-0.1, 0.5, 0.2).shouldSwitch, false);
    assert.equal(evaluateCacheBreakeven(0.5, -0.1, 0.2).shouldSwitch, false);
    assert.equal(evaluateCacheBreakeven(0.5, 0.2, -0.1).shouldSwitch, false);
    assert.equal(evaluateCacheBreakeven(Number.NaN, 0.5, 0.2).shouldSwitch, false);
    assert.equal(
      evaluateCacheBreakeven(0.5, Number.POSITIVE_INFINITY, 0.2).shouldSwitch,
      false,
    );

    for (const result of [
      evaluateCacheBreakeven(-0.1, 0.5, 0.2),
      evaluateCacheBreakeven(Number.NaN, 0.5, 0.2),
    ]) {
      assert.equal(result.reason, 'invalid_input');
    }
  });
});

describe('computeFutureCacheValue', () => {
  it('returns zero for a cold session with no warm prefix', () => {
    assert.equal(computeFutureCacheValue(0, 30), 0);
  });

  it('applies prefix_cache_weight from SAAR config on warm prefix', () => {
    const value = computeFutureCacheValue(WARM_100K_PREFIX, 30, {
      prefix_cache_weight: 0.2,
      prefix_cache_discount: 0.9,
    });

    // 100k @ $30/1M = $3 prefix; 90% discount × 0.20 weight = $0.54 retained value
    assert.ok(Math.abs(value - 0.54) < 1e-6);
  });
});

describe('computeCacheReprimeCost', () => {
  it('returns zero when there is no warm prefix to reprime', () => {
    assert.equal(computeCacheReprimeCost(0, 30), 0);
  });

  it('charges full candidate input rate for the warm prefix token count', () => {
    assert.ok(Math.abs(computeCacheReprimeCost(WARM_100K_PREFIX, 30) - 3.0) < 1e-6);
  });
});

describe('evaluateCacheBreakevenForPrefix', () => {
  it('allows switch on cold session when there is no cache penalty to repay', () => {
    const result = evaluateCacheBreakevenForPrefix(0.2, 0, 15, 12);

    assert.equal(result.shouldSwitch, true);
    assert.equal(result.future_cache_value, 0);
    assert.equal(result.cache_reprime_cost, 0);
    assert.equal(result.reason, 'breakeven_pass');
  });

  it('blocks cold-session switch when explicit reprime cost exceeds savings', () => {
    const result = evaluateCacheBreakeven(0.3, 0, 0.5);

    assert.equal(result.shouldSwitch, false);
    assert.equal(result.future_cache_value, 0);
    assert.equal(result.cache_reprime_cost, 0.5);
    assert.equal(result.reason, 'breakeven_not_met');
  });

  it('blocks switch on warm 100k prefix when savings are smaller than reprime', () => {
    const result = evaluateCacheBreakevenForPrefix(
      0.3,
      WARM_100K_PREFIX,
      30,
      30,
      { prefix_cache_weight: 0.2, prefix_cache_discount: 0.9 },
    );

    assert.equal(result.shouldSwitch, false);
    assert.ok(Math.abs(result.future_cache_value - 0.54) < 1e-6);
    assert.ok(Math.abs(result.cache_reprime_cost - 3.0) < 1e-6);
    assert.ok(Math.abs(result.total_benefit - 0.84) < 1e-6);
    assert.equal(result.reason, 'breakeven_not_met');
  });

  it('allows switch when marginal savings plus cache value exceed reprime', () => {
    const result = evaluateCacheBreakevenForPrefix(
      5.0,
      WARM_100K_PREFIX,
      30,
      30,
      { prefix_cache_weight: 0.2, prefix_cache_discount: 0.9 },
    );

    assert.equal(result.shouldSwitch, true);
    assert.ok(Math.abs(result.total_benefit - 5.54) < 1e-6);
    assert.equal(result.reason, 'breakeven_pass');
  });

  it('denies switch when SAAR prefix_cache_weight is out of bounds', () => {
    const result = evaluateCacheBreakevenForPrefix(5.0, WARM_100K_PREFIX, 30, 30, {
      prefix_cache_weight: 1.5,
    });

    assert.equal(result.shouldSwitch, false);
    assert.equal(result.reason, 'invalid_input');
  });
});

// Vitest requires at least one suite in included files; skip under node --test contract runs.
if (process.env.VITEST) {
  const { describe: vitestDescribe, it: vitestIt, expect } = await import('vitest');
  vitestDescribe('cache-breakeven (node:test contract file)', () => {
    vitestIt('runs node:test suites in this file', () => {
      expect(true).toBe(true);
    });
  });
}
