import { describe, expect, it } from 'vitest';

import {
  buildCostCalibrationPrior,
  computeExpectedCost,
  formatVirtualCostV2Explain,
  FRONTIER_P_SUCCESS,
  MIN_PRICE_DELTA_PER_1M,
  resolveCostCalibrationRatio,
  resolveTierCostPer1M,
  resolveTierVirtualCost,
  selectTierByExpectedCost,
  type CostCalibrationPrior,
} from '../../src/domain/routing/expected-cost.js';
import type {
  ModelProfile,
  PriceCatalog,
  RoutingTelemetry,
  SessionPin,
} from '../../src/domain/types/index.js';

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
    expect(result.virtualCostV2).toBeNull();
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

describe('virtual cost v2 integration (SP-149)', () => {
  const subscriptionFleet: ModelProfile[] = [
    makeModel({
      id: 'cursor-frontier',
      tier: 'frontier-cloud',
      provider: 'cursor',
      pricing: { fallback_cost_per_1m: 0, quota_cost_per_1m: 4.0 },
    }),
    makeModel({
      id: 'openai-econ',
      tier: 'economical-cloud',
      provider: 'openai',
      pricing: { fallback_cost_per_1m: 0.5 },
    }),
  ];

  it('raises frontier effective cost near quota window exhaustion', () => {
    const estTokens = 1_000_000;
    const atStart = resolveTierVirtualCost({
      tier: 'frontier-cloud',
      fleet: subscriptionFleet,
      priceCatalog: makeCatalog(),
      estTokens,
      quotaWindowPosition: { remaining_window_fraction: 0.95 },
    });
    const nearExhaustion = resolveTierVirtualCost({
      tier: 'frontier-cloud',
      fleet: subscriptionFleet,
      priceCatalog: makeCatalog(),
      estTokens,
      quotaWindowPosition: { remaining_window_fraction: 0.05 },
    });

    expect(nearExhaustion.directCostUsd).toBeGreaterThan(atStart.directCostUsd);
    expect(nearExhaustion.virtualCostV2.exhaustionRiskPremium).toBeGreaterThan(0);
    expect(nearExhaustion.virtualCostV2.quotaArbitragePremium).toBeGreaterThan(
      atStart.virtualCostV2.quotaArbitragePremium,
    );
  });

  it('credits KV-cache savings on pinned tier expected cost', () => {
    const pinnedModel = subscriptionFleet[0]!;
    const sessionPin = makePin({ pinned_model_id: pinnedModel.id });
    const estTokens = 100_000;

    const withoutPin = resolveTierVirtualCost({
      tier: 'frontier-cloud',
      fleet: subscriptionFleet,
      priceCatalog: makeCatalog(),
      estTokens,
      quotaWindowPosition: { remaining_window_fraction: 0.8 },
    });
    const withPin = resolveTierVirtualCost({
      tier: 'frontier-cloud',
      fleet: subscriptionFleet,
      priceCatalog: makeCatalog(),
      estTokens,
      quotaWindowPosition: { remaining_window_fraction: 0.8 },
      sessionPin,
      pinnedModel,
    });

    expect(withPin.virtualCostV2.kvCacheSavings).toBeLessThan(0);
    expect(withPin.directCostUsd).toBeLessThan(withoutPin.directCostUsd);
  });

  it('documents v2 breakdown in tier selection rationale', () => {
    const result = selectTierByExpectedCost({
      fleet: subscriptionFleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      pSuccessCheap: 0.1,
      alpha: 1,
      localZeroReady: false,
      quotaWindowPosition: { remaining_window_fraction: 0.1 },
    });

    expect(result.tierHint).toBe('frontier-cloud');
    expect(result.rationale).toContain('v2');
    expect(result.rationale).toContain('quota_premium=');
    expect(formatVirtualCostV2Explain(result.tierCosts[0]?.virtualCostV2 ?? null)).toContain(
      'exhaustion=',
    );
  });

  it('increases frontier E[cost] more than economical when only frontier has subscription quota', () => {
    const baseInput = {
      fleet: subscriptionFleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      pSuccessCheap: 0.75,
      alpha: 1,
      localZeroReady: false,
    };

    const atStart = selectTierByExpectedCost({
      ...baseInput,
      quotaWindowPosition: { remaining_window_fraction: 1 },
    });
    const nearExhaustion = selectTierByExpectedCost({
      ...baseInput,
      quotaWindowPosition: { remaining_window_fraction: 0.02 },
    });

    const frontierAtStart = atStart.tierCosts.find((entry) => entry.tier === 'frontier-cloud')!;
    const frontierNearExhaustion = nearExhaustion.tierCosts.find(
      (entry) => entry.tier === 'frontier-cloud',
    )!;
    const econAtStart = atStart.tierCosts.find((entry) => entry.tier === 'economical-cloud')!;
    const econNearExhaustion = nearExhaustion.tierCosts.find(
      (entry) => entry.tier === 'economical-cloud',
    )!;

    const frontierDelta =
      frontierNearExhaustion.adjustedExpectedCostUsd - frontierAtStart.adjustedExpectedCostUsd;
    const econDelta =
      econNearExhaustion.adjustedExpectedCostUsd - econAtStart.adjustedExpectedCostUsd;

    expect(frontierDelta).toBeGreaterThan(econDelta);
    expect(frontierNearExhaustion.virtualCostV2?.exhaustionRiskPremium).toBeGreaterThan(0);
  });
});

