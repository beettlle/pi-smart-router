// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/turn-envelope-stage.ts cost-aware selection (SP-085).
import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import { makeModel, makeRequest } from './router-pipeline-fixtures.js';

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
