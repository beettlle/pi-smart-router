// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/turn-envelope-stage.ts cost-aware selection (SP-085).
import { describe, expect, it } from 'vitest';

import { HydraMatcher } from '../../src/domain/matching/hydra-matcher.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SESSION_DEPTH_CAPABILITY_FLOOR } from '../../src/domain/routing/flash-class.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';
import {
  makeMockHydraProvider,
  makeModel,
  makeRequest,
  UNTRAINED_P_SUCCESS_WEIGHTS,
} from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('cost-aware turn envelope selection (SP-085)', () => {
    it('selects cheapest economical model for tool_result', async () => {
      const costFleet: ModelProfile[] = [
        makeModel({
          id: 'gemini-pro',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 3.0 },
        }),
        makeModel({
          id: 'gemini-flash-lite',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 0.1 },
        }),
        makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
      ];

      const pipeline = new RouterPipeline(costFleet);
      const decision = await pipeline.route(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
      );

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.selected_model_id).toBe('gemini-flash-lite');
    });

    it('selects cheapest frontier model for planning', async () => {
      const frontierCostFleet: ModelProfile[] = [
        makeModel({
          id: 'opus',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 15.0 },
        }),
        makeModel({
          id: 'sonnet',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          pricing: { fallback_cost_per_1m: 5.0 },
        }),
        makeModel({
          id: 'flash',
          tier: 'economical-cloud',
          provider: 'google',
          pricing: { fallback_cost_per_1m: 0.1 },
        }),
      ];

      const pipeline = new RouterPipeline(frontierCostFleet);
      const decision = await pipeline.route(makeRequest({ turn_type: 'planning' }));

      expect(decision.stage).toBe('turn_envelope');
      expect(decision.selected_model_id).toBe('sonnet');
    });
  });
});

describe('RouterPipeline deep main_loop capability floor (SP-323 / #179)', () => {
  const flash = makeModel({
    id: 'glm-5.3-flash',
    tier: 'economical-cloud',
    provider: 'zai',
    capabilities: { reasoning: 0.7, code_gen: 0.75, tool_use: 0.7 },
    pricing: { fallback_cost_per_1m: 0.1 },
  });
  const capablePeer = makeModel({
    id: 'glm-5.3',
    tier: 'economical-cloud',
    provider: 'zai',
    capabilities: { reasoning: 0.8, code_gen: 0.8, tool_use: 0.8 },
    pricing: { fallback_cost_per_1m: 1 },
  });

  function makePipeline(): RouterPipeline {
    const hydraMatcher = new HydraMatcher(
      makeMockHydraProvider({ reasoning: 0.1, code_gen: 0.1, tool_use: 0.1 }),
      { artifactCachePath: '.pi-smart-router/models/' },
    );
    return new RouterPipeline([flash, capablePeer], {
      hydraMatcher,
      pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
    });
  }

  function continuation(overrides: Partial<RoutingRequest>): RoutingRequest {
    return makeRequest({
      prompt_text: 'Quotas has been reset, continue',
      messages: [{ role: 'user', content: 'Quotas has been reset, continue' }],
      turn_type: 'main_loop',
      ...overrides,
    });
  }

  it.each(['estimated tokens', 'message count'] as const)(
    'does not select flash-class for a terse continuation deep by %s',
    async (depthSignal) => {
      const request =
        depthSignal === 'estimated tokens'
          ? continuation({ estimated_input_tokens: 148_508 })
          : continuation({
              estimated_input_tokens: 50,
              messages: Array.from({ length: 1_001 }, (_, index) => ({
                role: index === 1_000 ? 'user' : 'assistant',
                content:
                  index === 1_000 ? 'Quotas has been reset, continue' : 'history',
              })),
            });

      const decision = await makePipeline().route(request);

      expect(decision.stage).toBe('hydra_match');
      expect(decision.selected_model_id).toBe('glm-5.3');
      expect(decision.selected_model_id).not.toBe('glm-5.3-flash');
      expect(decision.features?.candidates).toContainEqual({
        model_id: 'glm-5.3-flash',
        score: 0,
        shortfall: 0,
        rejected_reason: SESSION_DEPTH_CAPABILITY_FLOOR,
      });
    },
  );

  it('keeps shallow-session HyDRA selection unchanged', async () => {
    const decision = await makePipeline().route(
      continuation({ estimated_input_tokens: 50 }),
    );

    expect(decision.stage).toBe('hydra_match');
    expect(decision.selected_model_id).toBe('glm-5.3-flash');
    expect(decision.features?.candidates).not.toContainEqual(
      expect.objectContaining({ rejected_reason: SESSION_DEPTH_CAPABILITY_FLOOR }),
    );
  });
});
