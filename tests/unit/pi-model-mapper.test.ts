import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_BENCHMARK_PROFILES_PATH,
  DEFAULT_CURSOR_QUOTA_COST_PER_1M,
  mapFleetFromRegistry,
  mapPiModelToProfile,
  resetBenchmarkProfilesCacheForTests,
  setBenchmarkProfilesPathForTests,
  type PiModelInput,
} from '../../src/config/pi-model-mapper.js';
import { ingestBenchmarkProfilesFromDir, serializeBenchmarkProfilesArtifact } from '../../scripts/ingest-benchmark-profiles.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeInput(overrides: PiModelInput): PiModelInput {
  return overrides;
}

afterEach(() => {
  resetBenchmarkProfilesCacheForTests();
});

describe('mapPiModelToProfile', () => {
  describe('Claude family', () => {
    it('maps claude-opus to frontier tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'anthropic', id: 'claude-opus-4' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.reasoning).toBeGreaterThanOrEqual(0.9);
      expect(profile.pricing.fallback_cost_per_1m).toBe(3.0);
    });

    it('maps claude-sonnet to frontier tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'anthropic', id: 'claude-3.5-sonnet' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.code_gen).toBe(0.95);
    });

    it('maps claude-haiku to economical tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'anthropic', id: 'claude-3.5-haiku' }),
      );

      expect(profile.tier).toBe('economical-cloud');
      expect(profile.capabilities.reasoning).toBeCloseTo(0.5685, 4);
      expect(profile.capabilities.code_gen).toBeCloseTo(0.587, 4);
      expect(profile.capabilities.tool_use).toBeCloseTo(0.6095, 4);
      expect(profile.pricing.fallback_cost_per_1m).toBe(0.8);
    });
  });

  describe('GPT family', () => {
    it('maps gpt-5.5 to frontier tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'openai', id: 'gpt-5.5' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.tool_use).toBe(0.95);
    });

    it('maps gpt-5.1 to economical tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'openai', id: 'gpt-5.1' }),
      );

      expect(profile.tier).toBe('economical-cloud');
    });

    it('maps gpt-5-mini to economical tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'openai', id: 'gpt-5-mini' }),
      );

      expect(profile.tier).toBe('economical-cloud');
      expect(profile.pricing.fallback_cost_per_1m).toBe(0.8);
    });
  });

  describe('Gemini family', () => {
    it('maps gemini-2.5-pro to frontier tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'google', id: 'gemini-2.5-pro' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
    });

    it('maps gemini-flash to economical tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'google', id: 'gemini-2.5-flash' }),
      );

      expect(profile.tier).toBe('economical-cloud');
      expect(profile.capabilities.code_gen).toBeCloseTo(0.5525, 4);
      expect(profile.capabilities.reasoning).toBeLessThan(0.7);
    });

    it('maps gemini-3.1-pro-preview to frontier tier (SP-085)', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'google', id: 'gemini-3.1-pro-preview' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.reasoning).toBeGreaterThanOrEqual(0.9);
    });

    it('maps generic gemini pro variants to frontier tier (SP-085)', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'google', id: 'gemini_3_pro_experimental' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
    });
  });

  describe('local providers', () => {
    it('maps lmstudio provider to zero-tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'lmstudio', id: 'local-gemma-4-7b' }),
      );

      expect(profile.tier).toBe('zero-tier');
      expect(profile.endpoint).toBe('http://localhost:1234/v1');
      expect(profile.pricing.fallback_cost_per_1m).toBe(0.0);
      expect(profile.capabilities.tool_use).toBe(0.1);
    });

    it('maps ollama provider to zero-tier', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'ollama', id: 'llama3.2:3b' }),
      );

      expect(profile.tier).toBe('zero-tier');
      expect(profile.provider).toBe('ollama');
      expect(profile.pricing.registry_key).toBe('local/free');
    });
  });

  describe('Cursor family (SP-086)', () => {
    it('maps cursor/auto to frontier tier with high capabilities', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'cursor', id: 'cursor/auto' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.reasoning).toBeGreaterThanOrEqual(0.9);
      expect(profile.capabilities.tool_use).toBeGreaterThanOrEqual(0.9);
      expect(profile.pricing.fallback_cost_per_1m).toBe(0.0);
      expect(profile.pricing.quota_cost_per_1m).toBe(DEFAULT_CURSOR_QUOTA_COST_PER_1M);
      expect(profile.provider).toBe('cursor');
    });

    it('maps composer-latest to frontier tier with strong code_gen', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'cursor', id: 'composer-latest' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.code_gen).toBeGreaterThanOrEqual(0.95);
      expect(profile.pricing.fallback_cost_per_1m).toBe(0.0);
      expect(profile.pricing.quota_cost_per_1m).toBe(DEFAULT_CURSOR_QUOTA_COST_PER_1M);
    });

    it('maps cursor/composer-latest via cursor/* rule', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'cursor', id: 'cursor/composer-latest' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.code_gen).toBeGreaterThanOrEqual(0.9);
    });

    it('keeps zero API fallback but virtual quota cost for cursor models (SP-096)', () => {
      const profile = mapPiModelToProfile(
        makeInput({
          provider: 'cursor',
          id: 'cursor/auto',
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.pricing.fallback_cost_per_1m).toBe(0.0);
      expect(profile.pricing.quota_cost_per_1m).toBe(DEFAULT_CURSOR_QUOTA_COST_PER_1M);
    });

    it('does not use UNKNOWN_DEFAULTS for cursor/auto', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'cursor', id: 'cursor/auto' }),
      );

      expect(profile.capabilities.reasoning).not.toBe(0.6);
      expect(profile.capabilities.code_gen).not.toBe(0.65);
    });

    it('maps opaque fleet id default to frontier tier with virtual quota cost (SP-098)', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'cursor', id: 'default' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.reasoning).toBeGreaterThanOrEqual(0.9);
      expect(profile.pricing.fallback_cost_per_1m).toBe(0.0);
      expect(profile.pricing.quota_cost_per_1m).toBe(DEFAULT_CURSOR_QUOTA_COST_PER_1M);
    });

    it('maps default id from non-cursor providers (SP-098)', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'pi', id: 'default' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.reasoning).not.toBe(0.6);
      expect(profile.pricing.quota_cost_per_1m).toBe(DEFAULT_CURSOR_QUOTA_COST_PER_1M);
    });
  });

  describe('unknown models', () => {
    it('assigns conservative economical-cloud defaults', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'custom-vendor', id: 'mystery-model-v9' }),
      );

      expect(profile.tier).toBe('economical-cloud');
      expect(profile.capabilities.reasoning).toBeLessThan(0.7);
      expect(profile.capabilities.code_gen).toBeLessThan(0.75);
      expect(profile.pricing.fallback_cost_per_1m).toBe(1.0);
      expect(profile.id).toBe('mystery-model-v9');
      expect(profile.provider).toBe('custom-vendor');
    });
  });

  describe('benchmark-grounded capabilities (SP-136)', () => {
    it('uses ingest artifact scores for known benchmark model ids', () => {
      setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

      const profile = mapPiModelToProfile(
        makeInput({ provider: 'anthropic', id: 'claude-opus-4-5' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.reasoning).toBeCloseTo(0.767, 4);
      expect(profile.capabilities.code_gen).toBeCloseTo(0.7915, 4);
      expect(profile.capabilities.tool_use).toBeCloseTo(0.8035, 4);
      expect(profile.capabilities.reasoning).not.toBe(0.95);
    });

    it('falls back to regex defaults when benchmark row is missing', () => {
      setBenchmarkProfilesPathForTests(DEFAULT_BENCHMARK_PROFILES_PATH);

      const profile = mapPiModelToProfile(
        makeInput({ provider: 'anthropic', id: 'claude-3.5-sonnet' }),
      );

      expect(profile.tier).toBe('frontier-cloud');
      expect(profile.capabilities.reasoning).toBe(0.95);
      expect(profile.capabilities.code_gen).toBe(0.95);
      expect(profile.capabilities.tool_use).toBe(0.95);
    });

    it('falls back to regex defaults when benchmark artifact is disabled', () => {
      setBenchmarkProfilesPathForTests(null);

      const profile = mapPiModelToProfile(
        makeInput({ provider: 'anthropic', id: 'claude-3.5-haiku' }),
      );

      expect(profile.capabilities.reasoning).toBe(0.7);
      expect(profile.capabilities.code_gen).toBe(0.75);
      expect(profile.capabilities.tool_use).toBe(0.7);
    });

    it('falls back to regex defaults when benchmark artifact path is missing', () => {
      setBenchmarkProfilesPathForTests(join(tmpdir(), 'missing-benchmark-profiles.json'));

      const profile = mapPiModelToProfile(
        makeInput({ provider: 'google', id: 'gemini-2.5-flash' }),
      );

      expect(profile.capabilities.code_gen).toBe(0.75);
    });

    it('loads custom benchmark artifact from an override path', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sp136-benchmark-'));
      const artifactPath = join(dir, 'benchmark-profiles.json');
      try {
        const artifact = ingestBenchmarkProfilesFromDir('tests/fixtures/benchmark-leaderboards', {
          catalogFreezeDate: '2026-07-09',
        });
        writeFileSync(artifactPath, serializeBenchmarkProfilesArtifact(artifact), 'utf8');
        setBenchmarkProfilesPathForTests(artifactPath);

        const profile = mapPiModelToProfile(
          makeInput({ provider: 'anthropic', id: 'claude-3.5-haiku' }),
        );

        expect(profile.capabilities.reasoning).toBeCloseTo(0.5685, 4);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('profile shape', () => {
    it('preserves input id and provider on mapped profile', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'anthropic', id: 'claude-3.5-haiku', name: 'Haiku' }),
      );

      expect(profile.id).toBe('claude-3.5-haiku');
      expect(profile.provider).toBe('anthropic');
      expect(profile.pricing.registry_key).toBe('anthropic/claude-3.5-haiku');
    });
  });

  describe('registry cost pricing (SP-046)', () => {
    const registryCost = {
      input: 1.5e-7,
      output: 6e-7,
      cacheRead: 0,
      cacheWrite: 0,
    };

    it('overrides pattern default when registry provides non-zero input/output rates', () => {
      const profile = mapPiModelToProfile(
        makeInput({
          provider: 'anthropic',
          id: 'claude-3.5-haiku',
          cost: registryCost,
        }),
      );

      expect(profile.tier).toBe('economical-cloud');
      expect(profile.pricing.fallback_cost_per_1m).toBeCloseTo(0.375, 5);
    });

    it('keeps pattern default when cost is omitted', () => {
      const profile = mapPiModelToProfile(
        makeInput({ provider: 'anthropic', id: 'claude-3.5-haiku' }),
      );

      expect(profile.pricing.fallback_cost_per_1m).toBe(0.8);
    });

    it('keeps pattern default when registry input and output are both zero', () => {
      const profile = mapPiModelToProfile(
        makeInput({
          provider: 'openai',
          id: 'gpt-5-mini',
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }),
      );

      expect(profile.pricing.fallback_cost_per_1m).toBe(0.8);
    });

    it('leaves zero-cost local models free even when cost is present', () => {
      const profile = mapPiModelToProfile(
        makeInput({
          provider: 'ollama',
          id: 'llama3.2:3b',
          cost: registryCost,
        }),
      );

      expect(profile.tier).toBe('zero-tier');
      expect(profile.pricing.fallback_cost_per_1m).toBe(0.0);
    });
  });
});

describe('mapFleetFromRegistry', () => {
  it('maps a mixed model set to a fleet catalog', () => {
    const models: PiModelInput[] = [
      { provider: 'anthropic', id: 'claude-3.5-sonnet' },
      { provider: 'openai', id: 'gpt-5-mini' },
      { provider: 'lmstudio', id: 'local-gemma' },
      { provider: 'unknown-co', id: 'model-x' },
    ];

    const fleet = mapFleetFromRegistry(models);

    expect(fleet).toHaveLength(4);
    expect(fleet[0]!.tier).toBe('frontier-cloud');
    expect(fleet[1]!.tier).toBe('economical-cloud');
    expect(fleet[2]!.tier).toBe('zero-tier');
    expect(fleet[3]!.tier).toBe('economical-cloud');
    expect(fleet.map((m) => m.id)).toEqual([
      'claude-3.5-sonnet',
      'gpt-5-mini',
      'local-gemma',
      'model-x',
    ]);
  });
});
