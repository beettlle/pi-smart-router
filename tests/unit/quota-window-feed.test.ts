import { afterEach, describe, expect, it } from 'vitest';

import { resolveQuotaWindowFeedPosition } from '../../.pi/extensions/smart-router/fleet-bootstrap.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import {
  DEFAULT_QUOTA_WINDOW_ESTIMATE_CONFIG,
  DEFAULT_QUOTA_WINDOW_SECONDS,
  collectPoolModelIds,
  estimatePoolWindowPosition,
  resolveQuotaWindowEstimateConfigFromEnv,
  resolveQuotaWindowPosition,
  sanitizeAdapterPosition,
  type QuotaWindowAdapter,
} from '../../src/domain/pricing/quota-window-feed.js';
import type { ModelProfile, RoutingTelemetry } from '../../src/domain/types/index.js';

const NOW = new Date('2026-08-02T12:00:00.000Z');
const WINDOW = DEFAULT_QUOTA_WINDOW_SECONDS; // 5h
const BUDGET = 1_000_000;
const CONFIG = { window_seconds: WINDOW, pool_budget_tokens: BUDGET };

function makeModel(
  id: string,
  pricing: ModelProfile['pricing'],
): ModelProfile {
  return {
    id,
    provider: 'test',
    tier: 'frontier-cloud',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing,
  };
}

function makeEntry(overrides: Partial<RoutingTelemetry> = {}): RoutingTelemetry {
  return {
    timestamp: NOW.toISOString(),
    session_id: 'sess-1',
    request_id: 'req-1',
    turn_type: 'main_loop',
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    selected_model_id: 'composer-latest',
    estimated_cost_usd: 0,
    routing_latency_ms: 2,
    pin_reason: null,
    estimated_input_tokens: null,
    context_fit_viable_count: null,
    context_fit_rejected_json: null,
    context_overflow_pin_break: false,
    selected_model_max_input_tokens: null,
    context_fit_reason_code: null,
    cluster_id: null,
    cluster_similarity: null,
    cluster_margin: null,
    low_intensity_score: null,
    tier_hint: null,
    p_success_cheap: null,
    local_eligible_reason: null,
    tier_selection_reason_code: null,
    marginal_savings: null,
    future_cache_value: null,
    cache_reprime_cost: null,
    breakeven_decision: null,
    breakeven_reason_code: null,
    saar_buffer_active: false,
    saar_hard_lock: false,
    turn_index_in_session: null,
    saar_reason_code: null,
    planning_delegate_path: null,
    planning_delegate_primary_model_id: null,
    planning_delegate_model_id: null,
    planning_delegate_reason_code: null,
    planning_delegate_fallback_reason: null,
    planning_delegate_max_messages: null,
    planning_delegate_max_tokens: null,
    planning_delegate_exclude_execution_history: null,
    pin_only_fallback_active: false,
    ...overrides,
  };
}

function isoSecondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe('collectPoolModelIds', () => {
  it('collects models with a virtual quota rate (SP-096) into one shared pool', () => {
    const fleet = [
      makeModel('composer-latest', { fallback_cost_per_1m: 0, quota_cost_per_1m: 4 }),
      makeModel('cursor/auto', { fallback_cost_per_1m: 0, quota_cost_per_1m: 2 }),
      makeModel('gpt-4o-mini', { fallback_cost_per_1m: 0.6 }),
    ];

    const ids = collectPoolModelIds(fleet);
    expect([...ids].sort()).toEqual(['composer-latest', 'cursor/auto']);
  });

  it('returns an empty set when the fleet has no subscription models', () => {
    const fleet = [makeModel('gpt-4o-mini', { fallback_cost_per_1m: 0.6 })];
    expect(collectPoolModelIds(fleet).size).toBe(0);
  });
});

