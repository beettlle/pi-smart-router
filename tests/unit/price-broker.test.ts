import { describe, expect, it } from 'vitest';

import {
  resolvePrice,
  resolveFleetPrices,
  resolveFrugalityCostPer1M,
  applyCatalogPricesToFleet,
  applyCatalogLimitsToFleet,
  resolveLimits,
} from '../../src/infrastructure/pricing/price-broker.js';
import { getDefaultLimitsForTier } from '../../src/config/pi-model-mapper.js';
import type { ModelProfile, PriceCatalog } from '../../src/domain/types/index.js';

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

function makeCatalog(overrides?: Partial<PriceCatalog>): PriceCatalog {
  return {
    registry_snapshot: {},
    user_overrides: {},
    last_updated: new Date().toISOString(),
    source: 'registry',
    ...overrides,
  };
}

// ─── resolvePrice ────────────────────────────────────────────────────────────

describe('resolvePrice (FR-019 tri-tier)', () => {
  it('returns operator override when present', () => {
    const model = makeModel({ id: 'gpt-4o', tier: 'frontier-cloud' });
    const catalog = makeCatalog({
      user_overrides: { 'gpt-4o': 5.0 },
      registry_snapshot: { 'gpt-4o': 3.0 },
    });

    const result = resolvePrice(model, catalog);
    expect(result.cost_per_1m_tokens).toBe(5.0);
    expect(result.source).toBe('override');
    expect(result.model_id).toBe('gpt-4o');
  });

  it('returns registry price when no override exists', () => {
    const model = makeModel({ id: 'claude-sonnet', tier: 'economical-cloud' });
    const catalog = makeCatalog({
      registry_snapshot: { 'claude-sonnet': 2.5 },
    });

    const result = resolvePrice(model, catalog);
    expect(result.cost_per_1m_tokens).toBe(2.5);
    expect(result.source).toBe('registry');
  });

  it('uses registry_key from model pricing when provided', () => {
    const model = makeModel({
      id: 'my-custom-alias',
      tier: 'economical-cloud',
      pricing: { registry_key: 'claude-3-haiku', fallback_cost_per_1m: 0.25 },
    });
    const catalog = makeCatalog({
      registry_snapshot: { 'claude-3-haiku': 0.5 },
    });

    const result = resolvePrice(model, catalog);
    expect(result.cost_per_1m_tokens).toBe(0.5);
    expect(result.source).toBe('registry');
  });

  it('falls back to model fallback_cost_per_1m when registry has no entry', () => {
    const model = makeModel({
      id: 'local-llama',
      tier: 'zero-tier',
      pricing: { fallback_cost_per_1m: 0.0 },
    });
    const catalog = makeCatalog();

    const result = resolvePrice(model, catalog);
    expect(result.cost_per_1m_tokens).toBe(0.0);
    expect(result.source).toBe('yaml_fallback');
  });

  it('falls back when catalog is null', () => {
    const model = makeModel({
      id: 'gpt-4o',
      tier: 'frontier-cloud',
      pricing: { fallback_cost_per_1m: 10.0 },
    });

    const result = resolvePrice(model, null);
    expect(result.cost_per_1m_tokens).toBe(10.0);
    expect(result.source).toBe('yaml_fallback');
  });

  it('override with value 0 is respected (free override)', () => {
    const model = makeModel({
      id: 'internal-model',
      tier: 'economical-cloud',
      pricing: { fallback_cost_per_1m: 5.0 },
    });
    const catalog = makeCatalog({
      user_overrides: { 'internal-model': 0 },
      registry_snapshot: { 'internal-model': 3.0 },
    });

    const result = resolvePrice(model, catalog);
    expect(result.cost_per_1m_tokens).toBe(0);
    expect(result.source).toBe('override');
  });

  it('registry price of 0 is respected', () => {
    const model = makeModel({
      id: 'free-model',
      tier: 'economical-cloud',
      pricing: { fallback_cost_per_1m: 1.0 },
    });
    const catalog = makeCatalog({
      registry_snapshot: { 'free-model': 0 },
    });

    const result = resolvePrice(model, catalog);
    expect(result.cost_per_1m_tokens).toBe(0);
    expect(result.source).toBe('registry');
  });

  it('override takes priority over registry even when registry is cheaper', () => {
    const model = makeModel({ id: 'model-x', tier: 'frontier-cloud' });
    const catalog = makeCatalog({
      user_overrides: { 'model-x': 20.0 },
      registry_snapshot: { 'model-x': 1.0 },
    });

    const result = resolvePrice(model, catalog);
    expect(result.cost_per_1m_tokens).toBe(20.0);
    expect(result.source).toBe('override');
  });
});

