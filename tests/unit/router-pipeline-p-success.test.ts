// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/routing/p-success-classifier.ts online inference via
// the pipeline (SP-105) and the expected-cost explain logging gate (SP-223, #138).
import { describe, expect, it, vi } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import {
  fleet,
  makeClusterMatcher,
  makeHighPWeights,
  makeLowPWeights,
  makeRequest,
} from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('P(success) online inference (SP-105)', () => {
    it('records P_success when trained weights are available', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: makeHighPWeights(),
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.9,
          low_threshold: 0.1,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_cheap).toBeGreaterThanOrEqual(0.5);
      expect(decision.features?.p_success_alpha).toBe(0.5);
      expect(decision.features?.tier_hint_reason_code).toMatch(/^expected_cost_/);
    });

    describe('expected-cost explain logging gate (SP-223, #138)', () => {
      function makeGatePipeline(): RouterPipeline {
        return new RouterPipeline(fleet, {
          pSuccessWeights: makeHighPWeights(),
          lowIntensityConfig: {
            ...DEFAULT_OPERATOR_CONFIG.low_intensity,
            high_threshold: 0.9,
            low_threshold: 0.1,
            p_success_alpha: 0.5,
          },
        });
      }

      it('does not emit Expected-cost tier gate stdout by default', async () => {
        delete process.env.SMART_ROUTER_LOG_ROUTING;
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        try {
          const pipeline = makeGatePipeline();
          await pipeline.route(
            makeRequest({ prompt_text: 'Hello, how are you today?' }),
          );
          expect(infoSpy).not.toHaveBeenCalledWith(
            'Expected-cost tier gate',
            expect.anything(),
          );
        } finally {
          infoSpy.mockRestore();
        }
      });

      it('emits Expected-cost tier gate explain when SMART_ROUTER_LOG_ROUTING=1', async () => {
        process.env.SMART_ROUTER_LOG_ROUTING = '1';
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        try {
          const pipeline = makeGatePipeline();
          await pipeline.route(
            makeRequest({ prompt_text: 'Hello, how are you today?' }),
          );
          expect(infoSpy).toHaveBeenCalledWith(
            'Expected-cost tier gate',
            expect.objectContaining({
              p_success_cheap: expect.any(Number),
              chosen_tier: expect.anything(),
              expected_cost_by_tier: expect.any(Array),
            }),
          );
        } finally {
          infoSpy.mockRestore();
          delete process.env.SMART_ROUTER_LOG_ROUTING;
        }
      });
    });

    it('routes frontier when P_success is below alpha and structural score is low', async () => {
      const clusterMatcher = makeClusterMatcher({
        clusterId: 'architecture',
        tierBias: 'frontier-cloud',
        similarity: 0.9,
        margin: 0.1,
        confidence: 'high',
        elapsedMs: 1,
      });

      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: makeLowPWeights(),
        clusterMatcher,
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          low_threshold: 0.55,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({
          prompt_text:
            'Plan the architecture for a distributed payment service with migration strategy',
          turn_type: 'main_loop',
        }),
      );

      expect(decision.features?.p_success_cheap).toBeLessThan(0.5);
      expect(decision.features?.tier_hint).toBe('frontier-cloud');
      expect(decision.stage).toBe('triage');
    });

    it('biases frontier when P_success is low and expected cost favors frontier', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeights: makeLowPWeights(),
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.1,
          low_threshold: 0.05,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_cheap).toBeLessThan(0.5);
      expect(decision.features?.tier_hint).toBe('frontier-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('expected_cost_frontier_cloud');
    });

    it('falls back to structural scoring when weights artifact is untrained', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeightsPath: '/nonexistent/p-success-weights.json',
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.9,
          low_threshold: 0.1,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_cheap).toBe(0.5);
      expect(decision.features?.tier_hint).toBeNull();
      expect(decision.features?.tier_hint_reason_code).toBeNull();
    });

    it('loads shipped dogfood weights and exposes raw vs used P(success) (SP-175)', async () => {
      const pipeline = new RouterPipeline(fleet, {
        pSuccessWeightsPath: 'config/p-success-weights.json',
        lowIntensityConfig: {
          ...DEFAULT_OPERATOR_CONFIG.low_intensity,
          high_threshold: 0.9,
          low_threshold: 0.1,
          p_success_alpha: 0.5,
        },
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.p_success_raw).not.toBeNull();
      expect(decision.features?.p_success_calibrated).not.toBeNull();
      expect(decision.features?.p_success_cheap).not.toBeNull();
      expect(decision.features?.p_success_cheap).not.toBe(0.5);
      expect(decision.features?.p_success_cheap).toBe(decision.features?.p_success_calibrated);
      expect(decision.features?.p_success_raw).toBe(decision.features?.p_success_calibrated);
      expect(decision.features?.tier_hint_reason_code).toMatch(/^expected_cost_/);
    });
  });
});
