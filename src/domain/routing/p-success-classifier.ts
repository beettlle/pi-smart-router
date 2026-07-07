/**
 * Baseline P(success) classifier for economical-tier routing (SP-104).
 *
 * Trains a lightweight logistic scorer from privacy-safe dataset export rows
 * joined with behavioral outcome labels. No heavy ML dependencies.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import type { TierFeatureVector } from './tier-features.js';
import type {
  OutcomeSignalType,
  RoutingDatasetRecord,
  RoutingOutcomeRecord,
} from '../types/index.js';

/** Minimum labeled samples required before predictions deviate from neutral. */
export const MIN_TRAINING_SAMPLES = 30;

/** Neutral probability when training data is insufficient or artifact missing. */
export const NEUTRAL_P_SUCCESS = 0.5;

/** Outcome signals that mark a routing attempt as unsuccessful for cheap-tier training. */
export const FAILURE_OUTCOME_SIGNALS: readonly OutcomeSignalType[] = [
  'model_override',
  'feedback_bad',
] as const;

/** Outcome signals reserved for future execution telemetry (failover, length, infra). */
export const FUTURE_FAILURE_SIGNALS = [
  'provider_failover',
  'stop_reason_length',
  'infra_error',
] as const;

export const P_SUCCESS_FEATURE_NAMES = [
  'prompt_length_norm',
  'estimated_input_tokens_norm',
  'triage_cyclomatic_score',
  'requirement_reasoning',
  'requirement_code_gen',
  'requirement_tool_use',
  'has_tool_context',
  'compaction_flag',
  'routing_latency_norm',
  'economical_tier',
] as const;

export type PSuccessFeatureName = (typeof P_SUCCESS_FEATURE_NAMES)[number];

export interface PSuccessFeatures {
  readonly prompt_length_norm: number;
  readonly estimated_input_tokens_norm: number;
  readonly triage_cyclomatic_score: number;
  readonly requirement_reasoning: number;
  readonly requirement_code_gen: number;
  readonly requirement_tool_use: number;
  readonly has_tool_context: number;
  readonly compaction_flag: number;
  readonly routing_latency_norm: number;
  readonly economical_tier: number;
}

/** Online inference latency budget (SP-105). */
export const P_SUCCESS_INFERENCE_BUDGET_MS = 5;

export const PSuccessWeightsSchema = z.object({
  version: z.literal(1),
  min_training_samples: z.number().int().min(0),
  feature_names: z.array(z.enum(P_SUCCESS_FEATURE_NAMES)).length(P_SUCCESS_FEATURE_NAMES.length),
  intercept: z.number(),
  coefficients: z.array(z.number()).length(P_SUCCESS_FEATURE_NAMES.length),
  trained_sample_count: z.number().int().min(0),
});

export interface PSuccessWeights {
  readonly version: 1;
  readonly min_training_samples: number;
  readonly feature_names: readonly PSuccessFeatureName[];
  readonly intercept: number;
  readonly coefficients: readonly number[];
  readonly trained_sample_count: number;
}

export interface PSuccessPredictionResult {
  readonly probability: number;
  readonly elapsed_ms: number;
  readonly within_budget: boolean;
  readonly feature_importances: Readonly<Record<PSuccessFeatureName, number>>;
}

export interface LoadPSuccessWeightsOptions {
  readonly filePath?: string;
}

export class PSuccessWeightsLoaderError extends Error {
  override readonly name = 'PSuccessWeightsLoaderError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface LabeledTrainingSample {
  readonly request_id: string;
  readonly features: PSuccessFeatures;
  readonly success: boolean;
  readonly outcome_signals: readonly OutcomeSignalType[];
}

export interface DatasetExportJoinRow extends Record<string, unknown> {
  readonly request_id: string;
  readonly success_label: boolean | null;
  readonly outcome_signals: readonly OutcomeSignalType[];
}

const PROMPT_LENGTH_NORM = 8_000;
const TOKEN_NORM = 2_000;
const LATENCY_NORM_MS = 500;

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const expNeg = Math.exp(-z);
    return 1 / (1 + expNeg);
  }
  const expPos = Math.exp(z);
  return expPos / (1 + expPos);
}

function numOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function boolToNum(value: unknown): number {
  return value === true ? 1 : 0;
}

/** Map a dataset row to a normalized feature vector for training or inference. */
export function extractPSuccessFeatures(
  record: Pick<
    RoutingDatasetRecord,
    | 'prompt_length_chars'
    | 'estimated_input_tokens'
    | 'triage_cyclomatic_score'
    | 'requirement_reasoning'
    | 'requirement_code_gen'
    | 'requirement_tool_use'
    | 'has_tool_context'
    | 'compaction_flag'
    | 'routing_latency_ms'
    | 'tier'
  >,
): PSuccessFeatures {
  const promptLength = numOrZero(record.prompt_length_chars);
  const tokens = numOrZero(record.estimated_input_tokens ?? promptLength / 4);

  return {
    prompt_length_norm: clamp01(promptLength / PROMPT_LENGTH_NORM),
    estimated_input_tokens_norm: clamp01(tokens / TOKEN_NORM),
    triage_cyclomatic_score: clamp01(numOrZero(record.triage_cyclomatic_score)),
    requirement_reasoning: clamp01(numOrZero(record.requirement_reasoning)),
    requirement_code_gen: clamp01(numOrZero(record.requirement_code_gen)),
    requirement_tool_use: clamp01(numOrZero(record.requirement_tool_use)),
    has_tool_context: boolToNum(record.has_tool_context),
    compaction_flag: boolToNum(record.compaction_flag),
    routing_latency_norm: clamp01(numOrZero(record.routing_latency_ms) / LATENCY_NORM_MS),
    economical_tier:
      record.tier === 'economical-cloud' || record.tier === 'zero-tier' ? 1 : 0,
  };
}

export function featuresToVector(features: PSuccessFeatures): number[] {
  return P_SUCCESS_FEATURE_NAMES.map((name) => features[name]);
}

/** Derive success label from outcome signals keyed to a request. */
export function deriveSuccessLabel(
  outcomes: readonly RoutingOutcomeRecord[],
): { success: boolean | null; outcome_signals: readonly OutcomeSignalType[] } {
  const signals = [...new Set(outcomes.map((entry) => entry.signal_type))];

  if (signals.some((signal) => FAILURE_OUTCOME_SIGNALS.includes(signal))) {
    return { success: false, outcome_signals: signals };
  }

  if (signals.includes('feedback_good')) {
    return { success: true, outcome_signals: signals };
  }

  if (signals.length === 0) {
    return { success: null, outcome_signals: signals };
  }

  // compaction_pin_break and other neutral signals — treat as unlabeled success.
  return { success: true, outcome_signals: signals };
}

/** Group outcomes by request_id for export joins. */
export function indexOutcomesByRequestId(
  outcomes: readonly RoutingOutcomeRecord[],
): Map<string, RoutingOutcomeRecord[]> {
  const byRequest = new Map<string, RoutingOutcomeRecord[]>();

  for (const outcome of outcomes) {
    const existing = byRequest.get(outcome.request_id) ?? [];
    existing.push(outcome);
    byRequest.set(outcome.request_id, existing);
  }

  return byRequest;
}

/** Join dataset rows with outcome labels for training export. */
export function joinDatasetWithOutcomes(
  datasetRecords: readonly RoutingDatasetRecord[],
  outcomeRecords: readonly RoutingOutcomeRecord[],
): LabeledTrainingSample[] {
  const outcomesByRequest = indexOutcomesByRequestId(outcomeRecords);

  return datasetRecords.map((record) => {
    const linked = outcomesByRequest.get(record.request_id) ?? [];
    const { success, outcome_signals } = deriveSuccessLabel(linked);

    return {
      request_id: record.request_id,
      features: extractPSuccessFeatures(record),
      success: success ?? true,
      outcome_signals,
    };
  });
}

