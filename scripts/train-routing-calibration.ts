#!/usr/bin/env node
/**
 * Offline routing calibration training — SP-117, GitHub #66 (stages 3–5).
 *
 * Trains lightweight models from validated feature-vector JSONL (no prompt text):
 * - P(success) logistic regression
 * - Triage cyclomatic threshold fit
 * - HyDRA 384×3 linear projection (when embedding vectors are present)
 * - Routing cluster centroids (from bootstrap artifact or defaults)
 *
 * SP-139 recalibration: after SP-138 extends the HyDRA encoder to a seven-flag
 * metadata prefix, operators must re-run this script on contrib rows whose
 * `hydra_prefix_schema_version` is >= 2 (or seven-flag metadata scalars are present).
 * Embeddings from the legacy four-flag prefix are excluded from projection training;
 * runtime rejects hydra_projection artifacts below `HYDRA_PROJECTION_ARTIFACT_VERSION`.
 *
 * Minimum sample sizes: `MINIMUM_TRAINING_SAMPLES` in calibration-aggregate.ts and
 * `config/routing-calibration.json.example`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  MINIMUM_TRAINING_SAMPLES,
  parseContribJsonl,
} from './calibration-aggregate.js';
import { EMBEDDING_DIM } from '../src/domain/matching/embedding-provider.js';
import {
  HYDRA_PROJECTION_OUTPUT_DIM,
  type HydraProjectionWeights,
} from '../src/domain/matching/hydra-matcher.js';
import {
  DEFAULT_ROUTING_CENTROIDS_PATH,
  loadRoutingCentroidsArtifact,
  type RoutingCentroidsArtifact,
} from '../src/domain/matching/cluster-matcher.js';
import { CYCLOMATIC_THRESHOLD } from '../src/domain/triage/triage-engine.js';
import {
  createDefaultPSuccessWeights,
  P_SUCCESS_FEATURE_NAMES,
  parseTrainingExportLine,
  trainFromLabeledSamples,
  type LabeledTrainingSample,
  type PSuccessWeights,
} from '../src/domain/routing/p-success-classifier.js';

export const ROUTING_CALIBRATION_BUNDLE_VERSION = 1 as const;

/** SP-112 four-flag HyDRA prefix — legacy projection training rows. */
export const LEGACY_HYDRA_PREFIX_SCHEMA_VERSION = 1 as const;
/** SP-138 seven-flag HyDRA prefix — current encoder input schema. */
export const HYDRA_PREFIX_SCHEMA_VERSION = 2 as const;
export const HYDRA_PREFIX_FLAG_COUNT = 7 as const;
/** Bumped when prefix schema changes invalidate prior learned projection weights. */
export const HYDRA_PROJECTION_ARTIFACT_VERSION = 2 as const;
export const LEGACY_HYDRA_PROJECTION_ARTIFACT_VERSION = 1 as const;

export const DEFAULT_ROUTING_CALIBRATION_PATH = resolve('config', 'routing-calibration.json');
export const ROUTING_CALIBRATION_SCHEMA_PATH = resolve(
  'specs/001-build-smart-router/contracts/routing-calibration.schema.json',
);

export interface TriageThresholdsArtifact {
  readonly version: 1;
  readonly cyclomatic_threshold: number;
  readonly trained_sample_count: number;
}

export interface HydraProjectionBundleArtifact {
  readonly version: typeof HYDRA_PROJECTION_ARTIFACT_VERSION;
  readonly embedding_dim: typeof EMBEDDING_DIM;
  readonly prefix_schema_version: typeof HYDRA_PREFIX_SCHEMA_VERSION;
  readonly prefix_flag_count: typeof HYDRA_PREFIX_FLAG_COUNT;
  readonly weights: readonly number[];
  readonly bias: readonly number[];
  readonly trained_sample_count: number;
}

