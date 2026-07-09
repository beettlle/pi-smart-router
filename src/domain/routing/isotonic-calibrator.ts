/**
 * Online isotonic P(success) calibrator for low_intensity gate (SP-133).
 *
 * Loads monotonic knot tables from routing-calibration bundle at serve time.
 * O(log n) binary search lookup with <5ms budget; falls back to raw logistic
 * when the artifact is missing or under-trained.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { MIN_TRAINING_SAMPLES } from './p-success-classifier.js';

export const ISOTONIC_CALIBRATOR_ARTIFACT_VERSION = 1 as const;
export const ISOTONIC_LOOKUP_BUDGET_MS = 5;
export const DEFAULT_ROUTING_CALIBRATION_PATH = resolve('config', 'routing-calibration.json');

export interface IsotonicCalibratorArtifact {
  readonly version: typeof ISOTONIC_CALIBRATOR_ARTIFACT_VERSION;
  readonly min_training_samples: number;
  readonly x_knots: readonly number[];
  readonly y_knots: readonly number[];
  readonly trained_sample_count: number;
  readonly holdout_ece_raw: number | null;
  readonly holdout_ece_calibrated: number | null;
}

export interface IsotonicCalibratorResult {
  readonly calibrated: number;
  readonly elapsed_ms: number;
  readonly within_budget: boolean;
  readonly calibration_applied: boolean;
}

export interface LoadIsotonicCalibratorOptions {
  readonly filePath?: string;
}

export class IsotonicCalibratorLoaderError extends Error {
  override readonly name = 'IsotonicCalibratorLoaderError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const IsotonicCalibratorArtifactSchema = z.object({
  version: z.literal(ISOTONIC_CALIBRATOR_ARTIFACT_VERSION),
  min_training_samples: z.number().int().min(0),
  x_knots: z.array(z.number().finite().min(0).max(1)).min(2),
  y_knots: z.array(z.number().finite().min(0).max(1)).min(2),
  trained_sample_count: z.number().int().min(0),
  holdout_ece_raw: z.number().finite().min(0).max(1).nullable(),
  holdout_ece_calibrated: z.number().finite().min(0).max(1).nullable(),
});

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function formatZodIssues(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
}

/** True when artifact has enough labeled samples for serve-time calibration. */
export function isIsotonicCalibratorTrained(artifact: IsotonicCalibratorArtifact): boolean {
  return artifact.trained_sample_count >= artifact.min_training_samples;
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

/**
 * Apply isotonic calibration to a raw logistic P(success) score.
 * Returns the raw score when the artifact is missing or under-trained.
 */
export function applyIsotonicCalibrator(
  rawScore: number,
  artifact: IsotonicCalibratorArtifact | null,
): number {
  if (artifact === null || !isIsotonicCalibratorTrained(artifact)) {
    return clamp01(rawScore);
  }

  return applyIsotonicLookup(rawScore, artifact.x_knots, artifact.y_knots);
}

/** Apply isotonic calibration with elapsed timing guard for the online routing budget. */
export function applyIsotonicCalibratorTimed(
  rawScore: number,
  artifact: IsotonicCalibratorArtifact | null,
  budgetMs: number = ISOTONIC_LOOKUP_BUDGET_MS,
): IsotonicCalibratorResult {
  const start = performance.now();
  const calibration_applied = artifact !== null && isIsotonicCalibratorTrained(artifact);
  const calibrated = applyIsotonicCalibrator(rawScore, artifact);
  const elapsed_ms = performance.now() - start;

  if (elapsed_ms > budgetMs) {
    console.warn('Isotonic P(success) lookup exceeded latency budget', {
      elapsed_ms,
      budget_ms: budgetMs,
      knot_count: artifact?.x_knots.length ?? 0,
    });
  }

  return {
    calibrated,
    elapsed_ms,
    within_budget: elapsed_ms <= budgetMs,
    calibration_applied,
  };
}

/** Parse and validate an isotonic calibrator artifact from JSON text. */
export function parseIsotonicCalibratorJson(raw: string): IsotonicCalibratorArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new IsotonicCalibratorLoaderError(`Failed to parse JSON: ${message}`, { cause: err });
  }

  const result = IsotonicCalibratorArtifactSchema.safeParse(parsed);
  if (!result.success) {
    throw new IsotonicCalibratorLoaderError(
      `Invalid isotonic calibrator artifact:\n${formatZodIssues(result.error)}`,
      { cause: result.error },
    );
  }

  return result.data;
}

/** Extract isotonic_calibrator from a routing-calibration bundle object. */
export function parseIsotonicCalibratorFromBundle(parsed: unknown): IsotonicCalibratorArtifact {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new IsotonicCalibratorLoaderError('Routing calibration bundle must be a JSON object');
  }

  const isotonic = (parsed as Record<string, unknown>).isotonic_calibrator;
  if (isotonic === undefined) {
    throw new IsotonicCalibratorLoaderError('Routing calibration bundle missing isotonic_calibrator');
  }

  const result = IsotonicCalibratorArtifactSchema.safeParse(isotonic);
  if (!result.success) {
    throw new IsotonicCalibratorLoaderError(
      `Invalid isotonic_calibrator in routing calibration bundle:\n${formatZodIssues(result.error)}`,
      { cause: result.error },
    );
  }

  return result.data;
}

/**
 * Load isotonic calibrator from routing-calibration bundle on disk.
 * Returns null when the bundle file is missing.
 */
export function loadIsotonicCalibrator(
  options?: LoadIsotonicCalibratorOptions,
): IsotonicCalibratorArtifact | null {
  const filePath = options?.filePath ?? DEFAULT_ROUTING_CALIBRATION_PATH;

  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new IsotonicCalibratorLoaderError(`Failed to read routing calibration file: ${message}`, {
      cause: err,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new IsotonicCalibratorLoaderError(`Failed to parse routing calibration JSON: ${message}`, {
      cause: err,
    });
  }

  return parseIsotonicCalibratorFromBundle(parsed);
}

/** Resolve calibrator for online inference — missing or invalid artifacts fall back safely. */
export function resolveIsotonicCalibrator(
  options?: LoadIsotonicCalibratorOptions,
): IsotonicCalibratorArtifact | null {
  try {
    return loadIsotonicCalibrator(options);
  } catch (err: unknown) {
    console.warn('Isotonic calibrator artifact invalid; using raw logistic fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