/** Attach join labels to a privacy-safe export object. */
export function attachOutcomeLabelsToExport(
  exportRecord: Record<string, unknown>,
  outcomes: readonly RoutingOutcomeRecord[],
): DatasetExportJoinRow {
  const { success, outcome_signals } = deriveSuccessLabel(outcomes);

  return {
    ...exportRecord,
    request_id: String(exportRecord.request_id ?? ''),
    success_label: success,
    outcome_signals,
  };
}

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

/** Train logistic weights from labeled samples via batch gradient descent. */
export function trainFromLabeledSamples(
  samples: readonly LabeledTrainingSample[],
  options?: { readonly learningRate?: number; readonly epochs?: number },
): PSuccessWeights {
  const featureDim = P_SUCCESS_FEATURE_NAMES.length;
  const coefficients = Array.from({ length: featureDim }, () => 0);
  let intercept = 0;

  if (samples.length === 0) {
    return {
      version: 1,
      min_training_samples: MIN_TRAINING_SAMPLES,
      feature_names: P_SUCCESS_FEATURE_NAMES,
      intercept: 0,
      coefficients,
      trained_sample_count: 0,
    };
  }

  const learningRate = options?.learningRate ?? 0.1;
  const epochs = options?.epochs ?? 200;
  const xs = samples.map((sample) => featuresToVector(sample.features));
  const ys = samples.map((sample) => (sample.success ? 1 : 0));

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      const y = ys[i]!;
      const z = intercept + dot(coefficients, x);
      const prediction = sigmoid(z);
      const error = prediction - y;

      intercept -= learningRate * error;
      for (let j = 0; j < coefficients.length; j++) {
        coefficients[j]! -= learningRate * error * x[j]!;
      }
    }
  }

  return {
    version: 1,
    min_training_samples: MIN_TRAINING_SAMPLES,
    feature_names: P_SUCCESS_FEATURE_NAMES,
    intercept,
    coefficients,
    trained_sample_count: samples.length,
  };
}

/** Parse one JSONL export line into a labeled training sample. */
export function parseTrainingExportLine(line: string): LabeledTrainingSample | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  const requestId = parsed.request_id;
  if (typeof requestId !== 'string' || requestId.length === 0) {
    return null;
  }

  const successLabel = parsed.success_label;
  let success = true;
  if (typeof successLabel === 'boolean') {
    success = successLabel;
  }

  const rawSignals = parsed.outcome_signals;
  const outcome_signals = Array.isArray(rawSignals)
    ? rawSignals.filter((value): value is OutcomeSignalType => typeof value === 'string')
    : [];

  const record = parsed as unknown as RoutingDatasetRecord;

  return {
    request_id: requestId,
    features: extractPSuccessFeatures(record),
    success: success === false ? false : true,
    outcome_signals,
  };
}

/** Train weights from privacy-safe labeled JSONL export content. */
export function trainFromExportJsonl(jsonl: string): PSuccessWeights {
  const samples = jsonl
    .split('\n')
    .map((line) => parseTrainingExportLine(line))
    .filter((sample): sample is LabeledTrainingSample => sample !== null);

  return trainFromLabeledSamples(samples);
}

/** Predict P_success_cheap in [0, 1]; returns neutral when under-trained. */
export function predictPSuccessCheap(
  features: PSuccessFeatures,
  weights: PSuccessWeights,
): number {
  if (weights.trained_sample_count < weights.min_training_samples) {
    return NEUTRAL_P_SUCCESS;
  }

  const vector = featuresToVector(features);
  if (vector.length !== weights.coefficients.length) {
    return NEUTRAL_P_SUCCESS;
  }

  const z = weights.intercept + dot(weights.coefficients, vector);
  return clamp01(sigmoid(z));
}

/** Default untrained weights artifact for operators to replace after export training. */
export function createDefaultPSuccessWeights(): PSuccessWeights {
  return {
    version: 1,
    min_training_samples: MIN_TRAINING_SAMPLES,
    feature_names: P_SUCCESS_FEATURE_NAMES,
    intercept: 0,
    coefficients: P_SUCCESS_FEATURE_NAMES.map(() => 0),
    trained_sample_count: 0,
  };
}