export interface RoutingCalibrationBundle {
  readonly version: typeof ROUTING_CALIBRATION_BUNDLE_VERSION;
  readonly minimum_training_samples: typeof MINIMUM_TRAINING_SAMPLES;
  readonly hydra_projection: HydraProjectionBundleArtifact;
  readonly triage_thresholds: TriageThresholdsArtifact;
  readonly p_success_weights: PSuccessWeights;
  readonly routing_centroids: RoutingCentroidsArtifact;
}

export class RoutingCalibrationError extends Error {
  override readonly name = 'RoutingCalibrationError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}


function logit(p: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, p));
  return Math.log(clamped / (1 - clamped));
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readEmbeddingVector(record: Record<string, unknown>): Float32Array | null {
  const raw = record.embedding;
  if (!Array.isArray(raw) || raw.length !== EMBEDDING_DIM) {
    return null;
  }
  if (!raw.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }
  return new Float32Array(raw as number[]);
}

function readRequirementVector(record: Record<string, unknown>): [number, number, number] | null {
  const reasoning = numOrNull(record.requirement_reasoning);
  const codeGen = numOrNull(record.requirement_code_gen);
  const toolUse = numOrNull(record.requirement_tool_use);
  if (reasoning === null || codeGen === null || toolUse === null) {
    return null;
  }
  return [reasoning, codeGen, toolUse];
}

/** Privacy-safe contrib scalars that align training rows with SP-138 seven-flag prefix. */
const SEVEN_FLAG_CONTRIB_METADATA_KEYS = [
  'compaction_flag',
  'has_tool_context',
  'estimated_input_tokens',
  'turn_type',
] as const;

function hasSevenFlagContribMetadata(record: Record<string, unknown>): boolean {
  return SEVEN_FLAG_CONTRIB_METADATA_KEYS.every((key) => key in record);
}

/** Resolve prefix schema version stamped on a contrib row (defaults legacy when absent). */
export function readHydraPrefixSchemaVersion(record: Record<string, unknown>): number {
  const explicit = numOrNull(record.hydra_prefix_schema_version);
  if (explicit !== null) {
    return explicit;
  }

  if (hasSevenFlagContribMetadata(record)) {
    return HYDRA_PREFIX_SCHEMA_VERSION;
  }

  return LEGACY_HYDRA_PREFIX_SCHEMA_VERSION;
}

/** Whether a contrib row is eligible for seven-flag projection training. */
export function isSevenFlagHydraProjectionSample(record: Record<string, unknown>): boolean {
  if (readHydraPrefixSchemaVersion(record) < HYDRA_PREFIX_SCHEMA_VERSION) {
    return false;
  }

  if (!hasSevenFlagContribMetadata(record)) {
    return false;
  }

  return readEmbeddingVector(record) !== null && readRequirementVector(record) !== null;
}

/** Reject stale hydra_projection sub-artifacts from pre-SP-138 calibration bundles. */
export function assertCompatibleHydraProjectionArtifact(
  artifact: HydraProjectionBundleArtifact,
): void {
  if (artifact.version < HYDRA_PROJECTION_ARTIFACT_VERSION) {
    throw new RoutingCalibrationError(
      `Stale hydra_projection artifact version ${artifact.version}; expected >= ${HYDRA_PROJECTION_ARTIFACT_VERSION} (seven-flag prefix recalibration required)`,
    );
  }

  if (artifact.prefix_schema_version < HYDRA_PREFIX_SCHEMA_VERSION) {
    throw new RoutingCalibrationError(
      `Stale hydra_projection prefix_schema_version ${artifact.prefix_schema_version}; expected ${HYDRA_PREFIX_SCHEMA_VERSION} (${HYDRA_PREFIX_FLAG_COUNT}-flag prefix)`,
    );
  }

  if (artifact.prefix_flag_count !== HYDRA_PREFIX_FLAG_COUNT) {
    throw new RoutingCalibrationError(
      `Invalid hydra_projection.prefix_flag_count: expected ${HYDRA_PREFIX_FLAG_COUNT}, got ${artifact.prefix_flag_count}`,
    );
  }
}

