import { describe, expect, it } from 'vitest';

import {
  applyIsotonicLookup,
  computeExpectedCalibrationError,
  createDefaultIsotonicCalibratorArtifact,
  fitIsotonicCalibratorFromSamples,
  fitIsotonicPAV,
  splitLabeledSamplesForIsotonic,
  validateIsotonicCalibratorArtifact,
} from '../../scripts/lib/isotonic-calibrator.js';
import {
  createDefaultPSuccessWeights,
  extractPSuccessFeatures,
  trainFromLabeledSamples,
  type LabeledTrainingSample,
} from '../../src/domain/routing/p-success-classifier.js';

function makeSample(
  requestId: string,
  success: boolean,
  overrides: Record<string, unknown> = {},
): LabeledTrainingSample {
  return {
    request_id: requestId,
    features: extractPSuccessFeatures({
      prompt_length_chars: 200,
      estimated_input_tokens: 50,
      triage_cyclomatic_score: 0.2,
      requirement_reasoning: 0.4,
      requirement_code_gen: 0.5,
      requirement_tool_use: 0.1,
      has_tool_context: false,
      compaction_flag: false,
      routing_latency_ms: 12,
      tier: 'economical-cloud',
      ...overrides,
    }),
    success,
    outcome_signals: success ? ['feedback_good'] : ['feedback_bad'],
    failure_proxies: {
      tool_failure_chain_count: null,
      stop_reason_invalid: null,
      reprompt_rate: null,
      edit_distance_proxy: null,
    },
  };
}

describe('isotonic calibrator (SP-132)', () => {
  it('fits monotonic PAV mapping on sorted scores', () => {
    const scores = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const labels = [false, false, true, false, true, true];
    const { x_knots, y_knots } = fitIsotonicPAV(scores, labels);

    expect(x_knots.length).toBeGreaterThanOrEqual(2);
    expect(x_knots.length).toBe(y_knots.length);
    for (let i = 1; i < x_knots.length; i++) {
      expect(x_knots[i]!).toBeGreaterThanOrEqual(x_knots[i - 1]!);
      expect(y_knots[i]!).toBeGreaterThanOrEqual(y_knots[i - 1]!);
    }
  });

  it('applies piecewise lookup with endpoint clamping', () => {
    const xKnots = [0, 0.5, 1];
    const yKnots = [0.1, 0.6, 0.9];

    expect(applyIsotonicLookup(-0.2, xKnots, yKnots)).toBeCloseTo(0.1);
    expect(applyIsotonicLookup(0.25, xKnots, yKnots)).toBeCloseTo(0.1);
    expect(applyIsotonicLookup(0.75, xKnots, yKnots)).toBeCloseTo(0.6);
    expect(applyIsotonicLookup(1.5, xKnots, yKnots)).toBeCloseTo(0.9);
  });

  it('computes expected calibration error in [0, 1]', () => {
    const scores = [0.1, 0.2, 0.8, 0.9];
    const labels = [false, false, true, true];
    const ece = computeExpectedCalibrationError(scores, labels, 4);
    expect(ece).toBeGreaterThanOrEqual(0);
    expect(ece).toBeLessThanOrEqual(1);
  });

  it('splits labeled samples deterministically for holdout evaluation', () => {
    const samples = Array.from({ length: 10 }, (_, index) =>
      makeSample(`req-${index}`, index % 2 === 0),
    );
    const first = splitLabeledSamplesForIsotonic(samples);
    const second = splitLabeledSamplesForIsotonic(samples);

    expect(first.fit.length + first.holdout.length).toBe(samples.length);
    expect(first.holdout.map((sample) => sample.request_id)).toEqual(
      second.holdout.map((sample) => sample.request_id),
    );
  });

  it('returns identity default artifact when training data is insufficient', () => {
    const samples = Array.from({ length: 5 }, (_, index) =>
      makeSample(`req-${index}`, index % 2 === 0),
    );
    const weights = createDefaultPSuccessWeights();
    const result = fitIsotonicCalibratorFromSamples(samples, weights);

    expect(result.artifact.trained_sample_count).toBe(5);
    expect(result.artifact.x_knots).toEqual([0, 1]);
    expect(result.artifact.y_knots).toEqual([0, 1]);
    expect(result.artifact.holdout_ece_raw).toBeNull();
  });

  it('fits calibrator and reports holdout ECE when enough samples exist', () => {
    const samples = Array.from({ length: 40 }, (_, index) =>
      makeSample(`req-${index}`, index % 3 !== 0, {
        triage_cyclomatic_score: index / 40,
        requirement_reasoning: (index % 5) / 5,
      }),
    );
    const weights = trainFromLabeledSamples(samples);
    const result = fitIsotonicCalibratorFromSamples(samples, weights);

    validateIsotonicCalibratorArtifact(result.artifact);
    expect(result.artifact.trained_sample_count).toBe(40);
    expect(result.holdout_sample_count).toBeGreaterThan(0);
    expect(result.artifact.holdout_ece_raw).not.toBeNull();
    expect(result.artifact.holdout_ece_calibrated).not.toBeNull();
  });

  it('validates default artifact shape', () => {
    expect(() => validateIsotonicCalibratorArtifact(createDefaultIsotonicCalibratorArtifact())).not.toThrow();
  });

  it('rejects non-monotonic knot tables', () => {
    const invalid = {
      ...createDefaultIsotonicCalibratorArtifact(),
      x_knots: [0, 0.5, 0.25, 1],
      y_knots: [0, 0.5, 0.75, 1],
    };
    expect(() => validateIsotonicCalibratorArtifact(invalid)).toThrow(/non-decreasing/);
  });
});
