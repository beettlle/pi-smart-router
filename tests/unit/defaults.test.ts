import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PLANNING_DELEGATE_CONFIG,
  DEFAULT_SAAR_CONFIG,
  resolvePlanningDelegateConfigFromEnv,
  resolveSaarConfigFromEnv,
} from '../../src/domain/types/schemas.js';

const ENV_KEYS = [
  'SMART_ROUTER_PLANNING_TURN_BUFFER',
  'SMART_ROUTER_PREFIX_CACHE_WEIGHT',
  'SMART_ROUTER_IDLE_TIMEOUT_SECONDS',
  'SMART_ROUTER_SWITCH_THRESHOLD',
  'SMART_ROUTER_PLANNING_DELEGATE_ENABLED',
  'SMART_ROUTER_PLANNING_DELEGATE_MAX_MESSAGES',
  'SMART_ROUTER_PLANNING_DELEGATE_MAX_TOKENS',
  'SMART_ROUTER_PLANNING_DELEGATE_EXCLUDE_EXECUTION_HISTORY',
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe('DEFAULT_PLANNING_DELEGATE_CONFIG', () => {
  it('matches #71 compressed-context delegate defaults', () => {
    expect(DEFAULT_PLANNING_DELEGATE_CONFIG.enabled).toBe(true);
    expect(DEFAULT_PLANNING_DELEGATE_CONFIG.compressed_context.max_messages).toBe(12);
    expect(DEFAULT_PLANNING_DELEGATE_CONFIG.compressed_context.max_tokens).toBe(16_384);
    expect(DEFAULT_PLANNING_DELEGATE_CONFIG.compressed_context.exclude_execution_history).toBe(
      true,
    );
  });
});

describe('resolvePlanningDelegateConfigFromEnv', () => {
  it('returns defaults when env is unset', () => {
    expect(resolvePlanningDelegateConfigFromEnv()).toEqual(DEFAULT_PLANNING_DELEGATE_CONFIG);
  });

  it('overrides planning delegate fields from env', () => {
    process.env.SMART_ROUTER_PLANNING_DELEGATE_ENABLED = 'false';
    process.env.SMART_ROUTER_PLANNING_DELEGATE_MAX_MESSAGES = '8';
    process.env.SMART_ROUTER_PLANNING_DELEGATE_MAX_TOKENS = '8192';
    process.env.SMART_ROUTER_PLANNING_DELEGATE_EXCLUDE_EXECUTION_HISTORY = '0';

    expect(resolvePlanningDelegateConfigFromEnv()).toEqual({
      enabled: false,
      compressed_context: {
        max_messages: 8,
        max_tokens: 8192,
        exclude_execution_history: false,
      },
    });
  });

  it('ignores invalid env values', () => {
    process.env.SMART_ROUTER_PLANNING_DELEGATE_MAX_MESSAGES = '0';
    process.env.SMART_ROUTER_PLANNING_DELEGATE_MAX_TOKENS = 'not-a-number';

    expect(resolvePlanningDelegateConfigFromEnv()).toEqual(DEFAULT_PLANNING_DELEGATE_CONFIG);
  });
});

describe('DEFAULT_SAAR_CONFIG', () => {
  it('matches roadmap SAAR recommendations', () => {
    expect(DEFAULT_SAAR_CONFIG.planning_turn_buffer).toBe(2);
    expect(DEFAULT_SAAR_CONFIG.prefix_cache_weight).toBe(0.20);
    expect(DEFAULT_SAAR_CONFIG.idle_timeout_seconds).toBe(300);
    expect(DEFAULT_SAAR_CONFIG.switch_threshold).toBe(0.5);
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
