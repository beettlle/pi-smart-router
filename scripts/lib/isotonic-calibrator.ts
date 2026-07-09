/**
 * Offline isotonic regression calibrator for P(success) scores (SP-132).
 *
 * Pool-adjacent-violators fit on logistic baseline scores; piecewise-constant
 * mapping serialized as monotonic knot lookup tables for <5ms serve-time lookup.
 */

import {
  MIN_TRAINING_SAMPLES,
  predictPSuccessCheap,
  type LabeledTrainingSample,
  type PSuccessWeights,
} from '../../src/domain/routing/p-success-classifier.js';

export const ISOTONIC_CALIBRATOR_ARTIFACT_VERSION = 1 as const;
export const DEFAULT_ISOTONIC_HOLDOUT_FRACTION = 0.2;
export const DEFAULT_ISOTONIC_ECE_BINS = 10;
export const ISOTONIC_SPLIT_SEED = 0x5e_ed_132;

export interface IsotonicCalibratorArtifact {
  readonly version: typeof ISOTONIC_CALIBRATOR_ARTIFACT_VERSION;
  readonly min_training_samples: number;
  readonly x_knots: readonly number[];
  readonly y_knots: readonly number[];
  readonly trained_sample_count: number;
  readonly holdout_ece_raw: number | null;
  readonly holdout_ece_calibrated: number | null;
}

export interface IsotonicFitResult {
  readonly artifact: IsotonicCalibratorArtifact;
  readonly fit_sample_count: number;
  readonly holdout_sample_count: number;
}

interface ScoreLabelPair {
  readonly score: number;
  readonly label: number;
}

