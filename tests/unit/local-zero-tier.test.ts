import { describe, expect, it } from 'vitest';

import {
  pingLocalServices,
  type HttpFetchPort,
  type LocalZeroTierConfig,
} from '../../src/infrastructure/local/local-zero-tier.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { HardwareProbeConfig, SystemInfo } from '../../src/infrastructure/hardware/hardware-probe.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

const TEST_CONFIG: LocalZeroTierConfig = {
  lmStudioBaseUrl: 'http://127.0.0.1:1234',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  pingTimeoutMs: 200,
};

function makeFetchPort(
  handler: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>,
): HttpFetchPort {
  return {
    fetch: (url, init) => {
      void init;
      return handler(url);
    },
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

// ─── Pipeline integration tests (T046, T047) ─────────────────────────────────

const HARDWARE_CONFIG: HardwareProbeConfig = {
  min_memory_gb_full: 16,
  min_memory_gb_classification: 8,
  battery_threshold_pct: 20,
};

const LOCAL_MODEL: ModelProfile = {
  id: 'qwen2.5-coder-7b',
  tier: 'zero-tier',
  provider: 'lm-studio',
  capabilities: { reasoning: 3, code_gen: 4, tool_use: 2 },
  pricing: { fallback_cost_per_1m: 0 },
};

const CLOUD_MODEL: ModelProfile = {
  id: 'gpt-4o-mini',
  tier: 'economical-cloud',
  provider: 'openai',
  capabilities: { reasoning: 7, code_gen: 7, tool_use: 7 },
  pricing: { fallback_cost_per_1m: 0.15 },
};

const FLEET: readonly ModelProfile[] = [LOCAL_MODEL, CLOUD_MODEL];

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'test-req-001',
    session_id: 'test-session',
    prompt_text: 'Format this JSON file',
    ...overrides,
  };
}

function makeSystemInfo(overrides?: Partial<SystemInfo>): SystemInfo {
  return {
    totalMemoryGb: 16,
    arch: 'arm64',
    platform: 'darwin',
    batteryLevel: 80,
    isOnAcPower: true,
    ...overrides,
  };
}

const READY_FETCH: HttpFetchPort = makeFetchPort(async (url) => {
  if (url.includes('/v1/models')) {
    return { ok: true, json: async () => ({ data: [{ id: 'qwen2.5-coder-7b' }] }) };
  }
  if (url.includes('/api/tags')) {
    return { ok: true, json: async () => ({ models: [{ name: 'llama3.2' }] }) };
  }
  throw new Error('ECONNREFUSED');
});

describe('RouterPipeline local zero-tier integration (T046, T047)', () => {
  describe('16GB Apple Silicon — full_local (T047)', () => {
    it('routes to zero-tier when hardware is full_local and services are ready', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 16 })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).toBe('zero-tier');
      expect(decision.stage).toBe('local_zero');
      expect(decision.selected_model_id).toBe('qwen2.5-coder-7b');
      expect(decision.reason_code).toBe('local_model_ready');
    });
  });

  describe('8GB Apple Silicon — classification_only (T047, SC-007)', () => {
    it('MUST NOT dispatch full local when hardware is classification_only', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 8 })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).not.toBe('zero-tier');
      expect(decision.stage).not.toBe('local_zero');
    });

    it('falls through to economical cloud via triage when classification_only', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 8 })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.stage).toBe('triage');
      expect(decision.reason_code).toBe('keyword_economical');
    });
  });

  describe('battery below threshold — disabled (T047)', () => {
    it('does not route to local when battery is low and on battery power', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({
          totalMemoryGb: 32,
          batteryLevel: 10,
          isOnAcPower: false,
        })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).not.toBe('zero-tier');
      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('economical-cloud');
    });

    it('routes to local when battery is low but on AC power', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({
          totalMemoryGb: 32,
          batteryLevel: 10,
          isOnAcPower: true,
        })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).toBe('zero-tier');
      expect(decision.stage).toBe('local_zero');
    });
  });

  describe('local services unreachable (T047)', () => {
    it('falls through to economical cloud when services are unreachable despite full_local hardware', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 32 })),
        httpFetchPort: UNREACHABLE_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).not.toBe('zero-tier');
      expect(decision.stage).toBe('triage');
      expect(decision.reason_code).toBe('keyword_economical');
    });

    it('never throws when both local services are down', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 16 })),
        httpFetchPort: UNREACHABLE_FETCH,
      });

      await expect(pipeline.route(makeRequest())).resolves.toBeDefined();
    });
  });

  describe('no zero-tier model in fleet', () => {
    it('falls through when fleet has no zero-tier model', async () => {
      const pipeline = new RouterPipeline([CLOUD_MODEL], {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 32 })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.stage).toBe('triage');
    });
  });

  describe('unsupported or ineligible hardware', () => {
    it('routes to zero-tier on Windows x64 with sufficient RAM', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({
          platform: 'win32',
          arch: 'x64',
          totalMemoryGb: 64,
        })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).toBe('zero-tier');
    });

    it('routes to zero-tier on Linux x64 with sufficient RAM', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({
          platform: 'linux',
          arch: 'x64',
          totalMemoryGb: 64,
        })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).toBe('zero-tier');
    });

    it('disables local when arch is not arm64 on darwin', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({
          arch: 'x64',
          totalMemoryGb: 64,
        })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(makeRequest());
      expect(decision.tier).not.toBe('zero-tier');
    });
  });

  describe('SP-050: trivial prompts prefer local before cloud exit', () => {
    it('routes trivial + full_local + ready local to zero-tier before triage cloud exit', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 16 })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Lint the source file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.reason_code).toBe('local_model_ready');
    });

    it('falls back to economical cloud when trivial but local services unavailable', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 16 })),
        httpFetchPort: UNREACHABLE_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.reason_code).toBe('keyword_economical');
    });

    it('falls back to economical cloud when trivial but hardware disabled', async () => {
      const pipeline = new RouterPipeline(FLEET);

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('triage');
      expect(decision.tier).toBe('economical-cloud');
    });

    it('does not route ambiguous prompts to local even when hardware is full_local', async () => {
      const pipeline = new RouterPipeline(FLEET, {
        hardwareConfig: HARDWARE_CONFIG,
        localConfig: TEST_CONFIG,
        systemInfoProvider: () => Promise.resolve(makeSystemInfo({ totalMemoryGb: 16 })),
        httpFetchPort: READY_FETCH,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'hello world' }),
      );

      expect(decision.stage).not.toBe('local_zero');
      expect(decision.tier).not.toBe('zero-tier');
    });
  });
});
