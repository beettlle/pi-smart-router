import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { loadModels, ModelsLoaderError } from '../../src/config/models-loader.js';

const VALID_CATALOG = `
models:
  - id: local-gemma-4-7b
    tier: zero-tier
    provider: lmstudio
    endpoint: http://localhost:1234/v1
    capabilities:
      reasoning: 0.3
      code_gen: 0.6
      tool_use: 0.1
    performance:
      latency_p50_ms: 120
      verbosity_factor: 0.9
      cache_friendly: true
    pricing:
      registry_key: local/free
      fallback_cost_per_1m: 0.0

  - id: claude-3.5-haiku
    tier: economical-cloud
    provider: anthropic
    capabilities:
      reasoning: 0.7
      code_gen: 0.75
      tool_use: 0.7
    pricing:
      registry_key: anthropic/claude-3-5-haiku
      fallback_cost_per_1m: 0.8

  - id: claude-3.5-sonnet
    tier: frontier-cloud
    provider: anthropic
    capabilities:
      reasoning: 0.95
      code_gen: 0.95
      tool_use: 0.95
    pricing:
      registry_key: anthropic/claude-3-5-sonnet
      fallback_cost_per_1m: 3.0
`;

const MISSING_TIER_CATALOG = `
models:
  - id: bad-model
    provider: test
    capabilities:
      reasoning: 0.5
      code_gen: 0.5
      tool_use: 0.5
    pricing:
      fallback_cost_per_1m: 1.0
`;

const INVALID_SCHEMA_CATALOG = `
models:
  - id: bad-caps
    tier: zero-tier
    provider: test
    capabilities:
      reasoning: 2.0
      code_gen: -1
      tool_use: 0.5
    pricing:
      fallback_cost_per_1m: 1.0
`;

const EMPTY_MODELS_CATALOG = `
models: []
`;

describe('models-loader', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'models-loader-test-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFixture(name: string, content: string): string {
    const filePath = join(tempDir, name);
    writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  describe('valid catalog', () => {
    it('loads and validates a complete fleet catalog', () => {
      const filePath = writeFixture('valid.yaml', VALID_CATALOG);
      const catalog = loadModels({ filePath });

      expect(catalog.models).toHaveLength(3);
      expect(catalog.models[0]!.id).toBe('local-gemma-4-7b');
      expect(catalog.models[0]!.tier).toBe('zero-tier');
      expect(catalog.models[1]!.tier).toBe('economical-cloud');
      expect(catalog.models[2]!.tier).toBe('frontier-cloud');
    });

    it('preserves optional fields when present', () => {
      const filePath = writeFixture('valid-optional.yaml', VALID_CATALOG);
      const catalog = loadModels({ filePath });

      const localModel = catalog.models[0]!;
      expect(localModel.endpoint).toBe('http://localhost:1234/v1');
      expect(localModel.performance?.latency_p50_ms).toBe(120);
      expect(localModel.performance?.verbosity_factor).toBe(0.9);
      expect(localModel.performance?.cache_friendly).toBe(true);
    });

    it('handles models without optional performance/endpoint fields', () => {
      const filePath = writeFixture('valid-minimal.yaml', VALID_CATALOG);
      const catalog = loadModels({ filePath });

      const cloudModel = catalog.models[1]!;
      expect(cloudModel.endpoint).toBeUndefined();
      expect(cloudModel.performance).toBeUndefined();
    });
  });

  describe('missing tier', () => {
    it('rejects a model with no tier field', () => {
      const filePath = writeFixture('missing-tier.yaml', MISSING_TIER_CATALOG);

      expect(() => loadModels({ filePath })).toThrow(ModelsLoaderError);
      expect(() => loadModels({ filePath })).toThrow(/Invalid fleet catalog/);
    });
  });

  describe('invalid schema', () => {
    it('rejects capabilities outside 0–1 range', () => {
      const filePath = writeFixture('invalid-caps.yaml', INVALID_SCHEMA_CATALOG);

      expect(() => loadModels({ filePath })).toThrow(ModelsLoaderError);
      expect(() => loadModels({ filePath })).toThrow(/Invalid fleet catalog/);
    });

    it('rejects an empty models array', () => {
      const filePath = writeFixture('empty.yaml', EMPTY_MODELS_CATALOG);

      expect(() => loadModels({ filePath })).toThrow(ModelsLoaderError);
      expect(() => loadModels({ filePath })).toThrow(/Invalid fleet catalog/);
    });

    it('rejects invalid YAML syntax', () => {
      const filePath = writeFixture('bad-yaml.yaml', '{ invalid: yaml: content: [}');

      expect(() => loadModels({ filePath })).toThrow(ModelsLoaderError);
      expect(() => loadModels({ filePath })).toThrow(/Failed to parse YAML/);
    });

    it('throws when file does not exist', () => {
      expect(() => loadModels({ filePath: '/nonexistent/models.yaml' })).toThrow(
        ModelsLoaderError,
      );
      expect(() => loadModels({ filePath: '/nonexistent/models.yaml' })).toThrow(
        /Failed to read models file/,
      );
    });
  });
});
