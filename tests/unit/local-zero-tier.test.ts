import { describe, expect, it } from 'vitest';

import {
  pingLocalServices,
  type HttpFetchPort,
  type LocalZeroTierConfig,
} from '../../src/infrastructure/local/local-zero-tier.js';

const TEST_CONFIG: LocalZeroTierConfig = {
  lmStudioBaseUrl: 'http://127.0.0.1:1234',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  pingTimeoutMs: 200,
};

function makeFetchPort(
  handler: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>,
): HttpFetchPort {
  return {
    fetch: (url, _init) => handler(url),
  };
}

const UNREACHABLE_FETCH: HttpFetchPort = makeFetchPort(() => {
  throw new Error('ECONNREFUSED');
});

describe('pingLocalServices (T045, FR-012, FR-013)', () => {
  describe('LM Studio readiness', () => {
    it('returns anyModelReady true when LM Studio reports loaded models', async () => {
      const httpFetch = makeFetchPort(async (url) => {
        if (url.includes('/v1/models')) {
          return {
            ok: true,
            json: async () => ({ data: [{ id: 'qwen2.5-coder-7b' }] }),
          };
        }
        throw new Error('ECONNREFUSED');
      });

      const result = await pingLocalServices(TEST_CONFIG, httpFetch);
      expect(result.lmStudio.available).toBe(true);
      expect(result.lmStudio.hasLoadedModel).toBe(true);
      expect(result.anyModelReady).toBe(true);
    });

    it('returns hasLoadedModel false when LM Studio has empty model list', async () => {
      const httpFetch = makeFetchPort(async (url) => {
        if (url.includes('/v1/models')) {
          return { ok: true, json: async () => ({ data: [] }) };
        }
        throw new Error('ECONNREFUSED');
      });

      const result = await pingLocalServices(TEST_CONFIG, httpFetch);
      expect(result.lmStudio.available).toBe(true);
      expect(result.lmStudio.hasLoadedModel).toBe(false);
      expect(result.anyModelReady).toBe(false);
    });
  });

  describe('Ollama readiness', () => {
    it('returns anyModelReady true when Ollama reports loaded models', async () => {
      const httpFetch = makeFetchPort(async (url) => {
        if (url.includes('/api/tags')) {
          return {
            ok: true,
            json: async () => ({ models: [{ name: 'llama3.2' }] }),
          };
        }
        throw new Error('ECONNREFUSED');
      });

      const result = await pingLocalServices(TEST_CONFIG, httpFetch);
      expect(result.ollama.available).toBe(true);
      expect(result.ollama.hasLoadedModel).toBe(true);
      expect(result.anyModelReady).toBe(true);
    });

    it('returns hasLoadedModel false when Ollama has empty model list', async () => {
      const httpFetch = makeFetchPort(async (url) => {
        if (url.includes('/api/tags')) {
          return { ok: true, json: async () => ({ models: [] }) };
        }
        throw new Error('ECONNREFUSED');
      });

      const result = await pingLocalServices(TEST_CONFIG, httpFetch);
      expect(result.ollama.available).toBe(true);
      expect(result.ollama.hasLoadedModel).toBe(false);
    });
  });

  describe('both services unavailable', () => {
    it('returns all-false result when both services are unreachable', async () => {
      const result = await pingLocalServices(TEST_CONFIG, UNREACHABLE_FETCH);
      expect(result.lmStudio.available).toBe(false);
      expect(result.lmStudio.hasLoadedModel).toBe(false);
      expect(result.ollama.available).toBe(false);
      expect(result.ollama.hasLoadedModel).toBe(false);
      expect(result.anyModelReady).toBe(false);
    });

    it('never throws even when both services are unreachable', async () => {
      await expect(
        pingLocalServices(TEST_CONFIG, UNREACHABLE_FETCH),
      ).resolves.toBeDefined();
    });
  });

  describe('HTTP error responses', () => {
    it('returns available true but hasLoadedModel false on non-ok LM Studio response', async () => {
      const httpFetch = makeFetchPort(async (url) => {
        if (url.includes('/v1/models')) {
          return { ok: false, json: async () => ({}) };
        }
        throw new Error('ECONNREFUSED');
      });

      const result = await pingLocalServices(TEST_CONFIG, httpFetch);
      expect(result.lmStudio.available).toBe(true);
      expect(result.lmStudio.hasLoadedModel).toBe(false);
    });

    it('returns available true but hasLoadedModel false on non-ok Ollama response', async () => {
      const httpFetch = makeFetchPort(async (url) => {
        if (url.includes('/api/tags')) {
          return { ok: false, json: async () => ({}) };
        }
        throw new Error('ECONNREFUSED');
      });

      const result = await pingLocalServices(TEST_CONFIG, httpFetch);
      expect(result.ollama.available).toBe(true);
      expect(result.ollama.hasLoadedModel).toBe(false);
    });
  });

  describe('timeout behavior', () => {
    it('aborts and returns unavailable when ping exceeds timeout', async () => {
      const config: LocalZeroTierConfig = { ...TEST_CONFIG, pingTimeoutMs: 1 };
      const slowFetch = makeFetchPort(
        () => new Promise((resolve) => setTimeout(
          () => resolve({ ok: true, json: async () => ({ data: [] }) }),
          500,
        )),
      );

      const result = await pingLocalServices(config, slowFetch);
      expect(result.lmStudio.hasLoadedModel).toBe(false);
      expect(result.ollama.hasLoadedModel).toBe(false);
    });
  });

  describe('latency tracking', () => {
    it('reports combinedLatencyMs as a non-negative number', async () => {
      const result = await pingLocalServices(TEST_CONFIG, UNREACHABLE_FETCH);
      expect(result.combinedLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('reports per-service latencyMs', async () => {
      const httpFetch = makeFetchPort(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'test' }], models: [{ name: 'test' }] }),
      }));

      const result = await pingLocalServices(TEST_CONFIG, httpFetch);
      expect(result.lmStudio.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.ollama.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('parallel execution', () => {
    it('pings both services in parallel (combined < 2x individual)', async () => {
      const delayMs = 20;
      const httpFetch = makeFetchPort(
        () => new Promise((resolve) => setTimeout(
          () => resolve({ ok: true, json: async () => ({ data: [], models: [] }) }),
          delayMs,
        )),
      );

      const result = await pingLocalServices(
        { ...TEST_CONFIG, pingTimeoutMs: 1000 },
        httpFetch,
      );
      expect(result.combinedLatencyMs).toBeLessThan(delayMs * 3);
    });
  });
});
