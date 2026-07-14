/**
 * Unit tests for session / window stats aggregation (SP-207 / #118).
 */

import { describe, expect, it } from 'vitest';

import type { RoutingTelemetry } from '../../src/domain/types/index.js';
import {
  aggregateSessionStats,
  assertSessionStatsPrivacySafe,
  classifyRoleCostBucket,
  estimateFrontierSavingsUsd,
  resolveFrontierCostPer1M,
  type SessionStatsSnapshot,
} from '../../src/infrastructure/telemetry/session-stats.js';
import type { ModelProfile } from '../../src/domain/types/index.js';

function makeEntry(overrides: Partial<RoutingTelemetry> = {}): RoutingTelemetry {
  return {
    timestamp: '2026-07-13T12:00:00.000Z',
    session_id: 'sess-1',
    request_id: 'req-1',
    turn_type: 'main_loop',
    stage: 'hydra',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'gpt-4o-mini',
    estimated_cost_usd: 0.001,
    routing_latency_ms: 10,
    pin_reason: null,
    estimated_input_tokens: 1000,
    context_fit_viable_count: null,
    context_fit_rejected_json: null,
    context_overflow_pin_break: false,
    selected_model_max_input_tokens: null,
    context_fit_reason_code: null,
    cluster_id: null,
    cluster_similarity: null,
    cluster_margin: null,
    low_intensity_score: null,
    tier_hint: 'economical-cloud',
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

function frontierProfile(id: string, costPer1M: number): ModelProfile {
  return {
    id,
    tier: 'frontier-cloud',
    provider: 'openai',
    capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
    pricing: { fallback_cost_per_1m: costPer1M },
  };
}

describe('aggregateSessionStats (SP-207)', () => {
  it('returns zeros / nulls for an empty store', () => {
    const snapshot = aggregateSessionStats([]);
    expect(snapshot.entry_count).toBe(0);
    expect(snapshot.total_cost_usd).toBe(0);
    expect(snapshot.mean_cost_usd).toBeNull();
    expect(snapshot.mean_latency_ms).toBeNull();
    expect(snapshot.planning_delegate_share).toBeNull();
    expect(snapshot.direct_share).toBeNull();
    expect(snapshot.local_share).toBeNull();
    expect(snapshot.cloud_share).toBeNull();
    expect(snapshot.role_cost.primary.count).toBe(0);
    expect(snapshot.role_cost.planning_delegate.count).toBe(0);
    expect(snapshot.role_cost.other.count).toBe(0);
    expect(snapshot.frontier_savings_usd).toBeUndefined();
  });

  it('aggregates mixed planning_delegate vs direct / pin primary / other', () => {
    const entries = [
      makeEntry({
        request_id: 'a',
        pin_reason: 'session_pin',
        estimated_cost_usd: 0.002,
        routing_latency_ms: 5,
        planning_delegate_path: null,
        tier_hint: 'economical-cloud',
      }),
      makeEntry({
        request_id: 'b',
        pin_reason: null,
        estimated_cost_usd: 0.01,
        routing_latency_ms: 20,
        planning_delegate_path: 'delegate',
        planning_delegate_model_id: 'gpt-4o',
        tier_hint: 'frontier-cloud',
      }),
      makeEntry({
        request_id: 'c',
        pin_reason: null,
        estimated_cost_usd: 0.003,
        routing_latency_ms: 15,
        planning_delegate_path: 'direct',
        selected_model_id: 'local-llama',
        tier_hint: 'zero-tier',
      }),
    ];

    const snapshot = aggregateSessionStats(entries);

    expect(snapshot.entry_count).toBe(3);
    expect(snapshot.total_cost_usd).toBeCloseTo(0.015);
    expect(snapshot.mean_cost_usd).toBeCloseTo(0.005);
    expect(snapshot.mean_latency_ms).toBeCloseTo(40 / 3);
    expect(snapshot.planning_delegate_share).toBeCloseTo(1 / 3);
    expect(snapshot.direct_share).toBeCloseTo(2 / 3);
    expect(snapshot.local_share).toBeCloseTo(1 / 3);
    expect(snapshot.cloud_share).toBeCloseTo(2 / 3);

    expect(classifyRoleCostBucket(entries[0]!)).toBe('primary');
    expect(classifyRoleCostBucket(entries[1]!)).toBe('planning_delegate');
    expect(classifyRoleCostBucket(entries[2]!)).toBe('other');

    expect(snapshot.role_cost.primary).toEqual({ count: 1, total_cost_usd: 0.002 });
    expect(snapshot.role_cost.planning_delegate.count).toBe(1);
    expect(snapshot.role_cost.planning_delegate.total_cost_usd).toBeCloseTo(0.01);
    expect(snapshot.role_cost.other).toEqual({ count: 1, total_cost_usd: 0.003 });
    expect(snapshot.frontier_savings_usd).toBeUndefined();
  });

  it('omits frontier_savings_usd when prices are missing (fail closed)', () => {
    const entries = [makeEntry({ estimated_input_tokens: 2_000_000, estimated_cost_usd: 0.1 })];
    expect(aggregateSessionStats(entries).frontier_savings_usd).toBeUndefined();
    expect(estimateFrontierSavingsUsd(entries, undefined)).toBeUndefined();
    expect(estimateFrontierSavingsUsd(entries, 0)).toBeUndefined();
    expect(estimateFrontierSavingsUsd(entries, -1)).toBeUndefined();
    expect(resolveFrontierCostPer1M([])).toBeUndefined();
    expect(resolveFrontierCostPer1M(undefined, null)).toBeUndefined();
  });

  it('computes frontier savings when frontier_cost_per_1m is provided', () => {
    const entries = [
      makeEntry({
        estimated_input_tokens: 1_000_000,
        estimated_cost_usd: 0.5,
      }),
      makeEntry({
        request_id: 'no-tokens',
        estimated_input_tokens: null,
        estimated_cost_usd: 0.1,
      }),
    ];

    // frontier cost = 1M tokens * $2/1M = $2; savings = max(0, 2 - 0.5) = 1.5
    const snapshot = aggregateSessionStats(entries, { frontier_cost_per_1m: 2 });
    expect(snapshot.frontier_savings_usd).toBeCloseTo(1.5);

    const fromFleet = resolveFrontierCostPer1M([
      frontierProfile('cheap-frontier', 1),
      frontierProfile('pricey-frontier', 5),
    ]);
    expect(fromFleet).toBe(5);
  });

  it('snapshot JSON is privacy-safe (no prompt keys)', () => {
    const snapshot = aggregateSessionStats([
      makeEntry({ planning_delegate_path: 'delegate', pin_reason: null }),
    ]);

    expect(() => assertSessionStatsPrivacySafe(snapshot)).not.toThrow();

    const json = JSON.stringify(snapshot);
    for (const bad of ['prompt', 'prompt_text', 'messages', 'content', 'tool_calls']) {
      expect(json).not.toMatch(new RegExp(`"${bad}"`));
    }

    // Typed snapshot surface should only expose aggregate fields.
    const keys = Object.keys(snapshot) as (keyof SessionStatsSnapshot)[];
    expect(keys).not.toContain('prompt_text');
    expect(keys).not.toContain('messages');
    expect(keys).toContain('role_cost');
  });
});
