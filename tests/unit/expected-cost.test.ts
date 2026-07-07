import { describe, expect, it } from 'vitest';

import {
  computeExpectedCost,
  FRONTIER_P_SUCCESS,
  MIN_PRICE_DELTA_PER_1M,
  resolveTierCostPer1M,
  selectTierByExpectedCost,
} from '../../src/domain/routing/expected-cost.js';
import type { ModelProfile, PriceCatalog, SessionPin } from '../../src/domain/types/index.js';

function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'test',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeCatalog(
  overrides: Partial<PriceCatalog> = {},
): PriceCatalog {
  return {
    registry_snapshot: {},
    user_overrides: {},
    last_updated: '2026-01-01T00:00:00.000Z',
    source: 'yaml_fallback',
    ...overrides,
  };
}

function makePin(overrides: Partial<SessionPin> = {}): SessionPin {
  return {
    session_id: 'sess-1',
    pinned_model_id: 'frontier-a',
    pin_reason: 'initial',
    has_ever_switched: false,
    consecutive_upstream_errors: 0,
    consecutive_tool_failures: 0,
    last_tool_failure_signature: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const fleet: ModelProfile[] = [
  makeModel({ id: 'zero-a', tier: 'zero-tier', pricing: { fallback_cost_per_1m: 0 } }),
  makeModel({
    id: 'econ-a',
    tier: 'economical-cloud',
    provider: 'openai',
    pricing: { fallback_cost_per_1m: 0.5 },
  }),
  makeModel({
    id: 'frontier-a',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    pricing: { fallback_cost_per_1m: 3.0 },
  }),
];

describe('computeExpectedCost', () => {
  it('computes E[cost] = P*direct + (1-P)*escalation for economical tier', () => {
    const estTokens = 1_000_000;
    const result = computeExpectedCost(
      'economical-cloud',
      0.8,
      null,
      estTokens,
      3.5,
      { costPer1M: 0.5 },
    );

    expect(result.directCostUsd).toBe(0.5);
    expect(result.expectedCostUsd).toBeCloseTo(0.8 * 0.5 + 0.2 * 3.5, 6);
    expect(result.pSuccess).toBe(0.8);
  });

  it('uses subscription virtual cost via price catalog (SP-096)', () => {
    const cursorFrontier = makeModel({
      id: 'composer-latest',
      tier: 'frontier-cloud',
      provider: 'cursor',
      pricing: { fallback_cost_per_1m: 0, quota_cost_per_1m: 4.0 },
    });

    const costPer1M = resolveTierCostPer1M('frontier-cloud', [cursorFrontier], null);
    expect(costPer1M).toBe(4.0);

    const result = computeExpectedCost(
      'frontier-cloud',
      0.5,
      null,
      1_000_000,
      0,
      { costPer1M },
    );

    expect(result.costPer1M).toBe(4.0);
    expect(result.pSuccess).toBe(FRONTIER_P_SUCCESS);
    expect(result.expectedCostUsd).toBe(4.0);
  });

  it('applies alpha risk penalty when alpha < 1', () => {
    const pure = computeExpectedCost(
      'economical-cloud',
      0.2,
      null,
      1_000_000,
      3.5,
      { costPer1M: 0.5, alpha: 1 },
    );
    const riskAware = computeExpectedCost(
      'economical-cloud',
      0.2,
      null,
      1_000_000,
      3.5,
      { costPer1M: 0.5, alpha: 0.2 },
    );

    expect(riskAware.adjustedExpectedCostUsd).toBeGreaterThan(
      pure.adjustedExpectedCostUsd,
    );
  });
});

describe('selectTierByExpectedCost', () => {
  it('selects economical tier when P is high and price delta is significant', () => {
    const result = selectTierByExpectedCost({
      fleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      pSuccessCheap: 0.9,
      alpha: 1,
      localZeroReady: false,
    });

    expect(result.tierHint).toBe('economical-cloud');
    expect(result.reasonCode).toBe('expected_cost_economical_cloud');
    expect(result.tierCosts.length).toBeGreaterThanOrEqual(2);
    expect(
      result.tierCosts.find((entry) => entry.tier === 'economical-cloud')?.expectedCostUsd,
    ).toBeLessThan(
      result.tierCosts.find((entry) => entry.tier === 'frontier-cloud')!.expectedCostUsd,
    );
  });

  it('selects frontier when P is low even if economical per-token cost is lower', () => {
    const result = selectTierByExpectedCost({
      fleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      pSuccessCheap: 0.1,
      alpha: 1,
      localZeroReady: false,
    });

    expect(result.tierHint).toBe('frontier-cloud');
    expect(result.reasonCode).toBe('expected_cost_frontier_cloud');
  });

  it('defers economical hint when price delta is below threshold despite high P(success)', () => {
    const uniformFleet = [
      makeModel({
        id: 'econ-b',
        tier: 'economical-cloud',
        pricing: { fallback_cost_per_1m: 2.5 },
      }),
      makeModel({
        id: 'frontier-b',
        tier: 'frontier-cloud',
        pricing: { fallback_cost_per_1m: 2.7 },
      }),
    ];

    const result = selectTierByExpectedCost({
      fleet: uniformFleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      pSuccessCheap: 0.99,
      alpha: 1,
      localZeroReady: false,
    });

    expect(2.7 - 2.5).toBeLessThan(MIN_PRICE_DELTA_PER_1M);
    expect(result.tierHint).toBeNull();
    expect(result.reasonCode).toBe('expected_cost_price_delta_insufficient');
  });

  it('keeps pinned tier when cache reprime exceeds savings (FR-008)', () => {
    const pinnedModel = makeModel({
      id: 'frontier-a',
      tier: 'frontier-cloud',
      provider: 'anthropic',
      pricing: { fallback_cost_per_1m: 3.0 },
    });
    const economicalCandidate = makeModel({
      id: 'econ-a',
      tier: 'economical-cloud',
      provider: 'openai',
      pricing: { fallback_cost_per_1m: 0.5 },
    });

    const result = selectTierByExpectedCost({
      fleet: [economicalCandidate, pinnedModel],
      priceCatalog: makeCatalog(),
      estTokens: 5_000,
      pSuccessCheap: 0.95,
      alpha: 1,
      localZeroReady: false,
      pinnedModel,
      sessionPin: makePin({ pinned_model_id: pinnedModel.id }),
    });

    expect(result.blockedByPinEconomics).toBe(true);
    expect(result.tierHint).toBe('frontier-cloud');
    expect(result.reasonCode).toBe('expected_cost_pin_cache_economics');
  });

  it('includes zero-tier when local zero is ready', () => {
    const result = selectTierByExpectedCost({
      fleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      pSuccessCheap: 0.95,
      alpha: 1,
      localZeroReady: true,
    });

    expect(result.tierCosts.some((entry) => entry.tier === 'zero-tier')).toBe(true);
    expect(result.tierHint).toBe('zero-tier');
  });
});
