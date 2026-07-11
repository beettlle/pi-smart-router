import { chmod } from 'node:fs/promises';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

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
  applyIsotonicCalibrator,
  applyIsotonicCalibratorTimed,
  ISOTONIC_LOOKUP_BUDGET_MS,
  IsotonicCalibratorLoaderError,
  loadIsotonicCalibrator,
  parseIsotonicCalibratorFromBundle,
  parseIsotonicCalibratorJson,
  resolveIsotonicCalibrator,
} from '../../src/domain/routing/isotonic-calibrator.js';
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

describe('isotonic calibrator runtime lookup (SP-133)', () => {
  it('loads isotonic knots from routing-calibration bundle JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'isotonic-runtime-'));
    const bundlePath = join(dir, 'routing-calibration.json');
    const bundle = {
      version: 2,
      isotonic_calibrator: {
        version: 1,
        min_training_samples: 30,
        x_knots: [0, 0.4, 1],
        y_knots: [0.1, 0.8, 0.8],
        trained_sample_count: 40,
        holdout_ece_raw: 0.12,
        holdout_ece_calibrated: 0.05,
      },
    };
    await writeFile(bundlePath, JSON.stringify(bundle), 'utf8');

    const artifact = loadIsotonicCalibrator({ filePath: bundlePath });
    expect(artifact).not.toBeNull();
    expect(parseIsotonicCalibratorFromBundle(JSON.parse(await readFile(bundlePath, 'utf8')))).toEqual(
      artifact,
    );

    expect(applyIsotonicCalibrator(0.2, artifact)).toBeCloseTo(0.1);
    expect(applyIsotonicCalibrator(0.5, artifact)).toBeCloseTo(0.8);

    const timed = applyIsotonicCalibratorTimed(0.5, artifact);
    expect(timed.calibrated).toBeCloseTo(0.8);
    expect(timed.calibration_applied).toBe(true);
    expect(timed.within_budget).toBe(true);
  });

  it('falls back to raw logistic when bundle artifact is missing or under-trained', () => {
    expect(loadIsotonicCalibrator({ filePath: '/nonexistent/routing-calibration.json' })).toBeNull();
    expect(applyIsotonicCalibrator(0.42, null)).toBeCloseTo(0.42);

    const untrained = {
      ...createDefaultIsotonicCalibratorArtifact(),
      trained_sample_count: 5,
    };
    expect(applyIsotonicCalibrator(0.42, untrained)).toBeCloseTo(0.42);
  });

  it('keeps monotonic lookup under the online latency budget', () => {
    // Wall-clock: assert p95 ≤ budget after warmup. Per-sample asserts flake on
    // contended CI runners even when the O(log n) lookup is well under budget.
    const artifact = {
      version: 1 as const,
      min_training_samples: 30,
      x_knots: Array.from({ length: 256 }, (_, index) => index / 255),
      y_knots: Array.from({ length: 256 }, (_, index) => index / 255),
      trained_sample_count: 100,
      holdout_ece_raw: null,
      holdout_ece_calibrated: null,
    };

    const sampleCount = 1_000;
    for (let index = 0; index < 50; index++) {
      applyIsotonicCalibratorTimed(index / 50, artifact);
    }

    const elapsedMs: number[] = [];
    let previous = 0;
    for (let index = 0; index < sampleCount; index++) {
      const raw = index / sampleCount;
      const result = applyIsotonicCalibratorTimed(raw, artifact);
      expect(result.calibrated).toBeGreaterThanOrEqual(0);
      expect(result.calibrated).toBeLessThanOrEqual(1);
      expect(result.calibrated).toBeGreaterThanOrEqual(previous);
      expect(result.calibration_applied).toBe(true);
      previous = result.calibrated;
      elapsedMs.push(result.elapsed_ms);
    }

    elapsedMs.sort((left, right) => left - right);
    const p95Index = Math.min(elapsedMs.length - 1, Math.floor(elapsedMs.length * 0.95));
    expect(elapsedMs[p95Index]).toBeLessThanOrEqual(ISOTONIC_LOOKUP_BUDGET_MS);
  });

  it('reports within_budget from elapsed timing (mocked clock)', () => {
    const artifact = {
      version: 1 as const,
      min_training_samples: 30,
      x_knots: [0, 1],
      y_knots: [0, 1],
      trained_sample_count: 100,
      holdout_ece_raw: null,
      holdout_ece_calibrated: null,
    };

    const withinSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(101);
    expect(applyIsotonicCalibratorTimed(0.5, artifact).within_budget).toBe(true);
    withinSpy.mockRestore();

    const overSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(106);
    expect(applyIsotonicCalibratorTimed(0.5, artifact).within_budget).toBe(false);
    overSpy.mockRestore();
  });

  it('rejects malformed JSON and invalid artifact schema', () => {
    expect(() => parseIsotonicCalibratorJson('{not json')).toThrow(IsotonicCalibratorLoaderError);
    expect(() => parseIsotonicCalibratorJson('{not json')).toThrow(/Failed to parse JSON/);

    expect(() =>
      parseIsotonicCalibratorJson(
        JSON.stringify({
          version: 1,
          min_training_samples: 30,
          x_knots: [0],
          y_knots: [0, 1],
          trained_sample_count: 40,
          holdout_ece_raw: null,
          holdout_ece_calibrated: null,
        }),
      ),
    ).toThrow(/Invalid isotonic calibrator artifact/);
  });

  it('rejects routing-calibration bundles missing or with invalid isotonic_calibrator', () => {
    expect(() => parseIsotonicCalibratorFromBundle(null)).toThrow(/must be a JSON object/);
    expect(() => parseIsotonicCalibratorFromBundle({ version: 2 })).toThrow(
      /missing isotonic_calibrator/,
    );
    expect(() =>
      parseIsotonicCalibratorFromBundle({
        version: 2,
        isotonic_calibrator: { version: 2, x_knots: [0, 1], y_knots: [0, 1] },
      }),
    ).toThrow(/Invalid isotonic_calibrator/);
  });

  it('throws when bundle file exists but JSON is invalid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'isotonic-runtime-bad-'));
    const bundlePath = join(dir, 'routing-calibration.json');
    await writeFile(bundlePath, '{broken', 'utf8');

    expect(() => loadIsotonicCalibrator({ filePath: bundlePath })).toThrow(
      IsotonicCalibratorLoaderError,
    );
    expect(() => loadIsotonicCalibrator({ filePath: bundlePath })).toThrow(
      /Failed to parse routing calibration JSON/,
    );
  });

  it('throws when bundle omits isotonic_calibrator key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'isotonic-runtime-missing-'));
    const bundlePath = join(dir, 'routing-calibration.json');
    await writeFile(bundlePath, JSON.stringify({ version: 2 }), 'utf8');

    expect(() => loadIsotonicCalibrator({ filePath: bundlePath })).toThrow(
      /missing isotonic_calibrator/,
    );
  });

  it('resolveIsotonicCalibrator returns null and warns on invalid on-disk artifact', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'isotonic-runtime-resolve-'));
    const bundlePath = join(dir, 'routing-calibration.json');
    await writeFile(bundlePath, JSON.stringify({ version: 2, isotonic_calibrator: 'bad' }), 'utf8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveIsotonicCalibrator({ filePath: bundlePath })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Isotonic calibrator artifact invalid; using raw logistic fallback',
      expect.objectContaining({ error: expect.stringContaining('Invalid isotonic_calibrator') }),
    );

    warnSpy.mockRestore();
  });

  it('throws when bundle file is unreadable', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), 'isotonic-runtime-unreadable-'));
    const bundlePath = join(dir, 'routing-calibration.json');
    await writeFile(bundlePath, JSON.stringify({ version: 2 }), 'utf8');
    await chmod(bundlePath, 0o000);

    try {
      expect(() => loadIsotonicCalibrator({ filePath: bundlePath })).toThrow(
        /Failed to read routing calibration file/,
      );
    } finally {
      await chmod(bundlePath, 0o644);
    }
  });
});
