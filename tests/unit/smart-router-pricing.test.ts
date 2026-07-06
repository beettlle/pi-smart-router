import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  discoverFleet,
  exportDatasetToFile,
  formatDatasetExportJsonl,
  formatHistoryMessage,
  formatPricingStalenessLine,
  formatStatusMessage,
  getRouterStateDbPath,
  getSmartRouterArgumentCompletions,
  parseSmartRouterArgs,
  refreshPricingCatalog,
  toDatasetExportRecord,
} from '../../.pi/extensions/smart-router/index.js';
import { SMART_ROUTER_FULL_INVOCATIONS } from '../../.pi/extensions/smart-router/commands.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import type { ModelProfile, PriceCatalog, RoutingDatasetRecord } from '../../src/domain/types/index.js';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai/compat';

function makeDatasetRecord(overrides: Partial<RoutingDatasetRecord> = {}): RoutingDatasetRecord {
  return {
    request_id: 'req-export-1',
    timestamp: '2026-07-05T12:00:00.000Z',
    turn_type: 'main_loop',
    stage: 'hydra_match',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    candidates_json: null,
    prompt_length_chars: 42,
    estimated_input_tokens: 10,
    message_count: 2,
    has_tool_context: false,
    compaction_flag: false,
    triage_verdict: 'ambiguous',
    triage_reason_code: 'mixed_signals',
    triage_cyclomatic_score: 1,
    triage_trivial_hits: 0,
    triage_complex_hits: 1,
    triage_sanitized_length_delta: 0,
    requirement_reasoning: 0.5,
    requirement_code_gen: 0.5,
    requirement_tool_use: 0.5,
    routing_latency_ms: 12,
    estimated_cost_usd: 0.001,
    prompt_fingerprint: null,
    ...overrides,
  };
}

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

  it('parses history with default and explicit limits', () => {
    expect(parseSmartRouterArgs('history')).toEqual({ command: 'history', limit: 10 });
    expect(parseSmartRouterArgs('history 25')).toEqual({ command: 'history', limit: 25 });
  });

  it('rejects invalid history limits', () => {
    expect(() => parseSmartRouterArgs('history 0')).toThrow('Usage:');
    expect(() => parseSmartRouterArgs('history abc')).toThrow('Usage:');
  });

  it('parses export dataset with default and explicit limits', () => {
    expect(parseSmartRouterArgs('export dataset')).toEqual({
      command: 'export',
      subcommand: 'dataset',
      limit: 10_000,
    });
    expect(parseSmartRouterArgs('export dataset --limit 25')).toEqual({
      command: 'export',
      subcommand: 'dataset',
      limit: 25,
    });
    expect(parseSmartRouterArgs('export dataset --limit=50')).toEqual({
      command: 'export',
      subcommand: 'dataset',
      limit: 50,
    });
    expect(parseSmartRouterArgs('feedback good')).toEqual({
      command: 'feedback',
      rating: 'good',
    });
    expect(parseSmartRouterArgs('feedback bad')).toEqual({
      command: 'feedback',
      rating: 'bad',
    });
    expect(parseSmartRouterArgs('unpin')).toEqual({ command: 'unpin' });
  });

  it('rejects invalid export dataset invocations', () => {
    expect(() => parseSmartRouterArgs('export')).toThrow('Usage:');
    expect(() => parseSmartRouterArgs('export telemetry')).toThrow('Usage:');
    expect(() => parseSmartRouterArgs('export dataset --limit')).toThrow('Usage:');
    expect(() => parseSmartRouterArgs('export dataset --limit 0')).toThrow('Usage:');
    expect(() => parseSmartRouterArgs('export dataset --limit abc')).toThrow('Usage:');
  });
});

describe('getSmartRouterArgumentCompletions', () => {
  function completionValues(prefix: string): string[] {
    const items = getSmartRouterArgumentCompletions(prefix);
    return items?.map((item) => item.value) ?? [];
  }

  it('offers top-level subcommands on empty prefix', () => {
    expect(completionValues('')).toEqual(['status', 'history', 'mode', 'pricing', 'export', 'feedback', 'unpin']);
  });

  it('filters top-level subcommands by partial prefix', () => {
    expect(completionValues('st')).toEqual(['status']);
    expect(completionValues('hi')).toEqual(['history']);
    expect(completionValues('pr')).toEqual(['pricing']);
    expect(completionValues('ex')).toEqual(['export']);
    expect(completionValues('un')).toEqual(['unpin']);
  });

  it('offers mode subcommands after mode token', () => {
    expect(completionValues('mode')).toEqual(['mode scoped', 'mode all']);
    expect(completionValues('mode s')).toEqual(['mode scoped']);
  });

  it('offers pricing refresh after pricing token', () => {
    expect(completionValues('pricing')).toEqual(['pricing refresh']);
    expect(completionValues('pricing r')).toEqual(['pricing refresh']);
  });

  it('offers history completion after history token', () => {
    expect(completionValues('history')).toEqual(['history']);
  });

  it('offers export dataset after export token', () => {
    expect(completionValues('export')).toEqual(['export dataset']);
    expect(completionValues('export d')).toEqual(['export dataset']);
  });

  it('keeps full invocations parseable', () => {
    for (const invocation of SMART_ROUTER_FULL_INVOCATIONS) {
      expect(() => parseSmartRouterArgs(invocation)).not.toThrow();
    }
  });
});

