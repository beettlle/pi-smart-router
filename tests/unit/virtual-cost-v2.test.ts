import { describe, expect, it } from 'vitest';

import {
  computeKvCacheSavings,
  computeQuotaArbitragePremium,
  computeQuotaDecayLambda,
  computeVirtualCostV2,
  computeExhaustionRiskPremium,
  deriveRemainingWindowFraction,
} from '../../src/domain/pricing/virtual-cost-v2.js';
import { evaluateModelSwitchBreakeven } from '../../src/domain/pinning/session-pinner.js';
import {
  DEFAULT_SAAR_CONFIG,
  DEFAULT_VIRTUAL_COST_V2_CONFIG,
} from '../../src/domain/types/schemas.js';
import type { ModelProfile } from '../../src/domain/types/index.js';

const BASE_COST_PER_1M = 3.0;
const ONE_M_TOKENS = 1_000_000;
const WARM_100K_PREFIX = 100_000;

describe('computeQuotaDecayLambda', () => {
  it('returns λ = 1 at window start (full remaining budget)', () => {
    expect(computeQuotaDecayLambda(1)).toBe(1);
    expect(computeQuotaDecayLambda(1.5)).toBe(1);
  });

  it('increases λ as remaining window shrinks toward exhaustion', () => {
    const nearStart = computeQuotaDecayLambda(0.9);
    const midWindow = computeQuotaDecayLambda(0.5);
    const nearExhaustion = computeQuotaDecayLambda(0.05);
    const exhausted = computeQuotaDecayLambda(0);

    expect(nearStart).toBeCloseTo(1.02, 2);
    expect(midWindow).toBeGreaterThan(nearStart);
    expect(nearExhaustion).toBeGreaterThan(midWindow);
    expect(exhausted).toBe(DEFAULT_VIRTUAL_COST_V2_CONFIG.lambda_max_multiplier);
  });
});

describe('computeQuotaArbitragePremium', () => {
  it('is zero at window start and rises near exhaustion', () => {
    const baseUsd = 3.0;

    expect(computeQuotaArbitragePremium(baseUsd, 1)).toBe(0);
    expect(computeQuotaArbitragePremium(baseUsd, 0.95)).toBeCloseTo(0.075, 3);
    expect(computeQuotaArbitragePremium(baseUsd, 0.1)).toBeCloseTo(1.35, 3);
  });
});

describe('computeExhaustionRiskPremium', () => {
  it('is zero above threshold and rises below it', () => {
    const baseUsd = 3.0;
    const threshold = DEFAULT_VIRTUAL_COST_V2_CONFIG.exhaustion_risk_threshold;

    expect(computeExhaustionRiskPremium(baseUsd, threshold)).toBe(0);
    expect(computeExhaustionRiskPremium(baseUsd, threshold + 0.05)).toBe(0);

    const below = computeExhaustionRiskPremium(baseUsd, 0.05);
    expect(below).toBeGreaterThan(0);
  });
});

describe('computeKvCacheSavings', () => {
  it('returns zero when pin is inactive or prefix is cold', () => {
    expect(computeKvCacheSavings(WARM_100K_PREFIX, BASE_COST_PER_1M, false)).toBe(0);
    expect(computeKvCacheSavings(0, BASE_COST_PER_1M, true)).toBe(0);
  });

  it('credits negative savings when pin is active with warm prefix', () => {
    const savings = computeKvCacheSavings(WARM_100K_PREFIX, BASE_COST_PER_1M, true);

    // 100k @ $3/1M = $0.30 prefix; 90% discount × 0.20 weight = $0.054 credit
    expect(savings).toBeLessThan(0);
    expect(savings).toBeCloseTo(-0.054, 6);
  });
});

