import { describe, expect, it } from 'vitest';

import {
  resolvePrice,
  resolveFleetPrices,
} from '../../src/infrastructure/pricing/price-broker.js';
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