/** Flatten 3×384 learned weights to the bundle row-major layout (1152 floats). */
export function flattenHydraProjectionWeights(weights: HydraProjectionWeights): number[] {
  const flat: number[] = [];
  for (let row = 0; row < HYDRA_PROJECTION_OUTPUT_DIM; row++) {
    const rowWeights = weights.weights[row]!;
    for (let col = 0; col < EMBEDDING_DIM; col++) {
      flat.push(rowWeights[col] ?? 0);
    }
  }
  return flat;
}

/** Expand bundle flat weights into the nested HyDRA artifact shape. */
export function unflattenHydraProjectionWeights(
  artifact: HydraProjectionBundleArtifact,
): HydraProjectionWeights {
  assertCompatibleHydraProjectionArtifact(artifact);

  if (artifact.embedding_dim !== EMBEDDING_DIM) {
    throw new RoutingCalibrationError(
      `Invalid embedding_dim: expected ${EMBEDDING_DIM}, got ${artifact.embedding_dim}`,
    );
  }
  if (artifact.weights.length !== EMBEDDING_DIM * HYDRA_PROJECTION_OUTPUT_DIM) {
    throw new RoutingCalibrationError(
      `Invalid hydra_projection.weights length: expected ${EMBEDDING_DIM * HYDRA_PROJECTION_OUTPUT_DIM}, got ${artifact.weights.length}`,
    );
  }

  const weights: number[][] = [];
  for (let row = 0; row < HYDRA_PROJECTION_OUTPUT_DIM; row++) {
    weights.push(artifact.weights.slice(row * EMBEDDING_DIM, (row + 1) * EMBEDDING_DIM));
  }

  return {
    version: 1,
    embedding_dim: EMBEDDING_DIM,
    weights,
    bias: [...artifact.bias],
  };
}

export function createDefaultHydraProjectionArtifact(): HydraProjectionBundleArtifact {
  return {
    version: HYDRA_PROJECTION_ARTIFACT_VERSION,
    embedding_dim: EMBEDDING_DIM,
    prefix_schema_version: HYDRA_PREFIX_SCHEMA_VERSION,
    prefix_flag_count: HYDRA_PREFIX_FLAG_COUNT,
    weights: Array.from({ length: EMBEDDING_DIM * HYDRA_PROJECTION_OUTPUT_DIM }, () => 0),
    bias: [0, 0, 0],
    trained_sample_count: 0,
  };
}

export function createDefaultTriageThresholdsArtifact(): TriageThresholdsArtifact {
  return {
    version: 1,
    cyclomatic_threshold: CYCLOMATIC_THRESHOLD,
    trained_sample_count: 0,
  };
}

function loadDefaultRoutingCentroids(): RoutingCentroidsArtifact {
  const candidates = [
    resolve(DEFAULT_ROUTING_CENTROIDS_PATH),
    resolve('config', 'routing-centroids.json.example'),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      return loadRoutingCentroidsArtifact(filePath);
    } catch {
      continue;
    }
  }

  return {
    version: 1,
    embedding_dim: EMBEDDING_DIM,
    clusters: [],
  };
}

export function createDefaultRoutingCalibrationBundle(): RoutingCalibrationBundle {
  return {
    version: ROUTING_CALIBRATION_BUNDLE_VERSION,
    minimum_training_samples: MINIMUM_TRAINING_SAMPLES,
    hydra_projection: createDefaultHydraProjectionArtifact(),
    triage_thresholds: createDefaultTriageThresholdsArtifact(),
    p_success_weights: createDefaultPSuccessWeights(),
    routing_centroids: loadDefaultRoutingCentroids(),
  };
}

const RoutingCentroidRecordSchema = z.object({
  cluster_id: z.string().min(1),
  tier_bias: z.enum(['zero-tier', 'economical-cloud', 'frontier-cloud']),
  centroid: z.array(z.number().finite()).length(EMBEDDING_DIM),
  reference_count: z.number().int().min(0),
});

