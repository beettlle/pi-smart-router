/**
 * Shared fixtures for the router-pipeline test family.
 *
 * Extracted from tests/unit/router-pipeline.test.ts in SP-277 (wave 1, #155)
 * so stage-focused test modules construct fleets and requests from one
 * source of truth. SP-278 (wave 2, #155) moved the remaining shared
 * helpers here and retired the monolith.
 */
import { vi } from "vitest";

import type {
  ClusterMatcher,
  ClusterMatchResult,
} from "../../src/domain/matching/cluster-matcher.js";
import type {
  EmbeddingProvider,
  RequirementVector,
} from "../../src/domain/matching/hydra-matcher.js";
import {
  createDefaultPSuccessWeights,
  P_SUCCESS_FEATURE_NAMES,
  type PSuccessWeights,
} from "../../src/domain/routing/p-success-classifier.js";
import type { HttpFetchPort } from "../../src/infrastructure/local/local-zero-tier.js";
import type { SystemInfo } from "../../src/infrastructure/hardware/hardware-probe.js";
import type {
  ModelProfile,
  RoutingRequest,
} from "../../src/domain/types/index.js";

/** Pre-SP-175 structural tests: ignore shipped dogfood weights. */
export const UNTRAINED_P_SUCCESS_WEIGHTS = createDefaultPSuccessWeights();

export const HARDWARE_CONFIG = {
  min_memory_gb_full: 16,
  min_memory_gb_classification: 8,
  battery_threshold_pct: 20,
} as const;

export const LOCAL_TEST_CONFIG = {
  lmStudioBaseUrl: "http://127.0.0.1:1234",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  pingTimeoutMs: 500,
} as const;

/** LM Studio + Ollama both reachable fake — local tier reports ready. */
export const READY_FETCH: HttpFetchPort = {
  fetch: vi.fn(async (url: string) => {
    if (url.includes("/v1/models")) {
      return { ok: true, json: async () => ({ data: [{ id: "local-model" }] }) };
    }
    if (url.includes("/api/tags")) {
      return { ok: true, json: async () => ({ models: [] }) };
    }
    throw new Error("ECONNREFUSED");
  }),
};

export function makeSystemInfo(overrides?: Partial<SystemInfo>): SystemInfo {
  return {
    totalMemoryGb: 16,
    arch: "arm64",
    platform: "darwin",
    batteryLevel: 80,
    isOnAcPower: true,
    ...overrides,
  };
}

export function makeClusterMatcher(result: ClusterMatchResult): ClusterMatcher {
  return {
    match: vi.fn(async () => result),
  } as unknown as ClusterMatcher;
}

export function makeMockHydraProvider(
  requirements: RequirementVector,
): EmbeddingProvider {
  return {
    extractRequirements: vi.fn(async () => requirements),
    dispose: vi.fn(async () => {}),
  };
}

export function makeHighPWeights(): PSuccessWeights {
  return {
    version: 1,
    min_training_samples: 30,
    feature_names: P_SUCCESS_FEATURE_NAMES,
    intercept: 6,
    coefficients: P_SUCCESS_FEATURE_NAMES.map(() => 0),
    trained_sample_count: 50,
  };
}

export function makeLowPWeights(): PSuccessWeights {
  return {
    version: 1,
    min_training_samples: 30,
    feature_names: P_SUCCESS_FEATURE_NAMES,
    intercept: -6,
    coefficients: P_SUCCESS_FEATURE_NAMES.map(() => 0),
    trained_sample_count: 50,
  };
}

export function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile["tier"] },
): ModelProfile {
  return {
    provider: "test",
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

export function makeRequest(
  overrides?: Partial<RoutingRequest>,
): RoutingRequest {
  return {
    request_id: "00000000-0000-0000-0000-000000000001",
    session_id: "sess-1",
    prompt_text: "Hello world",
    ...overrides,
  };
}

export const fleet: ModelProfile[] = [
  makeModel({ id: "local-llama", tier: "zero-tier" }),
  makeModel({ id: "gpt-4o-mini", tier: "economical-cloud" }),
  makeModel({ id: "claude-opus", tier: "frontier-cloud" }),
];