function formatZodIssues(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
}

/** Parse and validate a P(success) weights artifact from JSON text. */
export function parsePSuccessWeightsJson(raw: string): PSuccessWeights {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PSuccessWeightsLoaderError(`Failed to parse JSON: ${message}`, { cause: err });
  }

  const result = PSuccessWeightsSchema.safeParse(parsed);
  if (!result.success) {
    throw new PSuccessWeightsLoaderError(
      `Invalid P(success) weights artifact:\n${formatZodIssues(result.error)}`,
      { cause: result.error },
    );
  }

  return result.data;
}

/**
 * Load P(success) weights from disk. Returns null when the artifact is missing;
 * throws only when the file exists but is invalid.
 */
export function loadPSuccessWeights(options?: LoadPSuccessWeightsOptions): PSuccessWeights | null {
  const filePath = options?.filePath ?? resolve('config', 'p-success-weights.json');

  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PSuccessWeightsLoaderError(`Failed to read weights file: ${message}`, { cause: err });
  }

  return parsePSuccessWeightsJson(raw);
}

/** Resolve weights for online inference — missing or invalid artifacts fall back safely. */
export function resolvePSuccessWeights(options?: LoadPSuccessWeightsOptions): PSuccessWeights {
  try {
    return loadPSuccessWeights(options) ?? createDefaultPSuccessWeights();
  } catch (err: unknown) {
    console.warn('P(success) weights artifact invalid; using neutral fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return createDefaultPSuccessWeights();
  }
}

/** Map live tier features to the P(success) feature vector (no prompt text). */
export function tierFeaturesToPSuccessFeatures(
  tierFeatures: TierFeatureVector,
  options?: { readonly routingLatencyMs?: number; readonly economicalTier?: boolean },
): PSuccessFeatures {
  const routingLatencyMs = options?.routingLatencyMs ?? 0;
  const economicalTier = options?.economicalTier ?? true;

  return extractPSuccessFeatures({
    prompt_length_chars: tierFeatures.prompt_length_chars,
    estimated_input_tokens: tierFeatures.estimated_input_tokens,
    triage_cyclomatic_score: tierFeatures.cyclomatic_score,
    requirement_reasoning: tierFeatures.requirement_reasoning,
    requirement_code_gen: tierFeatures.requirement_code_gen,
    requirement_tool_use: tierFeatures.requirement_tool_use,
    has_tool_context: tierFeatures.has_tool_context,
    compaction_flag: false,
    routing_latency_ms: routingLatencyMs,
    tier: economicalTier ? 'economical-cloud' : 'frontier-cloud',
  });
}

/** Signed coefficient × feature contributions for operator explainability. */
export function computePSuccessFeatureImportances(
  features: PSuccessFeatures,
  weights: PSuccessWeights,
): Readonly<Record<PSuccessFeatureName, number>> {
  const importances = {} as Record<PSuccessFeatureName, number>;

  for (let i = 0; i < P_SUCCESS_FEATURE_NAMES.length; i++) {
    const name = P_SUCCESS_FEATURE_NAMES[i]!;
    importances[name] = weights.coefficients[i]! * features[name];
  }

  return importances;
}

/** Predict P_success_cheap with elapsed timing guard for the online routing budget. */
export function predictPSuccessCheapTimed(
  features: PSuccessFeatures,
  weights: PSuccessWeights,
  budgetMs: number = P_SUCCESS_INFERENCE_BUDGET_MS,
): PSuccessPredictionResult {
  const start = performance.now();
  const probability = predictPSuccessCheap(features, weights);
  const elapsed_ms = performance.now() - start;
  const feature_importances = computePSuccessFeatureImportances(features, weights);

  if (elapsed_ms > budgetMs) {
    console.warn('P(success) inference exceeded latency budget', {
      elapsed_ms,
      budget_ms: budgetMs,
    });
  }

  return {
    probability,
    elapsed_ms,
    within_budget: elapsed_ms <= budgetMs,
    feature_importances,
  };
}