const RoutingCalibrationBundleSchema = z.object({
  version: z.literal(ROUTING_CALIBRATION_BUNDLE_VERSION),
  minimum_training_samples: z.object({
    hydra_projection: z.number().int().min(1),
    triage_thresholds: z.number().int().min(1),
    p_success_weights: z.number().int().min(1),
    routing_centroids: z.number().int().min(1),
  }),
  hydra_projection: z.object({
    version: z.literal(HYDRA_PROJECTION_ARTIFACT_VERSION),
    embedding_dim: z.literal(EMBEDDING_DIM),
    prefix_schema_version: z.literal(HYDRA_PREFIX_SCHEMA_VERSION),
    prefix_flag_count: z.literal(HYDRA_PREFIX_FLAG_COUNT),
    weights: z.array(z.number().finite()).length(EMBEDDING_DIM * HYDRA_PROJECTION_OUTPUT_DIM),
    bias: z.array(z.number().finite()).length(HYDRA_PROJECTION_OUTPUT_DIM),
    trained_sample_count: z.number().int().min(0),
  }),
  triage_thresholds: z.object({
    version: z.literal(1),
    cyclomatic_threshold: z.number().int().min(1),
    trained_sample_count: z.number().int().min(0),
  }),
  p_success_weights: z.object({
    version: z.literal(1),
    min_training_samples: z.number().int().min(0),
    feature_names: z.array(z.enum(P_SUCCESS_FEATURE_NAMES)).length(P_SUCCESS_FEATURE_NAMES.length),
    intercept: z.number(),
    coefficients: z.array(z.number()).length(P_SUCCESS_FEATURE_NAMES.length),
    trained_sample_count: z.number().int().min(0),
  }),
  routing_centroids: z.object({
    version: z.literal(1),
    embedding_dim: z.literal(EMBEDDING_DIM),
    clusters: z.array(RoutingCentroidRecordSchema).min(1),
  }),
});

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
}

/** Parse and validate a routing calibration bundle; rejects incompatible versions. */
export function parseRoutingCalibrationBundleJson(raw: string): RoutingCalibrationBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RoutingCalibrationError(`Failed to parse routing calibration JSON: ${message}`, {
      cause: err,
    });
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new RoutingCalibrationError('Routing calibration bundle must be a JSON object');
  }

  const version = (parsed as Record<string, unknown>).version;
  if (version !== ROUTING_CALIBRATION_BUNDLE_VERSION) {
    throw new RoutingCalibrationError(
      `Unsupported routing calibration bundle version: ${String(version)}`,
    );
  }

  const result = RoutingCalibrationBundleSchema.safeParse(parsed);
  if (!result.success) {
    throw new RoutingCalibrationError(
      `Invalid routing calibration bundle:\n${formatZodIssues(result.error)}`,
    );
  }

  return result.data as RoutingCalibrationBundle;
}

/**
 * Load bundle from disk. Returns null when missing.
 * Throws when present but invalid; callers should fall back to defaults on error.
 */
export function loadRoutingCalibrationBundle(
  filePath: string = DEFAULT_ROUTING_CALIBRATION_PATH,
): RoutingCalibrationBundle | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = readFileSync(filePath, 'utf8');
  return parseRoutingCalibrationBundleJson(raw);
}

/** Resolve bundle for runtime — missing or incompatible artifacts fall back to defaults. */
export function resolveRoutingCalibrationBundle(
  filePath: string = DEFAULT_ROUTING_CALIBRATION_PATH,
): RoutingCalibrationBundle {
  try {
    return loadRoutingCalibrationBundle(filePath) ?? createDefaultRoutingCalibrationBundle();
  } catch (err: unknown) {
    console.warn('Routing calibration bundle invalid; using baked-in defaults', {
      error: err instanceof Error ? err.message : String(err),
    });
    return createDefaultRoutingCalibrationBundle();
  }
}

