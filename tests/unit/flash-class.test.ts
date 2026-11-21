import { describe, expect, it } from 'vitest';

import {
  applyMainLoopCapabilityFloor,
  FLASH_CLASS_CAPABILITY_FLOOR,
  isDeepAgenticSession,
  isFlashClassModel,
} from '../../src/domain/routing/flash-class.js';
import type {
  ModelProfile,
  RoutingRequest,
} from '../../src/domain/types/index.js';

const HIGH_CAPABILITIES = {
  reasoning: 0.95,
  code_gen: 0.95,
  tool_use: 0.95,
} as const;

function makeModel(
  id: string,
  overrides: Partial<ModelProfile> = {},
): ModelProfile {
  return {
    id,
    tier: 'economical-cloud',
    provider: 'test',
    capabilities: HIGH_CAPABILITIES,
    pricing: { fallback_cost_per_1m: 1 },
    ...overrides,
  };
}

function makeRequest(
  overrides: Partial<RoutingRequest> = {},
): RoutingRequest {
  return {
    request_id: 'req-sp-323',
    session_id: 'sess-sp-323',
    prompt_text: 'Quotas has been reset, continue',
    turn_type: 'main_loop',
    estimated_input_tokens: 100_001,
    ...overrides,
  };
}

describe('isFlashClassModel', () => {
  it.each([
    'zai/glm-5.3-flash',
    'google/gemini-flash-lite',
    'openai/gpt-4o-mini',
    'local/nano-agent',
    'provider/FLASH-V2',
  ])('recognizes flash-class id fallback in %s', (id) => {
    expect(isFlashClassModel(makeModel(id))).toBe(true);
  });

  it('uses reasoning and tool_use capability floors for neutral ids', () => {
    expect(
      isFlashClassModel(
        makeModel('mid-tier', {
          capabilities: { reasoning: 0.69, code_gen: 0.95, tool_use: 0.95 },
        }),
      ),
    ).toBe(true);
    expect(
      isFlashClassModel(
        makeModel('weak-tools', {
          capabilities: { reasoning: 0.95, code_gen: 0.95, tool_use: 0.69 },
        }),
      ),
    ).toBe(true);
    expect(
      isFlashClassModel(
        makeModel('capable-peer', {
          capabilities: {
            reasoning: FLASH_CLASS_CAPABILITY_FLOOR,
            code_gen: 0.8,
            tool_use: FLASH_CLASS_CAPABILITY_FLOOR,
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('isDeepAgenticSession', () => {
  it('uses strict message-count and estimated-token boundaries', () => {
    expect(
      isDeepAgenticSession(
        makeRequest({
          messages: Array.from({ length: 1_000 }, () => ({
            role: 'user',
            content: 'history',
          })),
          estimated_input_tokens: 100_000,
        }),
      ),
    ).toBe(false);
    expect(
      isDeepAgenticSession(
        makeRequest({
          messages: Array.from({ length: 1_001 }, () => ({
            role: 'user',
            content: 'history',
          })),
          estimated_input_tokens: 0,
        }),
      ),
    ).toBe(true);
    expect(isDeepAgenticSession(makeRequest())).toBe(true);
  });
});

describe('applyMainLoopCapabilityFloor', () => {
  const flash = makeModel('glm-5.3-flash', {
    capabilities: { reasoning: 0.7, code_gen: 0.75, tool_use: 0.7 },
  });
  const midTier = makeModel('glm-5.3', {
    capabilities: { reasoning: 0.8, code_gen: 0.8, tool_use: 0.8 },
  });
  const frontier = makeModel('claude-opus', { tier: 'frontier-cloud' });

  it('excludes flash-class candidates while preserving peer order and input', () => {
    const fleet = [flash, midTier, frontier];
    const result = applyMainLoopCapabilityFloor(makeRequest(), fleet);

    expect(result.fleet.map((model) => model.id)).toEqual([
      'glm-5.3',
      'claude-opus',
    ]);
    expect(result.excludedModelIds).toEqual(['glm-5.3-flash']);
    expect(fleet).toEqual([flash, midTier, frontier]);
  });

  it('does not attribute already-unhealthy flash models to floor metadata', () => {
    const unhealthyFlash = makeModel('unhealthy-flash', { healthy: false });
    const result = applyMainLoopCapabilityFloor(
      makeRequest(),
      [unhealthyFlash, flash, frontier],
    );

    expect(result.fleet.map((model) => model.id)).toEqual(['claude-opus']);
    expect(result.excludedModelIds).toEqual(['glm-5.3-flash']);
  });

  it('supports message depth below the token threshold', () => {
    const result = applyMainLoopCapabilityFloor(
      makeRequest({
        messages: Array.from({ length: 1_001 }, () => ({
          role: 'assistant',
          content: 'history',
        })),
        estimated_input_tokens: 0,
      }),
      [flash, frontier],
    );

    expect(result.excludedModelIds).toEqual(['glm-5.3-flash']);
  });

  it('leaves shallow sessions and non-main_loop turns unchanged', () => {
    const fleet = [flash, frontier];
    const shallow = makeRequest({ estimated_input_tokens: 50 });
    const toolResult = makeRequest({ turn_type: 'tool_result' });

    expect(applyMainLoopCapabilityFloor(shallow, fleet).fleet).toBe(fleet);
    expect(applyMainLoopCapabilityFloor(toolResult, fleet).fleet).toBe(fleet);
  });

  it('retains flash candidates when no healthy higher-capability peer exists', () => {
    const weakPeer = makeModel('weak-peer', {
      capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    });
    const unhealthyPeer = makeModel('unhealthy-peer', { healthy: false });

    for (const fleet of [[flash], [flash, weakPeer], [flash, unhealthyPeer]]) {
      const result = applyMainLoopCapabilityFloor(makeRequest(), fleet);
      expect(result.fleet).toBe(fleet);
      expect(result.excludedModelIds).toEqual([]);
    }
  });

  it('does not override an explicit model force', () => {
    const fleet = [flash, frontier];
    const result = applyMainLoopCapabilityFloor(
      makeRequest({ force_model_id: flash.id }),
      fleet,
    );

    expect(result.fleet).toBe(fleet);
    expect(result.excludedModelIds).toEqual([]);
  });
});