describe('virtual cost v2 regression (SP-150)', () => {
  const composerFleet: ModelProfile[] = [
    makeModel({
      id: 'composer-latest',
      tier: 'frontier-cloud',
      provider: 'cursor',
      pricing: { fallback_cost_per_1m: 0, quota_cost_per_1m: 4.0 },
    }),
    makeModel({
      id: 'openai-econ',
      tier: 'economical-cloud',
      provider: 'openai',
      pricing: { fallback_cost_per_1m: 0.5 },
    }),
  ];

  it('regression: late-window routing prefers economical over composer when quota is low', () => {
    const baseInput = {
      fleet: composerFleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      pSuccessCheap: 0.5,
      alpha: 1,
      localZeroReady: false,
    };

    const atFullWindow = selectTierByExpectedCost({
      ...baseInput,
      quotaWindowPosition: { remaining_window_fraction: 1 },
    });
    const lateWindow = selectTierByExpectedCost({
      ...baseInput,
      quotaWindowPosition: { remaining_window_fraction: 0.02 },
    });

    const frontierAtFull = atFullWindow.tierCosts.find(
      (entry) => entry.tier === 'frontier-cloud',
    )!;
    const frontierLate = lateWindow.tierCosts.find(
      (entry) => entry.tier === 'frontier-cloud',
    )!;
    const economicalLate = lateWindow.tierCosts.find(
      (entry) => entry.tier === 'economical-cloud',
    )!;

    expect(atFullWindow.tierHint).toBe('economical-cloud');
    expect(lateWindow.tierHint).toBe('economical-cloud');
    expect(frontierLate.adjustedExpectedCostUsd).toBeGreaterThan(
      frontierAtFull.adjustedExpectedCostUsd,
    );
    expect(frontierLate.adjustedExpectedCostUsd).toBeGreaterThan(
      economicalLate.adjustedExpectedCostUsd,
    );
    expect(frontierLate.virtualCostV2?.exhaustionRiskPremium).toBeGreaterThan(0);
  });
});

// ─── Rolling cost calibration (SP-242, #164) ──────────────────────────────

function makeCalibrationEntry(
  overrides: Partial<RoutingTelemetry> = {},
): RoutingTelemetry {
  return {
    timestamp: '2026-08-30T12:00:00.000Z',
    session_id: 'sess-1',
    request_id: 'req-cal-1',
    turn_type: 'main_loop',
    stage: 'hydra',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'econ-a',
    estimated_cost_usd: 0.001,
    routing_latency_ms: 5,
    pin_reason: null,
    estimated_input_tokens: 10_000,
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
    planning_delegate_workers_spawned: null,
    planning_delegate_workers_succeeded: null,
    planning_delegate_worker_timeout_count: null,
    pin_only_fallback_active: false,
    actual_cost_usd: 0.002,
    ...overrides,
  } as RoutingTelemetry;
}

