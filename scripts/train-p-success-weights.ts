#!/usr/bin/env node
/**
 * Train standalone P(success) weights for dogfood / install-local reload (SP-175).
 *
 * Reads privacy-safe labeled JSONL (feature vectors + outcome labels only — never
 * prompt text). Writes `config/p-success-weights.json` when sample count meets
 * `MIN_TRAINING_SAMPLES`. Optionally merges isotonic into routing-calibration.json.
 *
 * Default input: scripts/fixtures/p-success-synthetic-train.jsonl (synthetic provenance).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  MIN_TRAINING_SAMPLES,
  parseTrainingExportLine,
  trainFromLabeledSamples,
  type LabeledTrainingSample,
  type PSuccessWeights,
} from '../src/domain/routing/p-success-classifier.js';
import {
  fitIsotonicCalibratorFromSamples,
  type IsotonicCalibratorArtifact,
} from './lib/isotonic-calibrator.js';

export const DEFAULT_P_SUCCESS_WEIGHTS_PATH = resolve('config', 'p-success-weights.json');
export const DEFAULT_SYNTHETIC_TRAIN_INPUT = resolve(
  'scripts',
  'fixtures',
  'p-success-synthetic-train.jsonl',
);
export const DEFAULT_ROUTING_CALIBRATION_PATH = resolve('config', 'routing-calibration.json');

export class PSuccessTrainError extends Error {
  override readonly name = 'PSuccessTrainError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface TrainPSuccessWeightsResult {
  readonly weights: PSuccessWeights;
  readonly isotonic: IsotonicCalibratorArtifact;
  readonly sample_count: number;
  readonly isotonic_fit_sample_count: number;
  readonly isotonic_holdout_sample_count: number;
}

/** Parse labeled JSONL export/contrib lines into training samples. */
export function parseLabeledJsonl(text: string): LabeledTrainingSample[] {
  return text
    .split('\n')
    .map((line) => parseTrainingExportLine(line))
    .filter((sample): sample is LabeledTrainingSample => sample !== null);
}

/** Train logistic weights + isotonic calibrator from labeled samples. */
export function trainPSuccessArtifacts(
  samples: readonly LabeledTrainingSample[],
): TrainPSuccessWeightsResult {
  const weights = trainFromLabeledSamples(samples);
  const isotonicFit = fitIsotonicCalibratorFromSamples(samples, weights);
  return {
    weights,
    isotonic: isotonicFit.artifact,
    sample_count: samples.length,
    isotonic_fit_sample_count: isotonicFit.fit_sample_count,
    isotonic_holdout_sample_count: isotonicFit.holdout_sample_count,
  };
}

/**
 * Merge trained P(success) + isotonic into an existing calibration bundle object.
 * Leaves hydra / triage / centroids unchanged.
 */
export function mergePSuccessIntoCalibrationJson(
  bundle: Record<string, unknown>,
  trained: TrainPSuccessWeightsResult,
): Record<string, unknown> {
  return {
    ...bundle,
    p_success_weights: trained.weights,
    isotonic_calibrator: trained.isotonic,
  };
}

function usage(): void {
  console.error(
    [
      'Usage: npm run routing:train-p-success -- [options]',
      '',
      'Options:',
      '  --input <path>              Labeled JSONL (default: scripts/fixtures/p-success-synthetic-train.jsonl)',
      '  --output <path>             Weights output (default: config/p-success-weights.json)',
      '  --calibration-output <path> Also merge isotonic into routing-calibration.json',
      '  -h, --help                  Show this help',
      '',
      'Trains from feature vectors + labels only — never reads prompt text.',
      `Requires ≥${MIN_TRAINING_SAMPLES} labeled samples for non-neutral dogfood weights.`,
    ].join('\n'),
  );
}

function readInputText(inputPath: string): string {
  if (!existsSync(inputPath)) {
    throw new PSuccessTrainError(`Input not found: ${inputPath}`);
  }
  return readFileSync(inputPath, 'utf8');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  let inputPath = DEFAULT_SYNTHETIC_TRAIN_INPUT;
  let outputPath = DEFAULT_P_SUCCESS_WEIGHTS_PATH;
  let calibrationOutputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--input') {
      const next = args[i + 1];
      if (!next) {
        throw new PSuccessTrainError('--input requires a path');
      }
      inputPath = resolve(next);
      i++;
      continue;
    }
    if (arg === '--output') {
      const next = args[i + 1];
      if (!next) {
        throw new PSuccessTrainError('--output requires a path');
      }
      outputPath = resolve(next);
      i++;
      continue;
    }
    if (arg === '--calibration-output') {
      const next = args[i + 1];
      if (!next) {
        throw new PSuccessTrainError('--calibration-output requires a path');
      }
      calibrationOutputPath = resolve(next);
      i++;
      continue;
    }
    throw new PSuccessTrainError(`Unknown argument: ${arg}`);
  }

  const text = readInputText(inputPath);
  const samples = parseLabeledJsonl(text);
  if (samples.length < MIN_TRAINING_SAMPLES) {
    throw new PSuccessTrainError(
      `Need ≥${MIN_TRAINING_SAMPLES} labeled samples; got ${samples.length} from ${inputPath}`,
    );
  }

  const trained = trainPSuccessArtifacts(samples);
  const artifact = {
    ...trained.weights,
    // Human-readable provenance; stripped by Zod on load (not part of serve schema).
    provenance: {
      source: inputPath.includes('p-success-synthetic-train')
        ? 'synthetic_fixture'
        : 'operator_export',
      task: 'SP-175',
      note: 'Privacy-safe feature vectors + labels only; no prompt text.',
      trained_at: new Date().toISOString().slice(0, 10),
    },
  };

  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.error(
    `train-p-success-weights: wrote ${trained.weights.trained_sample_count} sample weights to ${outputPath}`,
  );

  if (calibrationOutputPath !== undefined) {
    if (!existsSync(calibrationOutputPath)) {
      throw new PSuccessTrainError(
        `Calibration bundle not found: ${calibrationOutputPath}. Copy config/routing-calibration.json.example first, or run npm run routing:train-calibration.`,
      );
    }
    const parsed = JSON.parse(readFileSync(calibrationOutputPath, 'utf8')) as Record<string, unknown>;
    const merged = mergePSuccessIntoCalibrationJson(parsed, trained);
    writeFileSync(calibrationOutputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    console.error(
      `train-p-success-weights: wrote isotonic (samples=${trained.isotonic.trained_sample_count}) into ${calibrationOutputPath}`,
    );
    if (
      trained.isotonic.holdout_ece_raw !== null &&
      trained.isotonic.holdout_ece_calibrated !== null
    ) {
      console.error(
        `  isotonic holdout ECE: raw=${trained.isotonic.holdout_ece_raw.toFixed(4)},`,
        `calibrated=${trained.isotonic.holdout_ece_calibrated.toFixed(4)},`,
        `fit=${trained.isotonic_fit_sample_count},`,
        `holdout=${trained.isotonic_holdout_sample_count}`,
      );
    }
  } else {
    console.error(
      'train-p-success-weights: isotonic not written (pass --calibration-output to merge into an existing routing-calibration.json)',
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`train-p-success-weights failed: ${message}`);
    process.exit(1);
  });
}