function contribToLabeledSample(record: Record<string, unknown>): LabeledTrainingSample | null {
  const line = JSON.stringify(record);
  return parseTrainingExportLine(line);
}

function trainTriageThreshold(
  records: readonly Record<string, unknown>[],
): TriageThresholdsArtifact {
  const labeled: Array<{ score: number; complex: boolean }> = [];

  for (const record of records) {
    const verdict = record.triage_verdict;
    const score = numOrNull(record.triage_cyclomatic_score);
    if (typeof verdict !== 'string' || score === null) {
      continue;
    }
    if (verdict === 'complex') {
      labeled.push({ score, complex: true });
    } else if (verdict === 'trivial') {
      labeled.push({ score, complex: false });
    }
  }

  if (labeled.length < MINIMUM_TRAINING_SAMPLES.triage_thresholds) {
    return {
      version: 1,
      cyclomatic_threshold: CYCLOMATIC_THRESHOLD,
      trained_sample_count: labeled.length,
    };
  }

  let bestThreshold = CYCLOMATIC_THRESHOLD;
  let bestErrors = Number.POSITIVE_INFINITY;

  for (let threshold = 5; threshold <= 30; threshold++) {
    let errors = 0;
    for (const sample of labeled) {
      const predictedComplex = sample.score >= threshold;
      if (predictedComplex !== sample.complex) {
        errors++;
      }
    }
    if (errors < bestErrors) {
      bestErrors = errors;
      bestThreshold = threshold;
    }
  }

  return {
    version: 1,
    cyclomatic_threshold: bestThreshold,
    trained_sample_count: labeled.length,
  };
}

function trainHydraProjection(
  records: readonly Record<string, unknown>[],
): HydraProjectionBundleArtifact {
  const samples: Array<{ embedding: Float32Array; targets: [number, number, number] }> = [];

  for (const record of records) {
    if (!isSevenFlagHydraProjectionSample(record)) {
      continue;
    }

    const embedding = readEmbeddingVector(record)!;
    const targets = readRequirementVector(record)!;
    samples.push({ embedding, targets });
  }

  if (samples.length < MINIMUM_TRAINING_SAMPLES.hydra_projection) {
    return {
      ...createDefaultHydraProjectionArtifact(),
      trained_sample_count: samples.length,
    };
  }

  const coefficients = Array.from({ length: HYDRA_PROJECTION_OUTPUT_DIM }, () =>
    Array.from({ length: EMBEDDING_DIM }, () => 0),
  );
  const bias = [0, 0, 0];
  const learningRate = 0.05;
  const epochs = 200;

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const sample of samples) {
      for (let dim = 0; dim < HYDRA_PROJECTION_OUTPUT_DIM; dim++) {
        let z = bias[dim]!;
        for (let i = 0; i < EMBEDDING_DIM; i++) {
          z += (coefficients[dim]![i] ?? 0) * (sample.embedding[i] ?? 0);
        }
        const target = logit(sample.targets[dim]!);
        const error = z - target;
        bias[dim]! -= learningRate * error;
        for (let i = 0; i < EMBEDDING_DIM; i++) {
          coefficients[dim]![i]! -= learningRate * error * (sample.embedding[i] ?? 0);
        }
      }
    }
  }

  const learned: HydraProjectionWeights = {
    version: 1,
    embedding_dim: EMBEDDING_DIM,
    weights: coefficients,
    bias,
  };

  return {
    version: HYDRA_PROJECTION_ARTIFACT_VERSION,
    embedding_dim: EMBEDDING_DIM,
    prefix_schema_version: HYDRA_PREFIX_SCHEMA_VERSION,
    prefix_flag_count: HYDRA_PREFIX_FLAG_COUNT,
    weights: flattenHydraProjectionWeights(learned),
    bias,
    trained_sample_count: samples.length,
  };
}