// ─── resolveFrugalityCostPer1M (SP-096) ──────────────────────────────────────

describe('resolveFrugalityCostPer1M', () => {
  it('prefers quota_cost_per_1m over zero API fallback for Cursor models', () => {
    const model = makeModel({
      id: 'composer-latest',
      tier: 'frontier-cloud',
      pricing: { fallback_cost_per_1m: 0.0, quota_cost_per_1m: 3.0 },
    });

    const result = resolveFrugalityCostPer1M(model, null);

    expect(result).toBe(3.0);
  });

  it('falls back to tri-tier resolvePrice when quota cost is absent', () => {
    const model = makeModel({
      id: 'gemini-flash',
      tier: 'economical-cloud',
      pricing: { fallback_cost_per_1m: 0.8 },
    });
    const catalog = makeCatalog({
      registry_snapshot: { 'gemini-flash': 0.5 },
    });

    const result = resolveFrugalityCostPer1M(model, catalog);

    expect(result).toBe(0.5);
  });
});

// ─── resolveFleetPrices ──────────────────────────────────────────────────────

describe('resolveFleetPrices', () => {
  it('resolves prices for entire fleet', () => {
    const fleet = [
      makeModel({ id: 'local', tier: 'zero-tier', pricing: { fallback_cost_per_1m: 0 } }),
      makeModel({ id: 'econ', tier: 'economical-cloud' }),
      makeModel({ id: 'frontier', tier: 'frontier-cloud' }),
    ];
    const catalog = makeCatalog({
      user_overrides: { frontier: 15.0 },
      registry_snapshot: { econ: 2.0 },
    });

    const prices = resolveFleetPrices(fleet, catalog);

    expect(prices.size).toBe(3);
    expect(prices.get('local')?.source).toBe('yaml_fallback');
    expect(prices.get('econ')?.source).toBe('registry');
    expect(prices.get('frontier')?.source).toBe('override');
  });

  it('handles empty fleet', () => {
    const prices = resolveFleetPrices([], makeCatalog());
    expect(prices.size).toBe(0);
  });

  it('handles null catalog for entire fleet', () => {
    const fleet = [
      makeModel({ id: 'a', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 3.0 } }),
      makeModel({ id: 'b', tier: 'frontier-cloud', pricing: { fallback_cost_per_1m: 10.0 } }),
    ];

    const prices = resolveFleetPrices(fleet, null);
    expect(prices.get('a')?.source).toBe('yaml_fallback');
    expect(prices.get('a')?.cost_per_1m_tokens).toBe(3.0);
    expect(prices.get('b')?.source).toBe('yaml_fallback');
    expect(prices.get('b')?.cost_per_1m_tokens).toBe(10.0);
  });

  it('returns a ReadonlyMap for immutability', () => {
    const fleet = [makeModel({ id: 'x', tier: 'economical-cloud' })];
    const prices = resolveFleetPrices(fleet, null);
    expect(prices).toBeInstanceOf(Map);
    expect(prices.get('x')).toBeDefined();
  });
});