describe('estimatePoolWindowPosition', () => {
  const pool = new Set(['composer-latest', 'cursor/auto']);

  it('returns null when the budget is disabled or invalid (never invent a budget)', () => {
    const entries = [makeEntry({ estimated_input_tokens: 1000 })];
    expect(
      estimatePoolWindowPosition(entries, pool, DEFAULT_QUOTA_WINDOW_ESTIMATE_CONFIG, NOW),
    ).toBeNull();
    expect(
      estimatePoolWindowPosition(entries, pool, { window_seconds: WINDOW, pool_budget_tokens: -5 }, NOW),
    ).toBeNull();
    expect(
      estimatePoolWindowPosition(entries, pool, { window_seconds: 0, pool_budget_tokens: BUDGET }, NOW),
    ).toBeNull();
  });

  it('returns null when the pool is empty', () => {
    expect(estimatePoolWindowPosition([makeEntry()], new Set(), CONFIG, NOW)).toBeNull();
  });

  it('reports a fresh window when nothing burned in-window', () => {
    const position = estimatePoolWindowPosition([], pool, CONFIG, NOW);
    expect(position).toEqual({ remaining_window_fraction: 1, elapsed_window_seconds: 0 });
  });

  it('estimates remaining fraction from pool-level token burn', () => {
    const entries = [
      makeEntry({ estimated_input_tokens: 200_000, timestamp: isoSecondsAgo(600) }),
      makeEntry({
        selected_model_id: 'cursor/auto',
        estimated_input_tokens: 300_000,
        timestamp: isoSecondsAgo(300),
      }),
    ];

    const position = estimatePoolWindowPosition(entries, pool, CONFIG, NOW);
    expect(position?.remaining_window_fraction).toBeCloseTo(0.5, 6);
    expect(position?.elapsed_window_seconds).toBeCloseTo(600, 1);
  });

  it('ignores non-pool models, out-of-window entries, and missing token counts', () => {
    const entries = [
      makeEntry({
        selected_model_id: 'gpt-4o-mini',
        estimated_input_tokens: 900_000,
        timestamp: isoSecondsAgo(60),
      }),
      makeEntry({ estimated_input_tokens: 900_000, timestamp: isoSecondsAgo(WINDOW + 60) }),
      makeEntry({ estimated_input_tokens: null, timestamp: isoSecondsAgo(120) }),
      makeEntry({ estimated_input_tokens: 100_000, timestamp: isoSecondsAgo(60) }),
      makeEntry({ estimated_input_tokens: 100_000, timestamp: 'not-a-date' }),
      makeEntry({ estimated_input_tokens: 100_000, timestamp: isoSecondsAgo(-60) }),
    ];

    const position = estimatePoolWindowPosition(entries, pool, CONFIG, NOW);
    expect(position?.remaining_window_fraction).toBeCloseTo(0.9, 6);
    expect(position?.elapsed_window_seconds).toBeCloseTo(120, 1);
  });

  it('clamps remaining fraction at 0 when burn exceeds the budget', () => {
    const entries = [
      makeEntry({ estimated_input_tokens: 2_000_000, timestamp: isoSecondsAgo(60) }),
    ];

    const position = estimatePoolWindowPosition(entries, pool, CONFIG, NOW);
    expect(position?.remaining_window_fraction).toBe(0);
  });

  it('caps elapsed seconds at the window length', () => {
    const entries = [
      makeEntry({ estimated_input_tokens: 1, timestamp: isoSecondsAgo(WINDOW - 1) }),
    ];

    const position = estimatePoolWindowPosition(entries, pool, CONFIG, NOW);
    expect(position?.elapsed_window_seconds).toBeLessThanOrEqual(WINDOW);
  });
});

describe('sanitizeAdapterPosition', () => {
  it('passes through a valid position', () => {
    expect(
      sanitizeAdapterPosition({ remaining_window_fraction: 0.4, elapsed_window_seconds: 120 }),
    ).toEqual({ remaining_window_fraction: 0.4, elapsed_window_seconds: 120 });
  });

  it('clamps out-of-range fractions', () => {
    expect(sanitizeAdapterPosition({ remaining_window_fraction: 1.7 })).toEqual({
      remaining_window_fraction: 1,
    });
    expect(sanitizeAdapterPosition({ remaining_window_fraction: -0.2 })).toEqual({
      remaining_window_fraction: 0,
    });
  });

  it('rejects null and non-finite fractions', () => {
    expect(sanitizeAdapterPosition(null)).toBeNull();
    expect(
      sanitizeAdapterPosition({ remaining_window_fraction: Number.NaN }),
    ).toBeNull();
  });

  it('drops invalid elapsed values but keeps the position', () => {
    expect(
      sanitizeAdapterPosition({
        remaining_window_fraction: 0.5,
        elapsed_window_seconds: Number.NaN,
      }),
    ).toEqual({ remaining_window_fraction: 0.5 });
  });
});

