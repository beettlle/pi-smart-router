/**
 * Baseline P(success) classifier for economical-tier routing (SP-104).
 *
 * Trains a lightweight logistic scorer from privacy-safe dataset export rows
 * joined with behavioral outcome labels. No heavy ML dependencies.
 */

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

export interface PSuccessWeights {
  readonly version: 1;
  readonly min_training_samples: number;
  readonly feature_names: readonly PSuccessFeatureName[];
  readonly intercept: number;
  readonly coefficients: readonly number[];
  readonly trained_sample_count: number;
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
