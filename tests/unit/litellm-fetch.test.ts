import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LITELLM_PRICING_URL,
  LitellmFetchError,
  computeCostPer1MTokens,
  fetchLitellmPriceCatalog,
  getLitellmPricingUrl,
  normalizeLitellmPricing,
} from '../../src/infrastructure/pricing/litellm-fetch.js';

describe('getLitellmPricingUrl', () => {
  it('returns env override when set', () => {
    expect(getLitellmPricingUrl({ LITELLM_PRICING_URL: 'https://example.com/prices.json' }))
      .toBe('https://example.com/prices.json');
  });

  it('returns LiteLLM GitHub default when env is unset', () => {
    expect(getLitellmPricingUrl({})).toBe(DEFAULT_LITELLM_PRICING_URL);
  });
});

describe('computeCostPer1MTokens', () => {
  it('blends input and output per-token rates into USD per 1M tokens', () => {
    expect(computeCostPer1MTokens(1.5e-7, 6e-7)).toBeCloseTo(0.375, 5);
  });
});

describe('normalizeLitellmPricing', () => {
  it('normalizes chat models and provider aliases', () => {
    const result = normalizeLitellmPricing({
      sample_spec: { mode: 'chat' },
      'gpt-4o-mini': {
        mode: 'chat',
        input_cost_per_token: 1.5e-7,
        output_cost_per_token: 6e-7,
        litellm_provider: 'openai',
        max_input_tokens: 128_000,
        max_output_tokens: 16_384,
      },
      'image-model': {
        mode: 'image_generation',
        input_cost_per_token: 1e-6,
        output_cost_per_token: 2e-6,
      },
    });

    expect(result.model_count).toBe(1);
    expect(result.registry_snapshot['gpt-4o-mini']).toBeCloseTo(0.375, 5);
    expect(result.registry_snapshot['openai/gpt-4o-mini']).toBeCloseTo(0.375, 5);
    expect(result.registry_snapshot['image-model']).toBeUndefined();
    expect(result.registry_limits_snapshot['gpt-4o-mini']).toEqual({
      max_input_tokens: 128_000,
      max_output_tokens: 16_384,
    });
    expect(result.registry_limits_snapshot['openai/gpt-4o-mini']).toEqual({
      max_input_tokens: 128_000,
      max_output_tokens: 16_384,
    });
  });

  it('falls back max_tokens to max_output_tokens when max_output_tokens is absent', () => {
    const result = normalizeLitellmPricing({
      'legacy-complete': {
        mode: 'completion',
        input_cost_per_token: 1e-6,
        output_cost_per_token: 2e-6,
        max_input_tokens: 8_192,
        max_tokens: 2_048,
      },
    });

    expect(result.registry_limits_snapshot['legacy-complete']).toEqual({
      max_input_tokens: 8_192,
      max_output_tokens: 2_048,
    });
  });

  it('skips models without token costs even when limits are present', () => {
    const result = normalizeLitellmPricing({
      'gpt-4o-mini': {
        mode: 'chat',
        input_cost_per_token: 1.5e-7,
        output_cost_per_token: 6e-7,
      },
      'limits-only': {
        mode: 'chat',
        max_input_tokens: 32_000,
      },
    });

    expect(result.model_count).toBe(1);
    expect(result.registry_limits_snapshot['limits-only']).toBeUndefined();
  });

  it('includes completion-mode models', () => {
    const result = normalizeLitellmPricing({
      'legacy-complete': {
        mode: 'completion',
        input_cost_per_token: 1e-6,
        output_cost_per_token: 2e-6,
      },
    });

    expect(result.model_count).toBe(1);
    expect(result.registry_snapshot['legacy-complete']).toBe(1.5);
  });

  it('throws on non-object payload', () => {
    expect(() => normalizeLitellmPricing([])).toThrow(LitellmFetchError);
    expect(() => normalizeLitellmPricing([])).toThrow('JSON object');
  });

  it('throws on malformed model entry', () => {
    expect(() =>
      normalizeLitellmPricing({
        broken: 'not-an-object',
      }),
    ).toThrow('broken');
  });

  it('throws when no chat models with token costs exist', () => {
    expect(() =>
      normalizeLitellmPricing({
        sample_spec: {},
        'only-image': {
          mode: 'image_generation',
          output_cost_per_image: 0.04,
        },
      }),
    ).toThrow('no chat models');
  });
});

describe('fetchLitellmPriceCatalog', () => {
  it('fetches and builds a PriceCatalog with registry source', async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        'gpt-4o': {
          mode: 'chat',
          input_cost_per_token: 2.5e-6,
          output_cost_per_token: 1e-5,
          max_input_tokens: 128_000,
          max_output_tokens: 16_384,
        },
      }),
    );

    const { catalog, model_count } = await fetchLitellmPriceCatalog({
      fetchFn,
      pricingUrl: 'https://example.com/prices.json',
    });

    expect(fetchFn).toHaveBeenCalledWith('https://example.com/prices.json');
    expect(catalog.source).toBe('registry');
    expect(catalog.user_overrides).toEqual({});
    expect(catalog.registry_snapshot['gpt-4o']).toBeCloseTo(6.25, 5);
    expect(catalog.registry_limits_snapshot?.['gpt-4o']).toEqual({
      max_input_tokens: 128_000,
      max_output_tokens: 16_384,
    });
    expect(catalog.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(model_count).toBe(1);
  });

  it('surfaces HTTP failures', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 503, statusText: 'Unavailable' }));

    await expect(fetchLitellmPriceCatalog({ fetchFn, pricingUrl: 'https://example.com/prices.json' }))
      .rejects.toThrow('503');
  });

  it('surfaces network failures', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(fetchLitellmPriceCatalog({ fetchFn, pricingUrl: 'https://example.com/prices.json' }))
      .rejects.toThrow('network down');
  });

  it('surfaces invalid JSON responses', async () => {
    const fetchFn = vi.fn(async () => new Response('not-json', { status: 200 }));

    await expect(fetchLitellmPriceCatalog({ fetchFn, pricingUrl: 'https://example.com/prices.json' }))
      .rejects.toThrow('not valid JSON');
  });
});
