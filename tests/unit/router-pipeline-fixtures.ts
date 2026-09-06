/**
 * Shared fixtures for the router-pipeline test family.
 *
 * Extracted from tests/unit/router-pipeline.test.ts in SP-277 (wave 1, #155)
 * so stage-focused test modules and the remaining monolith construct fleets
 * and requests from one source of truth.
 */
import { createDefaultPSuccessWeights } from "../../src/domain/routing/p-success-classifier.js";
import type {
  ModelProfile,
  RoutingRequest,
} from "../../src/domain/types/index.js";

/** Pre-SP-175 structural tests: ignore shipped dogfood weights. */
export const UNTRAINED_P_SUCCESS_WEIGHTS = createDefaultPSuccessWeights();

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