function entries(
  count: number,
  make: (index: number) => RoutingTelemetry,
): RoutingTelemetry[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

describe('buildCostCalibrationPrior (SP-242)', () => {
  it('builds warm per-model and per-tier buckets from actual/estimate pairs', () => {
    const rows = entries(3, () =>
      makeCalibrationEntry({ selected_model_id: 'econ-a' }),
    );
    const prior = buildCostCalibrationPrior(rows);

    expect(prior).not.toBeNull();
    // actual 0.002 / estimate 0.001 = 2.0 mean, clamped at maxRatio.
    expect(prior!.byModel.get('econ-a')?.ratio).toBeCloseTo(2.0, 6);
    expect(prior!.byModel.get('econ-a')?.samples).toBe(3);
    expect(prior!.byModel.get('econ-a')?.kind).toBe('model');
    expect(prior!.byTier.get('economical-cloud')?.ratio).toBeCloseTo(2.0, 6);
    expect(prior!.byTier.get('economical-cloud')?.kind).toBe('tier');
  });

  it('is cold (null) below minSamples — fail open to catalog', () => {
    const prior = buildCostCalibrationPrior([
      makeCalibrationEntry({ selected_model_id: 'econ-a' }),
      makeCalibrationEntry({ selected_model_id: 'econ-a' }),
    ]);

    expect(prior).toBeNull();
  });

  it('never invents USD: subscription rows (actual cost null/zero) and non-positive estimates are skipped', () => {
    const subscription = entries(3, () =>
      makeCalibrationEntry({
        selected_model_id: 'cursor-frontier',
        actual_cost_usd: null,
        tier_hint: 'frontier-cloud',
      }),
    );
    const zeroActual = entries(3, () =>
      makeCalibrationEntry({
        selected_model_id: 'cursor-frontier',
        actual_cost_usd: 0,
        tier_hint: 'frontier-cloud',
      }),
    );
    const zeroEstimate = entries(3, () =>
      makeCalibrationEntry({
        selected_model_id: 'zero-a',
        estimated_cost_usd: 0,
        tier_hint: 'zero-tier',
      }),
    );

    expect(buildCostCalibrationPrior(subscription)).toBeNull();
    expect(buildCostCalibrationPrior(zeroActual)).toBeNull();
    expect(buildCostCalibrationPrior(zeroEstimate)).toBeNull();
  });

  it('clamps per-pair outliers before averaging and the aggregate to the soft band', () => {
    const rows = [
      ...entries(2, () =>
        makeCalibrationEntry({ selected_model_id: 'econ-a', actual_cost_usd: 0.001 }),
      ),
      // Wild 1000× pair — sample clamp caps it at 10 before averaging.
      makeCalibrationEntry({
        selected_model_id: 'econ-a',
        actual_cost_usd: 1.0,
      }),
    ];
    const prior = buildCostCalibrationPrior(rows)!;

    // Mean of (1.0, 1.0, 10) = 4 → aggregate clamps to maxRatio 2.0.
    expect(prior.byModel.get('econ-a')?.ratio).toBe(2.0);
  });

  it('honors custom config (minSamples, ratio band)', () => {
    const rows = entries(2, () =>
      makeCalibrationEntry({
        selected_model_id: 'econ-a',
        actual_cost_usd: 0.0002,
      }),
    );
    const prior = buildCostCalibrationPrior(rows, {
      config: { minSamples: 2, minRatio: 0.75, maxRatio: 1.25, sampleMinRatio: 0.1, sampleMaxRatio: 10 },
    });

    expect(prior!.byModel.get('econ-a')?.ratio).toBe(0.75);
  });

  it('maps model ids to tiers via tierByModelId before tier_hint fallback', () => {
    const rows = entries(3, () =>
      makeCalibrationEntry({
        selected_model_id: 'composer-latest',
        tier_hint: null,
      }),
    );
    const viaMap = buildCostCalibrationPrior(rows, {
      tierByModelId: new Map([['composer-latest', 'frontier-cloud']]),
    })!;

    expect(viaMap.byTier.get('frontier-cloud')?.samples).toBe(3);
    expect(buildCostCalibrationPrior(rows)).not.toBeNull();
    expect(buildCostCalibrationPrior(rows)!.byTier.size).toBe(0);
  });
});

describe('resolveCostCalibrationRatio (SP-242)', () => {
  const prior: CostCalibrationPrior = {
    byModel: new Map([
      ['econ-a', { key: 'econ-a', kind: 'model', ratio: 1.5, samples: 5 }],
    ]),
    byTier: new Map([
      ['economical-cloud', { key: 'economical-cloud', kind: 'tier', ratio: 1.8, samples: 9 }],
    ]),
  };

  it('prefers the model bucket over the tier bucket', () => {
    expect(
      resolveCostCalibrationRatio(prior, {
        modelId: 'econ-a',
        tier: 'economical-cloud',
      }),
    ).toBe(1.5);
  });

  it('falls back to the tier bucket', () => {
    expect(
      resolveCostCalibrationRatio(prior, {
        modelId: 'econ-b',
        tier: 'economical-cloud',
      }),
    ).toBe(1.8);
  });

  it('fails open to 1 when cold, missing, or null prior', () => {
    expect(resolveCostCalibrationRatio(prior, { modelId: 'other-model' })).toBe(1);
    expect(resolveCostCalibrationRatio(null, { modelId: 'econ-a' })).toBe(1);
    expect(resolveCostCalibrationRatio(undefined, {})).toBe(1);
  });
});

describe('cost calibration in tier resolution (SP-242)', () => {
  it('soft-biases the base per-1M cost before the v2 chain; cold stays catalog', () => {
    const estTokens = 1_000_000;
    const input = {
      tier: 'frontier-cloud' as const,
      fleet,
      priceCatalog: makeCatalog(),
      estTokens,
    };

    const catalog = resolveTierVirtualCost(input);
    expect(catalog.calibrationRatio).toBe(1);
    expect(catalog.costPer1M).toBe(3.0);

    const warm: CostCalibrationPrior = {
      byModel: new Map([
        ['frontier-a', { key: 'frontier-a', kind: 'model', ratio: 1.5, samples: 4 }],
      ]),
      byTier: new Map(),
    };
    const calibrated = resolveTierVirtualCost({ ...input, costCalibration: warm });

    expect(calibrated.calibrationRatio).toBe(1.5);
    expect(calibrated.costPer1M).toBeCloseTo(4.5, 6);
    expect(calibrated.directCostUsd).toBeCloseTo(4.5, 6);
  });

  it('tier bucket applies when the model bucket is cold', () => {
    const warm: CostCalibrationPrior = {
      byModel: new Map(),
      byTier: new Map([
        ['frontier-cloud', { key: 'frontier-cloud', kind: 'tier', ratio: 0.5, samples: 4 }],
      ]),
    };
    const calibrated = resolveTierVirtualCost({
      tier: 'frontier-cloud',
      fleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      costCalibration: warm,
    });

    expect(calibrated.calibrationRatio).toBe(0.5);
    expect(calibrated.costPer1M).toBeCloseTo(1.5, 6);
  });

  it('leaves zero-cost tiers uncalibrated (no observable bias on free models)', () => {
    const warm: CostCalibrationPrior = {
      byModel: new Map(),
      byTier: new Map([
        ['zero-tier', { key: 'zero-tier', kind: 'tier', ratio: 2.0, samples: 4 }],
      ]),
    };
    const calibrated = resolveTierVirtualCost({
      tier: 'zero-tier',
      fleet,
      priceCatalog: makeCatalog(),
      estTokens: 1_000_000,
      costCalibration: warm,
    });

    expect(calibrated.calibrationRatio).toBe(1);
    expect(calibrated.costPer1M).toBe(0);
  });
});

describe('cost calibration in expected-cost selection (SP-242)', () => {
  const calibratedFleet: ModelProfile[] = [
    makeModel({ id: 'econ-cal', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 0.5 } }),
    makeModel({ id: 'frontier-cal', tier: 'frontier-cloud', pricing: { fallback_cost_per_1m: 1.2 } }),
  ];
  const baseInput = {
    fleet: calibratedFleet,
    priceCatalog: makeCatalog(),
    estTokens: 1_000_000,
    pSuccessCheap: 0.5,
    alpha: 1,
    localZeroReady: false,
  };
  const warmEconDouble: CostCalibrationPrior = {
    byModel: new Map([
      ['econ-cal', { key: 'econ-cal', kind: 'model', ratio: 2.0, samples: 5 }],
    ]),
    byTier: new Map(),
  };

  it('warm bias changes the winning tier and annotates the breakdown', () => {
    const baseline = selectTierByExpectedCost(baseInput);
    // Baseline: E[econ] = 0.5×0.5 + 0.5×(0.5+1.2) = 1.1 < frontier 1.2 → econ wins.
    expect(baseline.tierHint).toBe('economical-cloud');
    expect(baseline.calibrationApplied).toBe(false);

    const calibrated = selectTierByExpectedCost({
      ...baseInput,
      costCalibration: warmEconDouble,
    });
    // Calibrated: E[econ] = 0.5×1.0 + 0.5×(1.0+1.2) = 1.6 > frontier 1.2 → frontier wins.
    expect(calibrated.tierHint).toBe('frontier-cloud');
    expect(calibrated.calibrationApplied).toBe(false); // winner's own cost was NOT biased

    const econBreakdown = calibrated.tierCosts.find(
      (entry) => entry.tier === 'economical-cloud',
    )!;
    expect(econBreakdown.calibrationRatio).toBe(2.0);
    expect(econBreakdown.costPer1M).toBeCloseTo(1.0, 6);
    // Rationale describes the winning (unbiased) tier — no calibration note.
    expect(calibrated.rationale).not.toContain('cost-calib');
  });

  it('marks calibrationApplied when the winner itself was biased', () => {
    const warmFrontierDiscount: CostCalibrationPrior = {
      byModel: new Map([
        ['frontier-cal', { key: 'frontier-cal', kind: 'model', ratio: 0.5, samples: 5 }],
      ]),
      byTier: new Map(),
    };
    const calibrated = selectTierByExpectedCost({
      ...baseInput,
      costCalibration: warmFrontierDiscount,
    });

    expect(calibrated.tierHint).toBe('frontier-cloud');
    expect(calibrated.calibrationApplied).toBe(true);
    const frontierBreakdown = calibrated.tierCosts.find(
      (entry) => entry.tier === 'frontier-cloud',
    )!;
    expect(frontierBreakdown.calibrationRatio).toBe(0.5);
    expect(frontierBreakdown.costPer1M).toBeCloseTo(0.6, 6);
    // SMART_ROUTER_LOG_ROUTING surfaces the applied ratio via the rationale note.
    expect(calibrated.rationale).toContain('cost-calib ×0.50');
  });

  it('cold prior (null) and empty prior fail open to the catalog baseline', () => {
    const baseline = selectTierByExpectedCost(baseInput);
    const withNull = selectTierByExpectedCost({ ...baseInput, costCalibration: null });
    const withEmpty = selectTierByExpectedCost({
      ...baseInput,
      costCalibration: { byModel: new Map(), byTier: new Map() },
    });

    expect(withNull.tierHint).toBe(baseline.tierHint);
    expect(withNull.tierCosts).toEqual(baseline.tierCosts);
    expect(withEmpty.tierCosts).toEqual(baseline.tierCosts);
    for (const entry of withEmpty.tierCosts) {
      expect(entry.calibrationRatio).toBeUndefined();
    }
  });

  it('computeExpectedCost applies the prior on internal resolve, not on explicit cost', () => {
    const internal = computeExpectedCost('frontier-cloud', 1, null, 1_000_000, 0, {
      fleet: calibratedFleet,
      costCalibration: warmEconDouble,
    });
    // warmEconDouble only biases econ-cal; frontier resolve stays catalog 1.2.
    expect(internal.costPer1M).toBeCloseTo(1.2, 6);
    expect(internal.calibrationRatio).toBeUndefined();

    const explicit = computeExpectedCost('frontier-cloud', 1, null, 1_000_000, 0, {
      costPer1M: 2.4,
      calibrationRatio: 2.0,
    });
    expect(explicit.costPer1M).toBe(2.4);
    expect(explicit.calibrationRatio).toBe(2.0);
  });
});
