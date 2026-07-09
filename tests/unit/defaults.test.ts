import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATOR_CONFIG,
  DEFAULT_SAAR_CONFIG,
  resolveOperatorConfigFromEnv,
  resolveSaarConfigFromEnv,
} from '../../src/config/defaults.js';

const ENV_KEYS = [
  'SMART_ROUTER_PLANNING_TURN_BUFFER',
  'SMART_ROUTER_PREFIX_CACHE_WEIGHT',
  'SMART_ROUTER_IDLE_TIMEOUT_SECONDS',
  'SMART_ROUTER_SWITCH_THRESHOLD',
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe('DEFAULT_SAAR_CONFIG', () => {
  it('matches roadmap SAAR recommendations', () => {
    expect(DEFAULT_SAAR_CONFIG.planning_turn_buffer).toBe(2);
    expect(DEFAULT_SAAR_CONFIG.prefix_cache_weight).toBe(0.20);
    expect(DEFAULT_SAAR_CONFIG.idle_timeout_seconds).toBe(300);
    expect(DEFAULT_SAAR_CONFIG.switch_threshold).toBe(0.5);
  });
});

describe('DEFAULT_OPERATOR_CONFIG', () => {
  it('includes SAAR defaults', () => {
    expect(DEFAULT_OPERATOR_CONFIG.saar).toEqual(DEFAULT_SAAR_CONFIG);
  });
});

describe('resolveSaarConfigFromEnv', () => {
  it('returns defaults when env is unset', () => {
    expect(resolveSaarConfigFromEnv()).toEqual(DEFAULT_SAAR_CONFIG);
  });

  it('overrides SAAR fields from env', () => {
    process.env.SMART_ROUTER_PLANNING_TURN_BUFFER = '4';
    process.env.SMART_ROUTER_PREFIX_CACHE_WEIGHT = '0.35';
    process.env.SMART_ROUTER_IDLE_TIMEOUT_SECONDS = '600';
    process.env.SMART_ROUTER_SWITCH_THRESHOLD = '0.75';

    expect(resolveSaarConfigFromEnv()).toEqual({
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

    expect(resolveSaarConfigFromEnv()).toEqual(DEFAULT_SAAR_CONFIG);
  });
});

describe('resolveOperatorConfigFromEnv', () => {
  it('merges SAAR env overrides into operator config', () => {
    process.env.SMART_ROUTER_PLANNING_TURN_BUFFER = '3';

    const resolved = resolveOperatorConfigFromEnv();
    expect(resolved.saar.planning_turn_buffer).toBe(3);
    expect(resolved.frugality).toEqual(DEFAULT_OPERATOR_CONFIG.frugality);
  });
});