interface PavBlock {
  weight: number;
  sum: number;
  minScore: number;
  maxScore: number;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Deterministic split for reproducible offline calibration. */
export function splitLabeledSamplesForIsotonic(
  samples: readonly LabeledTrainingSample[],
  holdoutFraction: number = DEFAULT_ISOTONIC_HOLDOUT_FRACTION,
  seed: number = ISOTONIC_SPLIT_SEED,
): { readonly fit: readonly LabeledTrainingSample[]; readonly holdout: readonly LabeledTrainingSample[] } {
  if (samples.length === 0) {
    return { fit: [], holdout: [] };
  }

  const clampedFraction = clamp01(holdoutFraction);
  const holdoutCount =
    clampedFraction === 0
      ? 0
      : Math.max(1, Math.min(samples.length - 1, Math.round(samples.length * clampedFraction)));

  const indexed = samples.map((sample, index) => ({ sample, rank: hashSplitRank(sample.request_id, seed, index) }));
  indexed.sort((left, right) => left.rank - right.rank);

  const holdout = indexed.slice(0, holdoutCount).map((entry) => entry.sample);
  const fit = indexed.slice(holdoutCount).map((entry) => entry.sample);
  return { fit, holdout };
}

function hashSplitRank(requestId: string, seed: number, index: number): number {
  let hash = seed ^ (index * 0x9e37_79b9);
  for (let i = 0; i < requestId.length; i++) {
    hash = Math.imul(hash ^ requestId.charCodeAt(i), 0x5bd1_e995);
    hash ^= hash >>> 15;
  }
  return hash >>> 0;
}

/** Expected calibration error over [0, 1] with equal-width bins. */
export function computeExpectedCalibrationError(
  scores: readonly number[],
  labels: readonly boolean[],
  numBins: number = DEFAULT_ISOTONIC_ECE_BINS,
): number {
  if (scores.length === 0 || scores.length !== labels.length) {
    return 0;
  }

  const bins = Array.from({ length: numBins }, () => ({ count: 0, sumPred: 0, sumLabel: 0 }));
  for (let i = 0; i < scores.length; i++) {
    const score = clamp01(scores[i]!);
    const bin = Math.min(numBins - 1, Math.floor(score * numBins));
    bins[bin]!.count++;
    bins[bin]!.sumPred += score;
    bins[bin]!.sumLabel += labels[i]! ? 1 : 0;
  }

  let ece = 0;
  for (const bin of bins) {
    if (bin.count === 0) {
      continue;
    }
    const avgPred = bin.sumPred / bin.count;
    const avgLabel = bin.sumLabel / bin.count;
    ece += (bin.count / scores.length) * Math.abs(avgPred - avgLabel);
  }

  return ece;
}

/** Pool-adjacent-violators isotonic regression on sorted scores. */
export function fitIsotonicPAV(scores: readonly number[], labels: readonly boolean[]): {
  readonly x_knots: readonly number[];
  readonly y_knots: readonly number[];
} {
  if (scores.length === 0 || scores.length !== labels.length) {
    return { x_knots: [0, 1], y_knots: [0, 1] };
  }

  const pairs: ScoreLabelPair[] = scores.map((score, index) => ({
    score: clamp01(score),
    label: labels[index]! ? 1 : 0,
  }));
  pairs.sort((left, right) => left.score - right.score || left.label - right.label);

  const blocks: PavBlock[] = [];
  for (const pair of pairs) {
    blocks.push({
      weight: 1,
      sum: pair.label,
      minScore: pair.score,
      maxScore: pair.score,
    });

    while (blocks.length >= 2) {
      const previous = blocks[blocks.length - 2]!;
      const current = blocks[blocks.length - 1]!;
      const previousAvg = previous.sum / previous.weight;
      const currentAvg = current.sum / current.weight;
      if (previousAvg <= currentAvg) {
        break;
      }

      blocks[blocks.length - 2] = {
        weight: previous.weight + current.weight,
        sum: previous.sum + current.sum,
        minScore: previous.minScore,
        maxScore: current.maxScore,
      };
      blocks.pop();
    }
  }

  const x_knots: number[] = [];
  const y_knots: number[] = [];
  for (const block of blocks) {
    const avg = clamp01(block.sum / block.weight);
    pushKnot(x_knots, y_knots, block.minScore, avg);
    if (block.maxScore !== block.minScore) {
      pushKnot(x_knots, y_knots, block.maxScore, avg);
    }
  }

  return normalizeKnots(x_knots, y_knots);
}

function pushKnot(xKnots: number[], yKnots: number[], x: number, y: number): void {
  const clampedX = clamp01(x);
  const clampedY = clamp01(y);
  const lastIndex = xKnots.length - 1;
  if (lastIndex >= 0 && xKnots[lastIndex] === clampedX) {
    yKnots[lastIndex] = clampedY;
    return;
  }
  xKnots.push(clampedX);
  yKnots.push(clampedY);
}

function normalizeKnots(xKnots: number[], yKnots: number[]): {
  readonly x_knots: readonly number[];
  readonly y_knots: readonly number[];
} {
  if (xKnots.length === 0) {
    return { x_knots: [0, 1], y_knots: [0, 1] };
  }

  if (xKnots[0]! > 0) {
    xKnots.unshift(0);
    yKnots.unshift(yKnots[0]!);
  }

  const lastIndex = xKnots.length - 1;
  if (xKnots[lastIndex]! < 1) {
    xKnots.push(1);
    yKnots.push(yKnots[lastIndex]!);
  }

  for (let i = 1; i < yKnots.length; i++) {
    if (yKnots[i]! < yKnots[i - 1]!) {
      yKnots[i] = yKnots[i - 1]!;
    }
  }

  return { x_knots: xKnots, y_knots: yKnots };
}

/** Piecewise-constant isotonic lookup with O(log n) binary search on knots. */
export function applyIsotonicLookup(
  rawScore: number,
  xKnots: readonly number[],
  yKnots: readonly number[],
): number {
  if (xKnots.length === 0 || yKnots.length === 0 || xKnots.length !== yKnots.length) {
    return clamp01(rawScore);
  }

  const score = clamp01(rawScore);
  if (score <= xKnots[0]!) {
    return clamp01(yKnots[0]!);
  }

  const lastIndex = xKnots.length - 1;
  if (score >= xKnots[lastIndex]!) {
    return clamp01(yKnots[lastIndex]!);
  }

  let low = 0;
  let high = lastIndex;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (xKnots[mid]! <= score) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return clamp01(yKnots[low]!);
}

export function createDefaultIsotonicCalibratorArtifact(): IsotonicCalibratorArtifact {
  return {
    version: ISOTONIC_CALIBRATOR_ARTIFACT_VERSION,
    min_training_samples: MIN_TRAINING_SAMPLES,
    x_knots: [0, 1],
    y_knots: [0, 1],
    trained_sample_count: 0,
    holdout_ece_raw: null,
    holdout_ece_calibrated: null,
  };
}

function scoreLabeledSamples(
  samples: readonly LabeledTrainingSample[],
  weights: PSuccessWeights,
): { readonly scores: number[]; readonly labels: boolean[] } {
  const scores: number[] = [];
  const labels: boolean[] = [];

  for (const sample of samples) {
    scores.push(predictPSuccessCheap(sample.features, weights));
    labels.push(sample.success);
  }

  return { scores, labels };
}

/** Fit isotonic calibrator on a validation split and report holdout ECE. */
export function fitIsotonicCalibratorFromSamples(
  samples: readonly LabeledTrainingSample[],
  weights: PSuccessWeights,
  options?: {
    readonly holdoutFraction?: number;
    readonly minTrainingSamples?: number;
    readonly eceBins?: number;
  },
): IsotonicFitResult {
  const minTrainingSamples = options?.minTrainingSamples ?? MIN_TRAINING_SAMPLES;
  const holdoutFraction = options?.holdoutFraction ?? DEFAULT_ISOTONIC_HOLDOUT_FRACTION;
  const eceBins = options?.eceBins ?? DEFAULT_ISOTONIC_ECE_BINS;

  if (samples.length < minTrainingSamples) {
    return {
      artifact: {
        ...createDefaultIsotonicCalibratorArtifact(),
        trained_sample_count: samples.length,
      },
      fit_sample_count: 0,
      holdout_sample_count: 0,
    };
  }

  const { fit, holdout } = splitLabeledSamplesForIsotonic(samples, holdoutFraction);
  const fitScored = scoreLabeledSamples(fit, weights);
  const holdoutScored = scoreLabeledSamples(holdout, weights);

  const { x_knots, y_knots } = fitIsotonicPAV(fitScored.scores, fitScored.labels);

  const holdoutRawScores = holdoutScored.scores;
  const holdoutCalibratedScores = holdoutRawScores.map((score) =>
    applyIsotonicLookup(score, x_knots, y_knots),
  );

  const holdout_ece_raw =
    holdout.length > 0
      ? computeExpectedCalibrationError(holdoutRawScores, holdoutScored.labels, eceBins)
      : null;
  const holdout_ece_calibrated =
    holdout.length > 0
      ? computeExpectedCalibrationError(holdoutCalibratedScores, holdoutScored.labels, eceBins)
      : null;

  return {
    artifact: {
      version: ISOTONIC_CALIBRATOR_ARTIFACT_VERSION,
      min_training_samples: minTrainingSamples,
      x_knots,
      y_knots,
      trained_sample_count: samples.length,
      holdout_ece_raw,
      holdout_ece_calibrated,
    },
    fit_sample_count: fit.length,
    holdout_sample_count: holdout.length,
  };
}

/** Validate artifact shape and monotonic knot tables. */
export function validateIsotonicCalibratorArtifact(artifact: IsotonicCalibratorArtifact): void {
  if (artifact.version !== ISOTONIC_CALIBRATOR_ARTIFACT_VERSION) {
    throw new Error(`Unsupported isotonic calibrator version: ${artifact.version}`);
  }

  if (artifact.x_knots.length === 0 || artifact.y_knots.length === 0) {
    throw new Error('isotonic_calibrator knots must be non-empty');
  }

  if (artifact.x_knots.length !== artifact.y_knots.length) {
    throw new Error('isotonic_calibrator x_knots and y_knots length mismatch');
  }

  for (let i = 1; i < artifact.x_knots.length; i++) {
    if (artifact.x_knots[i]! < artifact.x_knots[i - 1]!) {
      throw new Error('isotonic_calibrator x_knots must be non-decreasing');
    }
    if (artifact.y_knots[i]! < artifact.y_knots[i - 1]!) {
      throw new Error('isotonic_calibrator y_knots must be non-decreasing');
    }
  }

  for (const knot of artifact.x_knots) {
    if (!Number.isFinite(knot) || knot < 0 || knot > 1) {
      throw new Error('isotonic_calibrator x_knots must lie in [0, 1]');
    }
  }

  for (const knot of artifact.y_knots) {
    if (!Number.isFinite(knot) || knot < 0 || knot > 1) {
      throw new Error('isotonic_calibrator y_knots must lie in [0, 1]');
    }
  }
}
