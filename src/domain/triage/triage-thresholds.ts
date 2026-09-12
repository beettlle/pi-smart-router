/**
 * Serve-time triage cyclomatic threshold loader (#171 / v1.1).
 *
 * Reads `triage_thresholds` from the routing-calibration bundle. Uses the
 * trained threshold only when sample floor is met; otherwise the honest
 * default (`CYCLOMATIC_THRESHOLD` = 15).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import {
  CYCLOMATIC_THRESHOLD,
  clampCyclomaticThreshold,
} from './triage-engine.js';

export const DEFAULT_ROUTING_CALIBRATION_PATH = resolve('config', 'routing-calibration.json');
export const DEFAULT_TRIAGE_MIN_TRAINING_SAMPLES = 50;
export const TRIAGE_THRESHOLDS_ARTIFACT_VERSION = 1 as const;

export interface TriageThresholdsArtifact {
  readonly version: typeof TRIAGE_THRESHOLDS_ARTIFACT_VERSION;
  readonly cyclomatic_threshold: number;
  readonly trained_sample_count: number;
}

export interface LoadTriageThresholdsOptions {
  readonly filePath?: string;
}

export class TriageThresholdsLoaderError extends Error {
  override readonly name = 'TriageThresholdsLoaderError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const TriageThresholdsArtifactSchema = z.object({
  version: z.literal(TRIAGE_THRESHOLDS_ARTIFACT_VERSION),
  cyclomatic_threshold: z.number().finite().min(5).max(30),
  trained_sample_count: z.number().int().min(0),
});

const BundleFloorSchema = z.object({
  minimum_training_samples: z
    .object({
      triage_thresholds: z.number().int().min(1).optional(),
    })
    .optional(),
  triage_thresholds: TriageThresholdsArtifactSchema,
});

export function isTriageThresholdsTrained(
  artifact: TriageThresholdsArtifact,
  minSamples: number = DEFAULT_TRIAGE_MIN_TRAINING_SAMPLES,
): boolean {
  return artifact.trained_sample_count >= minSamples;
}

export function createDefaultTriageThresholdsArtifact(): TriageThresholdsArtifact {
  return {
    version: TRIAGE_THRESHOLDS_ARTIFACT_VERSION,
    cyclomatic_threshold: CYCLOMATIC_THRESHOLD,
    trained_sample_count: 0,
  };
}

/** Extract triage_thresholds from a routing-calibration bundle object. */
export function parseTriageThresholdsFromBundle(parsed: unknown): {
  readonly artifact: TriageThresholdsArtifact;
  readonly minSamples: number;
} {
  const result = BundleFloorSchema.safeParse(parsed);
  if (!result.success) {
    throw new TriageThresholdsLoaderError(
      `Invalid routing-calibration triage_thresholds: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const minSamples =
    result.data.minimum_training_samples?.triage_thresholds ??
    DEFAULT_TRIAGE_MIN_TRAINING_SAMPLES;
  return {
    artifact: result.data.triage_thresholds,
    minSamples,
  };
}

/**
 * Load triage thresholds from routing-calibration bundle on disk.
 * Returns null when the file is missing (caller uses default).
 */
export function loadTriageThresholds(
  options?: LoadTriageThresholdsOptions,
): { readonly artifact: TriageThresholdsArtifact; readonly minSamples: number } | null {
  const filePath = options?.filePath ?? DEFAULT_ROUTING_CALIBRATION_PATH;
  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TriageThresholdsLoaderError(`Failed to read routing calibration file: ${message}`, {
      cause: err,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TriageThresholdsLoaderError(`Failed to parse routing calibration JSON: ${message}`, {
      cause: err,
    });
  }

  return parseTriageThresholdsFromBundle(parsed);
}

/**
 * Resolve the cyclomatic threshold used at serve time.
 * Trained bundle values apply only when the sample floor is met.
 */
export function resolveTriageCyclomaticThreshold(
  options?: LoadTriageThresholdsOptions & {
    readonly override?: number;
  },
): number {
  if (options?.override !== undefined) {
    return clampCyclomaticThreshold(options.override);
  }

  const loaded = loadTriageThresholds(
    options?.filePath !== undefined ? { filePath: options.filePath } : undefined,
  );
  if (loaded === null) {
    return CYCLOMATIC_THRESHOLD;
  }

  if (!isTriageThresholdsTrained(loaded.artifact, loaded.minSamples)) {
    return CYCLOMATIC_THRESHOLD;
  }

  return clampCyclomaticThreshold(loaded.artifact.cyclomatic_threshold);
}