describe('computeVirtualCostV2', () => {
  it('matches flat SP-096 cost at window start without pin credit', () => {
    const result = computeVirtualCostV2({
      base_cost_per_1m: BASE_COST_PER_1M,
      est_tokens: ONE_M_TOKENS,
      window_position: { remaining_window_fraction: 1 },
    });

    expect(result.quota_decay_lambda).toBe(1);
    expect(result.quota_arbitrage_premium).toBe(0);
    expect(result.exhaustion_risk_premium).toBe(0);
    expect(result.kv_cache_savings).toBe(0);
    expect(result.effective_cost_usd).toBe(3);
    expect(result.effective_cost_per_1m).toBe(3);
  });

  it('raises effective cost near window exhaustion', () => {
    const atStart = computeVirtualCostV2({
      base_cost_per_1m: BASE_COST_PER_1M,
      est_tokens: ONE_M_TOKENS,
      window_position: { remaining_window_fraction: 0.95 },
    });
    const nearExhaustion = computeVirtualCostV2({
      base_cost_per_1m: BASE_COST_PER_1M,
      est_tokens: ONE_M_TOKENS,
      window_position: { remaining_window_fraction: 0.05 },
    });

    expect(nearExhaustion.effective_cost_usd).toBeGreaterThan(atStart.effective_cost_usd);
    expect(nearExhaustion.quota_decay_lambda).toBeGreaterThan(atStart.quota_decay_lambda);
    expect(nearExhaustion.quota_arbitrage_premium).toBeGreaterThan(
      atStart.quota_arbitrage_premium,
    );
    expect(nearExhaustion.exhaustion_risk_premium).toBeGreaterThan(0);
  });

  it('reduces effective cost when pin is active with warm prefix', () => {
    const withoutPin = computeVirtualCostV2({
      base_cost_per_1m: BASE_COST_PER_1M,
      est_tokens: ONE_M_TOKENS,
      window_position: { remaining_window_fraction: 0.8 },
    });
    const withPin = computeVirtualCostV2({
      base_cost_per_1m: BASE_COST_PER_1M,
      est_tokens: ONE_M_TOKENS,
      window_position: { remaining_window_fraction: 0.8 },
      pin_active: true,
      warm_prefix_tokens: WARM_100K_PREFIX,
    });

    expect(withPin.kv_cache_savings).toBeLessThan(0);
    expect(withPin.effective_cost_usd).toBeLessThan(withoutPin.effective_cost_usd);
    expect(withPin.effective_cost_per_1m).toBeLessThan(withoutPin.effective_cost_per_1m);
  });
});

describe('deriveRemainingWindowFraction', () => {
  it('uses the tighter of time-elapsed and quota-consumed remaining fractions', () => {
    const duration = DEFAULT_VIRTUAL_COST_V2_CONFIG.window_duration_seconds;

    expect(deriveRemainingWindowFraction(0, 0)).toBe(1);
    expect(deriveRemainingWindowFraction(duration, 0)).toBe(0);
    expect(deriveRemainingWindowFraction(0, 1)).toBe(0);
    expect(deriveRemainingWindowFraction(duration * 0.5, 0.25)).toBeCloseTo(0.5, 6);
    expect(deriveRemainingWindowFraction(duration * 0.1, 0.9)).toBeCloseTo(0.1, 6);
  });
});

describe('virtual cost v2 regression (SP-150)', () => {
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

  it('regression: cache credit preserves pin when savings do not exceed reprime', () => {
    const pinned = makeModel({
      id: 'composer-latest',
      tier: 'frontier-cloud',
      provider: 'cursor',
      pricing: { fallback_cost_per_1m: 0, quota_cost_per_1m: 4.0 },
    });
    const candidate = makeModel({
      id: 'openai-econ',
      tier: 'economical-cloud',
      provider: 'openai',
      pricing: { fallback_cost_per_1m: 3.2 },
    });
    const warmTokens = 100_000;
    const breakevenContext = {
      quotaWindowPosition: { remaining_window_fraction: 0.8 },
      virtualCostV2Config: DEFAULT_VIRTUAL_COST_V2_CONFIG,
    };

    const coldSession = evaluateModelSwitchBreakeven(
      pinned,
      candidate,
      warmTokens,
      0,
      DEFAULT_SAAR_CONFIG,
      breakevenContext,
    );
    const warmPin = evaluateModelSwitchBreakeven(
      pinned,
      candidate,
      warmTokens,
      warmTokens,
      DEFAULT_SAAR_CONFIG,
      breakevenContext,
    );

    expect(coldSession.shouldSwitch).toBe(true);
    expect(warmPin.shouldSwitch).toBe(false);
    expect(warmPin.kv_cache_credit_usd).toBeGreaterThan(0);
    expect(warmPin.reason).toBe('breakeven_not_met');
  });
});
