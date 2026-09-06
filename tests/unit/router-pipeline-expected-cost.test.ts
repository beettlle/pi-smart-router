// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/routing/isotonic-calibrator.ts online gate (SP-133)
// and src/domain/routing/expected-cost.ts tier selection (SP-106).
import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import type { IsotonicCalibratorArtifact } from '../../src/domain/routing/isotonic-calibrator.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import { makeHighPWeights, makeLowPWeights, makeModel, makeRequest } from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('isotonic P(success) calibration (SP-133)', () => {
    const pricedFleet: ModelProfile[] = [
      makeModel({
        id: 'econ-priced',
        tier: 'economical-cloud',
        pricing: { fallback_cost_per_1m: 0.5 },
      }),
      makeModel({
        id: 'frontier-priced',
        tier: 'frontier-cloud',
        pricing: { fallback_cost_per_1m: 3.0 },
      }),
    ];

    function makeBoostingCalibrator(): IsotonicCalibratorArtifact {
      return {
        version: 1,
        min_training_samples: 30,
        x_knots: [0, 0.5, 1],
        y_knots: [0.99, 0.99, 0.99],
        trained_sample_count: 40,
        holdout_ece_raw: 0.1,
        holdout_ece_calibrated: 0.05,
      };
    }

    it('uses calibrated score for gate thresholding and exposes raw + calibrated telemetry', async () => {
      const pipeline = new RouterPipeline(pricedFleet, {
        pSuccessWeights: makeLowPWeights(),
        isotonicCalibrator: makeBoostingCalibrator(),
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

      expect(decision.features?.p_success_raw).toBeLessThan(0.5);
      expect(decision.features?.p_success_calibrated).toBeGreaterThanOrEqual(0.5);
      expect(decision.features?.p_success_cheap).toBe(decision.features?.p_success_calibrated);
      expect(decision.features?.tier_hint).toBe('economical-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('expected_cost_economical_cloud');
    });

    it('falls back to raw logistic when calibrator artifact is missing', async () => {
      const pipeline = new RouterPipeline(pricedFleet, {
        pSuccessWeights: makeLowPWeights(),
        isotonicCalibrator: null,
        routingCalibrationPath: '/nonexistent/routing-calibration.json',
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

      expect(decision.features?.p_success_raw).toBeLessThan(0.5);
      expect(decision.features?.p_success_calibrated).toBe(decision.features?.p_success_raw);
      expect(decision.features?.p_success_cheap).toBe(decision.features?.p_success_raw);
      expect(decision.features?.tier_hint).toBe('frontier-cloud');
    });
  });

  describe('expected-cost tier selection (SP-106)', () => {
    const pricedFleet: ModelProfile[] = [
      makeModel({
        id: 'econ-priced',
        tier: 'economical-cloud',
        pricing: { fallback_cost_per_1m: 0.5 },
      }),
      makeModel({
        id: 'frontier-priced',
        tier: 'frontier-cloud',
        pricing: { fallback_cost_per_1m: 3.0 },
      }),
    ];

    it('selects economical tier when P is high and price delta is significant', async () => {
      const pipeline = new RouterPipeline(pricedFleet, {
        pSuccessWeights: makeHighPWeights(),
        lowIntensityConfig: DEFAULT_OPERATOR_CONFIG.low_intensity,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.tier_hint).toBe('economical-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('expected_cost_economical_cloud');
      expect(
        decision.features?.candidates?.some(
          (candidate) => candidate.model_id === '__expected_cost_economical-cloud__',
        ),
      ).toBe(true);
    });

    it('selects frontier when P is low even if economical per-token cost is lower', async () => {
      const pipeline = new RouterPipeline(pricedFleet, {
        pSuccessWeights: makeLowPWeights(),
        lowIntensityConfig: DEFAULT_OPERATOR_CONFIG.low_intensity,
      });

      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Hello, how are you today?' }),
      );

      expect(decision.features?.tier_hint).toBe('frontier-cloud');
      expect(decision.features?.tier_hint_reason_code).toBe('expected_cost_frontier_cloud');
    });
  });
});
