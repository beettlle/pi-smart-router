// @ts-nocheck
import assert from 'node:assert/strict';
import * as nodeTest from 'node:test';

const vitest = process.env.VITEST ? await import('vitest') : null;
const describe = vitest?.describe ?? nodeTest.describe;
const it = vitest?.it ?? nodeTest.it;
const afterEach = vitest?.afterEach ?? nodeTest.afterEach;

const {
  DEFAULT_SAAR_CONFIG,
  resolveSaarConfigFromEnv,
} = await import('../../src/domain/types/schemas.ts');

const ENV_KEYS = [
  'SMART_ROUTER_PLANNING_TURN_BUFFER',
  'SMART_ROUTER_PREFIX_CACHE_WEIGHT',
  'SMART_ROUTER_IDLE_TIMEOUT_SECONDS',
  'SMART_ROUTER_SWITCH_THRESHOLD',
];

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

function expectEqual(actual, expected) {
  if (vitest) {
    vitest.expect(actual).toBe(expected);
  } else {
    assert.equal(actual, expected);
  }
}

function expectDeepEqual(actual, expected) {
  if (vitest) {
    vitest.expect(actual).toEqual(expected);
  } else {
    assert.deepEqual(actual, expected);
  }
}

describe('DEFAULT_SAAR_CONFIG', () => {
  it('matches roadmap SAAR recommendations', () => {
    expectEqual(DEFAULT_SAAR_CONFIG.planning_turn_buffer, 2);
    expectEqual(DEFAULT_SAAR_CONFIG.prefix_cache_weight, 0.20);
    expectEqual(DEFAULT_SAAR_CONFIG.idle_timeout_seconds, 300);
    expectEqual(DEFAULT_SAAR_CONFIG.switch_threshold, 0.5);
  });
});

describe('resolveSaarConfigFromEnv', () => {
  it('returns defaults when env is unset', () => {
    expectDeepEqual(resolveSaarConfigFromEnv(), DEFAULT_SAAR_CONFIG);
  });

  it('overrides SAAR fields from env', () => {
    process.env.SMART_ROUTER_PLANNING_TURN_BUFFER = '4';
    process.env.SMART_ROUTER_PREFIX_CACHE_WEIGHT = '0.35';
    process.env.SMART_ROUTER_IDLE_TIMEOUT_SECONDS = '600';
    process.env.SMART_ROUTER_SWITCH_THRESHOLD = '0.75';

    expectDeepEqual(resolveSaarConfigFromEnv(), {
      planning_turn_buffer: 4,
      prefix_cache_weight: 0.35,
      idle_timeout_seconds: 600,
      switch_threshold: 0.75,
    });
  });

  it('ignores invalid env values', () => {
    process.env.SMART_ROUTER_PLANNING_TURN_BUFFER = '0';
    process.env.SMART_ROUTER_PREFIX_CACHE_WEIGHT = '2';
    process.env.SMART_ROUTER_IDLE_TIMEOUT_SECONDS = 'not-a-number';
    process.env.SMART_ROUTER_SWITCH_THRESHOLD = '-1';

    expectDeepEqual(resolveSaarConfigFromEnv(), DEFAULT_SAAR_CONFIG);
  });
});