function trainPSuccessWeights(records: readonly Record<string, unknown>[]): PSuccessWeights {
  const samples = records
    .map((record) => contribToLabeledSample(record))
    .filter((sample): sample is LabeledTrainingSample => sample !== null);

  return trainFromLabeledSamples(samples);
}

/** Train all bundle artifacts from validated contrib rows (feature vectors only). */
export function trainRoutingCalibrationBundle(
  records: readonly Record<string, unknown>[],
): RoutingCalibrationBundle {
  const hydraRows = records.filter((record) => {
    if (record.reason_code !== 'hydra_embedding_match' && readRequirementVector(record) === null) {
      return false;
    }

    if (readEmbeddingVector(record) !== null) {
      return isSevenFlagHydraProjectionSample(record);
    }

    return readHydraPrefixSchemaVersion(record) >= HYDRA_PREFIX_SCHEMA_VERSION;
  });

  return {
    version: ROUTING_CALIBRATION_BUNDLE_VERSION,
    minimum_training_samples: MINIMUM_TRAINING_SAMPLES,
    hydra_projection: trainHydraProjection(hydraRows),
    triage_thresholds: trainTriageThreshold(records),
    p_success_weights: trainPSuccessWeights(records),
    routing_centroids: loadDefaultRoutingCentroids(),
  };
}

export function serializeRoutingCalibrationBundle(bundle: RoutingCalibrationBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

function usage(): void {
  console.error(
    [
      'Usage: npm run routing:train-calibration -- [options]',
      '',
      'Options:',
      '  --input <path>     Validated JSONL from routing:calibration-aggregate (default: stdin)',
      '  --output <path>    Output bundle path (default: config/routing-calibration.json)',
      '  -h, --help         Show this help',
      '',
      'Trains from feature vectors only — never reads prompt text from contrib rows.',
      `Minimum samples: hydra=${MINIMUM_TRAINING_SAMPLES.hydra_projection},`,
      `triage=${MINIMUM_TRAINING_SAMPLES.triage_thresholds},`,
      `p_success=${MINIMUM_TRAINING_SAMPLES.p_success_weights}.`,
    ].join('\n'),
  );
}

async function readInputText(inputPath?: string): Promise<string> {
  if (inputPath) {
    return readFileSync(resolve(inputPath), 'utf8');
  }

  if (process.stdin.isTTY) {
    return '';
  }

  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }
  return chunks.join('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  let inputPath: string | undefined;
  let outputPath = DEFAULT_ROUTING_CALIBRATION_PATH;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--input') {
      inputPath = args[i + 1];
      if (!inputPath) {
        throw new RoutingCalibrationError('--input requires a path');
      }
      i++;
      continue;
    }
    if (arg === '--output') {
      const next = args[i + 1];
      if (!next) {
        throw new RoutingCalibrationError('--output requires a path');
      }
      outputPath = resolve(next);
      i++;
      continue;
    }
    throw new RoutingCalibrationError(`Unknown argument: ${arg}`);
  }

  const text = await readInputText(inputPath);
  const records = text.trim().length > 0 ? parseContribJsonl(text, inputPath ?? 'stdin') : [];
  const bundle = trainRoutingCalibrationBundle(records);

  parseRoutingCalibrationBundleJson(serializeRoutingCalibrationBundle(bundle));
  writeFileSync(outputPath, serializeRoutingCalibrationBundle(bundle), 'utf8');

  console.error(
    `train-routing-calibration: wrote bundle v${bundle.version} (${records.length} training row(s)) to ${outputPath}`,
  );
  console.error(
    `  p_success samples=${bundle.p_success_weights.trained_sample_count},`,
    `triage samples=${bundle.triage_thresholds.trained_sample_count},`,
    `hydra samples=${bundle.hydra_projection.trained_sample_count}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`train-routing-calibration failed: ${message}`);
    process.exit(1);
  });
}
