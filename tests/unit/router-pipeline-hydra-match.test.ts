// Extracted from tests/unit/router-pipeline.test.ts in SP-277 (wave 1, #155).
// Aligned with src/domain/pipeline/hydra-match-stage.ts (missing-weights fail-closed seam).
import { describe, expect, it, vi } from 'vitest';

import {
  HydraMatcher,
  MissingWeightsFailClosedError,
} from '../../src/domain/matching/hydra-matcher.js';
import { HYDRA_WEIGHTS_MISSING_REASON_CODE } from '../../src/domain/matching/missing-weights-reason-codes.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { DEFAULT_DEGRADED_ROUTE_CONFIG } from '../../src/domain/types/schemas.js';
import { fleet, makeRequest, UNTRAINED_P_SUCCESS_WEIGHTS } from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('fail_closed_on_missing_weights sandwich integration (SP-252, #148)', () => {
    const AMBIGUOUS_PROMPT = 'Hello, how are you today?';

    function makeMissingWeightsMatcher(failClosed: boolean): HydraMatcher {
      return new HydraMatcher(
        {
          extractRequirements: vi.fn(async () => ({
            reasoning: 0.5,
            code_gen: 0.5,
            tool_use: 0.5,
          })),
          dispose: vi.fn(async () => {}),
        },
        {
          artifactCachePath: '.pi-smart-router/models/',
          hydraHeads: 'learned_projection',
          projectionWeightsPath: '/tmp/sp252-missing-hydra-projection-weights.json',
          ...(failClosed ? { failClosedOnMissingWeights: true } : {}),
        },
      );
    }

    it('routes through the degraded sandwich with hydra_weights_missing on the decision when the matcher fails closed', async () => {
      const hydraMatcher = makeMissingWeightsMatcher(true);
      const pipeline = new RouterPipeline(fleet, {
        hydraMatcher,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: AMBIGUOUS_PROMPT }),
      );

      // SP-251 reason code is visible on the decision path; the sandwich branch
      // is recorded on route_path (safe default here — no learned store / pack).
      expect(decision.reason_code).toBe(HYDRA_WEIGHTS_MISSING_REASON_CODE);
      expect(decision.stage).toBe('fallback');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.features?.route_path).toBe('safe_default');
      // Placeholder requirements must not be recorded as a neural success.
      expect(decision.features?.requirements).toBeNull();
    });

    it('honors the operator degraded_route flag pipeline-side even when the matcher was built fail-open', async () => {
      const hydraMatcher = makeMissingWeightsMatcher(false);
      const pipeline = new RouterPipeline(fleet, {
        hydraMatcher,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
        degradedRouteConfig: {
          ...DEFAULT_DEGRADED_ROUTE_CONFIG,
          fail_closed_on_missing_weights: true,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: AMBIGUOUS_PROMPT }),
      );

      expect(decision.reason_code).toBe(HYDRA_WEIGHTS_MISSING_REASON_CODE);
      expect(decision.stage).toBe('fallback');
      expect(decision.features?.route_path).toBe('safe_default');
    });

    it('remains fail-open by default: placeholders still decide via hydra_match', async () => {
      const hydraMatcher = makeMissingWeightsMatcher(false);
      const pipeline = new RouterPipeline(fleet, {
        hydraMatcher,
        pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: AMBIGUOUS_PROMPT }),
      );

      expect(decision.stage).toBe('hydra_match');
      expect(decision.reason_code).toBe('hydra_embedding_match');
      expect(decision.features?.route_path).toBe('neural');
    });

    it('exports MissingWeightsFailClosedError carrying SP-251 codes', () => {
      const error = new MissingWeightsFailClosedError([HYDRA_WEIGHTS_MISSING_REASON_CODE]);
      expect(error.name).toBe('MissingWeightsFailClosedError');
      expect(error.reasonCodes).toEqual([HYDRA_WEIGHTS_MISSING_REASON_CODE]);
      expect(error.message).toContain('hydra_weights_missing');
    });
  });
});
