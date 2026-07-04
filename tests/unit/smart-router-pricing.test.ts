import { describe, expect, it, vi } from 'vitest';

import {
  discoverFleet,
  formatPricingStalenessLine,
  formatStatusMessage,
  getRouterStateDbPath,
  getSmartRouterArgumentCompletions,
  parseSmartRouterArgs,
  refreshPricingCatalog,
} from '../../.pi/extensions/smart-router/index.js';
import { SMART_ROUTER_FULL_INVOCATIONS } from '../../.pi/extensions/smart-router/commands.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import type { ModelProfile, PriceCatalog } from '../../src/domain/types/index.js';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai/compat';

function makeProfile(id: string): ModelProfile {
  return {
    id,
    provider: 'openai',
    tier: 'economical-cloud',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
  };
}

function makeRegistryModel(id: string, cost?: Model<Api>['cost']): Model<Api> {
  return {
    name: id,
    api: 'openai-responses',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4096,
    provider: 'openai',
    id,
  };
}

function createMockRegistry(models: Model<Api>[]): ModelRegistry {
  return {
    find(provider: string, modelId: string) {
      return models.find((model) => model.provider === provider && model.id === modelId);
    },
    getAvailable() {
      return models;
    },
  } as ModelRegistry;
}

describe('parseSmartRouterArgs (SP-045)', () => {
  it('parses pricing refresh subcommand', () => {
    expect(parseSmartRouterArgs('pricing refresh')).toEqual({
      command: 'pricing',
      subcommand: 'refresh',
    });
  });

  it('rejects unknown pricing subcommands', () => {
    expect(() => parseSmartRouterArgs('pricing stale')).toThrow('Usage:');
  });
});

describe('getSmartRouterArgumentCompletions', () => {
  function completionValues(prefix: string): string[] {
    const items = getSmartRouterArgumentCompletions(prefix);
    return items?.map((item) => item.value) ?? [];
  }

  it('offers top-level subcommands on empty prefix', () => {
    expect(completionValues('')).toEqual(['status', 'mode', 'pricing']);
  });

  it('filters top-level subcommands by partial prefix', () => {
    expect(completionValues('st')).toEqual(['status']);
    expect(completionValues('pr')).toEqual(['pricing']);
  });

  it('offers mode subcommands after mode token', () => {
    expect(completionValues('mode')).toEqual(['mode scoped', 'mode all']);
    expect(completionValues('mode s')).toEqual(['mode scoped']);
  });

  it('offers pricing refresh after pricing token', () => {
    expect(completionValues('pricing')).toEqual(['pricing refresh']);
    expect(completionValues('pricing r')).toEqual(['pricing refresh']);
  });

  it('keeps full invocations parseable', () => {
    for (const invocation of SMART_ROUTER_FULL_INVOCATIONS) {
      expect(() => parseSmartRouterArgs(invocation)).not.toThrow();
    }
  });
});

describe('formatPricingStalenessLine (SP-045)', () => {
  it('warns when catalog is missing', () => {
    expect(formatPricingStalenessLine(null)).toContain('No pricing catalog loaded');
  });

  it('warns when catalog is older than threshold', () => {
    const catalog: PriceCatalog = {
      registry_snapshot: {},
      user_overrides: {},
      last_updated: '2026-01-01T00:00:00.000Z',
      source: 'registry',
    };

    expect(formatPricingStalenessLine(catalog)).toContain('days old');
  });
});

describe('discoverFleet pricing integration (SP-045)', () => {
  it('applies catalog prices to mapped fleet profiles', async () => {
    const store = new MemoryStore([]);
    await store.putPriceCatalog({
      registry_snapshot: { 'openai/gpt-4o-mini': 0.375 },
      user_overrides: {},
      last_updated: new Date().toISOString(),
      source: 'registry',
    });

    const registry = createMockRegistry([makeRegistryModel('gpt-4o-mini')]);
    const { fleet, catalog } = await discoverFleet(registry, 'all', '/tmp', store);

    expect(catalog).not.toBeNull();
    expect(fleet).toHaveLength(1);
    expect(fleet[0]?.pricing.fallback_cost_per_1m).toBe(0.375);
  });
});

describe('discoverFleet registry cost pass-through (SP-046)', () => {
  const registryCost = {
    input: 1.5e-7,
    output: 6e-7,
    cacheRead: 0,
    cacheWrite: 0,
  };

  it('maps registry Model.cost into fleet profiles in all mode', async () => {
    const store = new MemoryStore([]);
    const registry = createMockRegistry([
      makeRegistryModel('gpt-4o-mini', registryCost),
    ]);

    const { fleet } = await discoverFleet(registry, 'all', '/tmp', store);

    expect(fleet).toHaveLength(1);
    expect(fleet[0]?.pricing.fallback_cost_per_1m).toBeCloseTo(0.375, 5);
  });

  it('maps registry Model.cost into fleet profiles in scoped mode', async () => {
    const store = new MemoryStore([]);
    const registry = createMockRegistry([
      makeRegistryModel('gpt-4o-mini', registryCost),
    ]);

    const { fleet } = await discoverFleet(registry, 'scoped', '/tmp', store);

    expect(fleet).toHaveLength(1);
    expect(fleet[0]?.pricing.fallback_cost_per_1m).toBeCloseTo(0.375, 5);
  });
});

describe('refreshPricingCatalog (SP-045)', () => {
  it('persists fetched catalog while preserving user overrides', async () => {
    const store = new MemoryStore([]);
    await store.putPriceCatalog({
      registry_snapshot: { old: 1.0 },
      user_overrides: { 'gpt-4o': 42.0 },
      last_updated: '2026-01-01T00:00:00.000Z',
      source: 'registry',
    });

    const fetchFn = vi.fn(async () =>
      Response.json({
        'gpt-4o-mini': {
          mode: 'chat',
          input_cost_per_token: 1.5e-7,
          output_cost_per_token: 6e-7,
        },
      }),
    );

    const runtime = {
      store,
      priceCatalog: null,
    };

    const result = await refreshPricingCatalog(
      runtime as unknown as Parameters<typeof refreshPricingCatalog>[0],
      fetchFn,
    );
    const saved = await store.getPriceCatalog();

    expect(result.modelCount).toBe(1);
    expect(saved?.user_overrides).toEqual({ 'gpt-4o': 42.0 });
    expect(saved?.registry_snapshot['gpt-4o-mini']).toBeCloseTo(0.375, 5);
    expect(saved?.last_updated).toBe(result.lastUpdated);
  });
});

describe('formatStatusMessage pricing (SP-045)', () => {
  it('includes staleness warning in status output', () => {
    const runtime = {
      fleetMode: 'scoped' as const,
      priceCatalog: null,
      streamDeps: { fleet: [makeProfile('gpt-4o-mini')] },
    };

    const message = formatStatusMessage(runtime as never, undefined);

    expect(message).toContain('Pricing:');
    expect(message).toContain('No pricing catalog loaded');
  });
});

describe('getRouterStateDbPath (SP-045)', () => {
  it('defaults to cwd-relative sqlite path', () => {
    expect(getRouterStateDbPath('/workspace/project')).toBe(
      '/workspace/project/.pi-smart-router/state.db',
    );
  });
});