describe('resolveQuotaWindowPosition (degrade chain)', () => {
  const pool = new Set(['composer-latest']);
  const entries = [makeEntry({ estimated_input_tokens: 250_000 })];

  function adapterReturning(
    value: { remaining_window_fraction: number } | null,
  ): QuotaWindowAdapter {
    return {
      id: 'test-adapter',
      getWindowPosition: () => Promise.resolve(value),
    };
  }

  it('prefers a trustworthy adapter signal (step 1)', async () => {
    const position = await resolveQuotaWindowPosition({
      adapter: adapterReturning({ remaining_window_fraction: 0.1 }),
      entries,
      poolModelIds: pool,
      estimateConfig: CONFIG,
      now: NOW,
    });
    expect(position?.remaining_window_fraction).toBe(0.1);
  });

  it('falls back to the telemetry estimate when the adapter has no signal (step 2)', async () => {
    const position = await resolveQuotaWindowPosition({
      adapter: adapterReturning(null),
      entries,
      poolModelIds: pool,
      estimateConfig: CONFIG,
      now: NOW,
    });
    expect(position?.remaining_window_fraction).toBeCloseTo(0.75, 6);
  });

  it('degrades to the estimate when the adapter throws', async () => {
    const failing: QuotaWindowAdapter = {
      id: 'failing',
      getWindowPosition: () => Promise.reject(new Error('usage API down')),
    };

    const position = await resolveQuotaWindowPosition({
      adapter: failing,
      entries,
      poolModelIds: pool,
      estimateConfig: CONFIG,
      now: NOW,
    });
    expect(position?.remaining_window_fraction).toBeCloseTo(0.75, 6);
  });

  it('degrades to the estimate when the adapter returns an untrustworthy value', async () => {
    const position = await resolveQuotaWindowPosition({
      adapter: adapterReturning({ remaining_window_fraction: Number.NaN }),
      entries,
      poolModelIds: pool,
      estimateConfig: CONFIG,
      now: NOW,
    });
    expect(position?.remaining_window_fraction).toBeCloseTo(0.75, 6);
  });

  it('omits the position when no adapter and no usable estimate exist (step 3)', async () => {
    await expect(resolveQuotaWindowPosition({ now: NOW })).resolves.toBeUndefined();
    await expect(
      resolveQuotaWindowPosition({
        adapter: adapterReturning(null),
        entries,
        poolModelIds: pool,
        estimateConfig: DEFAULT_QUOTA_WINDOW_ESTIMATE_CONFIG,
        now: NOW,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('resolveQuotaWindowEstimateConfigFromEnv', () => {
  const ENV_KEYS = [
    'SMART_ROUTER_QUOTA_WINDOW_SECONDS',
    'SMART_ROUTER_QUOTA_POOL_BUDGET_TOKENS',
  ] as const;

  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it('returns defaults when env is unset', () => {
    expect(resolveQuotaWindowEstimateConfigFromEnv()).toEqual(
      DEFAULT_QUOTA_WINDOW_ESTIMATE_CONFIG,
    );
  });

  it('reads positive numeric overrides', () => {
    process.env.SMART_ROUTER_QUOTA_WINDOW_SECONDS = '3600';
    process.env.SMART_ROUTER_QUOTA_POOL_BUDGET_TOKENS = '500000';

    expect(resolveQuotaWindowEstimateConfigFromEnv()).toEqual({
      window_seconds: 3600,
      pool_budget_tokens: 500_000,
    });
  });

  it('ignores invalid env values', () => {
    process.env.SMART_ROUTER_QUOTA_WINDOW_SECONDS = '-10';
    process.env.SMART_ROUTER_QUOTA_POOL_BUDGET_TOKENS = 'not-a-number';

    expect(resolveQuotaWindowEstimateConfigFromEnv()).toEqual(
      DEFAULT_QUOTA_WINDOW_ESTIMATE_CONFIG,
    );
  });
});

describe('resolveQuotaWindowFeedPosition (extension wiring)', () => {
  it('omits the position when the fleet has no subscription pool and no adapter', async () => {
    const store = new MemoryStore();
    const fleet = [makeModel('gpt-4o-mini', { fallback_cost_per_1m: 0.6 })];

    await expect(resolveQuotaWindowFeedPosition(store, fleet)).resolves.toBeUndefined();
  });

  it('derives a pool-level estimate from store telemetry when configured', async () => {
    const store = new MemoryStore();
    store.appendTelemetry(
      makeEntry({
        selected_model_id: 'composer-latest',
        estimated_input_tokens: 400_000,
        timestamp: NOW.toISOString(),
      }),
    );
    const fleet = [
      makeModel('composer-latest', { fallback_cost_per_1m: 0, quota_cost_per_1m: 4 }),
    ];

    const position = await resolveQuotaWindowFeedPosition(store, fleet, {
      estimateConfig: CONFIG,
      now: NOW,
    });
    expect(position?.remaining_window_fraction).toBeCloseTo(0.6, 6);
  });

  it('uses the adapter even when the fleet has no pool models', async () => {
    const store = new MemoryStore();
    const fleet = [makeModel('gpt-4o-mini', { fallback_cost_per_1m: 0.6 })];

    const position = await resolveQuotaWindowFeedPosition(store, fleet, {
      adapter: {
        id: 'test-adapter',
        getWindowPosition: () => Promise.resolve({ remaining_window_fraction: 0.3 }),
      },
      now: NOW,
    });
    expect(position?.remaining_window_fraction).toBe(0.3);
  });

  it('omits the position when the feed is disabled (default config)', async () => {
    const store = new MemoryStore();
    store.appendTelemetry(
      makeEntry({
        selected_model_id: 'composer-latest',
        estimated_input_tokens: 400_000,
        timestamp: NOW.toISOString(),
      }),
    );
    const fleet = [
      makeModel('composer-latest', { fallback_cost_per_1m: 0, quota_cost_per_1m: 4 }),
    ];

    const position = await resolveQuotaWindowFeedPosition(store, fleet, { now: NOW });
    expect(position).toBeUndefined();
  });
});