describe('applyCatalogPricesToFleet', () => {
  it('updates fallback_cost_per_1m from registry snapshot', () => {
    const fleet = [
      makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', pricing: { fallback_cost_per_1m: 1.0 } }),
    ];
    const catalog = makeCatalog({
      registry_snapshot: { 'gpt-4o-mini': 0.375 },
    });

    const priced = applyCatalogPricesToFleet(fleet, catalog);

    expect(priced[0]?.pricing.fallback_cost_per_1m).toBe(0.375);
  });

  it('applies operator overrides over registry rates', () => {
    const fleet = [makeModel({ id: 'gpt-4o', tier: 'frontier-cloud' })];
    const catalog = makeCatalog({
      user_overrides: { 'gpt-4o': 99.0 },
      registry_snapshot: { 'gpt-4o': 10.0 },
    });

    const priced = applyCatalogPricesToFleet(fleet, catalog);

    expect(priced[0]?.pricing.fallback_cost_per_1m).toBe(99.0);
  });

  it('returns fleet with tier defaults when catalog is null', () => {
    const fleet = [makeModel({ id: 'a', tier: 'economical-cloud' })];
    const priced = applyCatalogPricesToFleet(fleet, null);

    expect(priced[0]?.limits).toEqual(getDefaultLimitsForTier('economical-cloud'));
    expect(priced).not.toBe(fleet);
  });

  it('keeps yaml fallback when registry has no matching entry', () => {
    const fleet = [
      makeModel({
        id: 'custom',
        tier: 'economical-cloud',
        pricing: { registry_key: 'missing/key', fallback_cost_per_1m: 2.5 },
      }),
    ];
    const catalog = makeCatalog({ registry_snapshot: { other: 1.0 } });

    const priced = applyCatalogPricesToFleet(fleet, catalog);

    expect(priced[0]?.pricing.fallback_cost_per_1m).toBe(2.5);
  });
});

describe('resolveLimits (SP-092)', () => {
  it('uses YAML profile limits over registry and tier defaults', () => {
    const model = makeModel({
      id: 'claude-3.5-haiku',
      tier: 'economical-cloud',
      limits: { max_input_tokens: 300_000, max_output_tokens: 12_000 },
      pricing: { registry_key: 'anthropic/claude-3-5-haiku', fallback_cost_per_1m: 0.8 },
    });
    const catalog = makeCatalog({
      registry_limits_snapshot: {
        'anthropic/claude-3-5-haiku': { max_input_tokens: 200_000, max_output_tokens: 8_192 },
      },
    });

    const resolved = resolveLimits(model, catalog);

    expect(resolved.limits.max_input_tokens).toBe(300_000);
    expect(resolved.limits.max_output_tokens).toBe(12_000);
  });

  it('uses registry limits when YAML override is absent', () => {
    const model = makeModel({
      id: 'gpt-4o-mini',
      tier: 'economical-cloud',
      pricing: { registry_key: 'openai/gpt-4o-mini', fallback_cost_per_1m: 0.375 },
    });
    const catalog = makeCatalog({
      registry_limits_snapshot: {
        'openai/gpt-4o-mini': { max_input_tokens: 128_000, max_output_tokens: 16_384 },
      },
    });

    const resolved = resolveLimits(model, catalog);

    expect(resolved.limits.max_input_tokens).toBe(128_000);
    expect(resolved.limits.max_output_tokens).toBe(16_384);
  });

  it('falls back to tier defaults when registry has no entry', () => {
    const model = makeModel({ id: 'unknown-model', tier: 'frontier-cloud' });

    const resolved = resolveLimits(model, makeCatalog());

    expect(resolved.limits).toEqual(getDefaultLimitsForTier('frontier-cloud'));
  });

  it('merges field-level precedence for partial YAML overrides', () => {
    const model = makeModel({
      id: 'gpt-4o-mini',
      tier: 'economical-cloud',
      limits: { max_input_tokens: 256_000 },
      pricing: { registry_key: 'openai/gpt-4o-mini', fallback_cost_per_1m: 0.375 },
    });
    const catalog = makeCatalog({
      registry_limits_snapshot: {
        'openai/gpt-4o-mini': { max_input_tokens: 128_000, max_output_tokens: 16_384 },
      },
    });

    const resolved = resolveLimits(model, catalog);

    expect(resolved.limits.max_input_tokens).toBe(256_000);
    expect(resolved.limits.max_output_tokens).toBe(16_384);
  });
});

describe('applyCatalogLimitsToFleet (SP-092)', () => {
  it('writes resolved limits onto fleet profiles', () => {
    const fleet = [
      makeModel({
        id: 'gpt-4o-mini',
        tier: 'economical-cloud',
        pricing: { registry_key: 'openai/gpt-4o-mini', fallback_cost_per_1m: 0.375 },
      }),
    ];
    const catalog = makeCatalog({
      registry_limits_snapshot: {
        'openai/gpt-4o-mini': { max_input_tokens: 128_000, max_output_tokens: 16_384 },
      },
    });

    const limited = applyCatalogLimitsToFleet(fleet, catalog);

    expect(limited[0]?.limits?.max_input_tokens).toBe(128_000);
    expect(limited[0]?.limits?.max_output_tokens).toBe(16_384);
  });
});