describe('dataset export (SP-060)', () => {
  it('exports Tier 1 fields only and hashes session_id when present', () => {
    const record = makeDatasetRecord();
    const withSession = {
      ...record,
      session_id: 'sess-secret',
      prompt_text: 'do not export',
      messages: [{ role: 'user', content: 'nope' }],
      pepper: 'never-export-install-pepper',
      dataset_key: 'never-export-key',
    } as RoutingDatasetRecord & {
      session_id: string;
      prompt_text: string;
      messages: unknown[];
      pepper: string;
      dataset_key: string;
    };

    const exported = toDatasetExportRecord(withSession);

    expect(exported).not.toHaveProperty('session_id');
    expect(exported).not.toHaveProperty('prompt_text');
    expect(exported).not.toHaveProperty('messages');
    expect(exported).not.toHaveProperty('pepper');
    expect(exported).not.toHaveProperty('dataset_key');
    expect(exported.session_id_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.request_id).toBe('req-export-1');
    expect(exported.prompt_length_chars).toBe(42);
  });

  it('exports prompt_fingerprint when present', () => {
    const fingerprint = 'c'.repeat(64);
    const exported = toDatasetExportRecord(
      makeDatasetRecord({ prompt_fingerprint: fingerprint }),
    );

    expect(exported.prompt_fingerprint).toBe(fingerprint);
  });

  it('formats JSONL with one object per line', () => {
    const jsonl = formatDatasetExportJsonl([
      makeDatasetRecord({ request_id: 'req-a' }),
      makeDatasetRecord({ request_id: 'req-b' }),
    ]);

    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ request_id: 'req-a' });
    expect(JSON.parse(lines[1]!)).toMatchObject({ request_id: 'req-b' });
    expect(jsonl).not.toContain('prompt_text');
  });

  it('writes export file under .pi-smart-router/exports', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'smart-router-export-'));
    try {
      const store = new MemoryStore([]);
      store.appendDatasetRecord(makeDatasetRecord({ request_id: 'req-file' }));

      const result = await exportDatasetToFile(store, cwd, 10);

      expect(result).not.toBeNull();
      expect(result?.recordCount).toBe(1);
      expect(result?.path).toContain(join(cwd, '.pi-smart-router/exports/dataset-'));
      expect(result?.path.endsWith('.jsonl')).toBe(true);

      const written = readFileSync(result!.path, 'utf8').trim();
      const parsed = JSON.parse(written);
      expect(parsed.request_id).toBe('req-file');
      expect(written).not.toContain('prompt_text');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns null for empty dataset without writing a file', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'smart-router-export-empty-'));
    try {
      const store = new MemoryStore([]);
      const result = await exportDatasetToFile(store, cwd, 10);
      expect(result).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
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

    const { fleet } = await discoverFleet(registry, 'scoped', '/tmp', store, {
      settingsFactory: () => ({
        getEnabledModels: () => ['openai/gpt-4o-mini'],
      }),
    });

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

describe('formatHistoryMessage', () => {
  it('formats empty history', () => {
    expect(formatHistoryMessage([])).toBe('No routing history yet.');
  });

  it('formats telemetry rows', () => {
    const message = formatHistoryMessage([
      {
        timestamp: '2026-07-04T12:00:00.000Z',
        session_id: 'sess-1',
        request_id: 'req-2',
        turn_type: 'main_loop',
        stage: 'hydra_match',
        reason_code: 'hydra_embedding_match',
        selected_model_id: 'gemini-flash-latest',
        estimated_cost_usd: 0,
        routing_latency_ms: 4,
        pin_reason: null,
      },
    ]);

    expect(message).toContain('gemini-flash-latest');
    expect(message).toContain('hydra_match');
    expect(message).toContain('4ms');
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
