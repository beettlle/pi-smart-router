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

/** Behavioral outcome signals that mark cheap-tier training failure (SP-062). */
export const BEHAVIORAL_FAILURE_OUTCOME_SIGNALS: readonly OutcomeSignalType[] = [
  'model_override',
  'feedback_bad',
] as const;

/** Verifier-grade failure proxies derived from privacy-safe telemetry scalars (SP-131). */
export const VERIFIER_FAILURE_OUTCOME_SIGNALS = [
  'tool_failure_chain',
  'stop_reason_invalid',
  'reprompt_detected',
  'high_edit_distance',
] as const;

export type VerifierFailureOutcomeSignal = (typeof VERIFIER_FAILURE_OUTCOME_SIGNALS)[number];

/** Execution telemetry failure signals (SP-104 review follow-up, SP-131). */
export const EXECUTION_FAILURE_OUTCOME_SIGNALS = [
  'provider_failover',
  'stop_reason_length',
  'infra_error',
] as const;

export type ExecutionFailureOutcomeSignal = (typeof EXECUTION_FAILURE_OUTCOME_SIGNALS)[number];

/** Union of all training label signals consumed by P(success) export and aggregate paths. */
export type TrainingOutcomeSignal =
  | OutcomeSignalType
  | VerifierFailureOutcomeSignal
  | ExecutionFailureOutcomeSignal;

/** Outcome signals that mark a routing attempt as unsuccessful for cheap-tier training. */
export const FAILURE_OUTCOME_SIGNALS: readonly TrainingOutcomeSignal[] = [
  ...BEHAVIORAL_FAILURE_OUTCOME_SIGNALS,
  ...VERIFIER_FAILURE_OUTCOME_SIGNALS,
  ...EXECUTION_FAILURE_OUTCOME_SIGNALS,
] as const;

/** @deprecated Use EXECUTION_FAILURE_OUTCOME_SIGNALS */
export const FUTURE_FAILURE_SIGNALS = EXECUTION_FAILURE_OUTCOME_SIGNALS;

/** Privacy-safe scalar failure proxies exported in calibration contrib rows (SP-131). */
export const P_SUCCESS_FAILURE_PROXY_FIELDS = [
  'tool_failure_chain_count',
  'stop_reason_invalid',
  'reprompt_rate',
  'edit_distance_proxy',
] as const;

export type PSuccessFailureProxyField = (typeof P_SUCCESS_FAILURE_PROXY_FIELDS)[number];

export interface PSuccessFailureProxies {
  readonly tool_failure_chain_count: number | null;
  readonly stop_reason_invalid: boolean | null;
  readonly reprompt_rate: number | null;
  readonly edit_distance_proxy: number | null;
}

/** Minimum identical tool failures before labeling a tool-failure chain (loop escalation uses 3). */
export const TOOL_FAILURE_CHAIN_LABEL_THRESHOLD = 2;

/** Normalized re-prompt rate at or above this marks failure. */
export const REPROMPT_RATE_FAILURE_THRESHOLD = 0.5;

/** Normalized edit-distance proxy at or above this marks likely re-prompt / correction. */
export const EDIT_DISTANCE_PROXY_FAILURE_THRESHOLD = 0.6;

const PROMPT_LENGTH_NORM_FOR_EDIT_PROXY = 8_000;

/** Provider stop reasons treated as invalid task completion for training labels. */
export const INVALID_STOP_REASONS = new Set([
  'length',
  'max_tokens',
  'content_filter',
  'tool_calls',
  'function_call',
  'unknown',
  'error',
]);

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
  readonly outcome_signals: readonly TrainingOutcomeSignal[];
  readonly failure_proxies: PSuccessFailureProxies;
}

export interface DatasetExportJoinRow extends Record<string, unknown> {
  readonly request_id: string;
  readonly success_label: boolean | null;
  readonly outcome_signals: readonly TrainingOutcomeSignal[];
  readonly tool_failure_chain_count: number | null;
  readonly stop_reason_invalid: boolean | null;
  readonly reprompt_rate: number | null;
  readonly edit_distance_proxy: number | null;
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

function isTrainingOutcomeSignal(value: string): value is TrainingOutcomeSignal {
  return (
    (BEHAVIORAL_FAILURE_OUTCOME_SIGNALS as readonly string[]).includes(value) ||
    (VERIFIER_FAILURE_OUTCOME_SIGNALS as readonly string[]).includes(value) ||
    (EXECUTION_FAILURE_OUTCOME_SIGNALS as readonly string[]).includes(value) ||
    value === 'compaction_pin_break' ||
    value === 'feedback_good'
  );
}

function intOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function rateOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return clamp01(value);
}

function normalizeStopReasonInvalid(record: Record<string, unknown>): boolean | null {
  const explicit = boolOrNull(record.stop_reason_invalid);
  if (explicit !== null) {
    return explicit;
  }

  const stopReason = record.stop_reason;
  if (typeof stopReason !== 'string' || stopReason.length === 0) {
    return null;
  }

  return INVALID_STOP_REASONS.has(stopReason.toLowerCase());
}

function normalizeRepromptRate(record: Record<string, unknown>): number | null {
  const explicit = rateOrNull(record.reprompt_rate);
  if (explicit !== null) {
    return explicit;
  }

  const repromptCount = intOrNull(record.reprompt_count);
  if (repromptCount === null) {
    return null;
  }

  const turnIndex = intOrNull(record.turn_index_in_session);
  const denominator = turnIndex !== null && turnIndex > 0 ? turnIndex : repromptCount + 1;
  return clamp01(repromptCount / denominator);
}

function normalizeEditDistanceProxy(record: Record<string, unknown>): number | null {
  const explicit = rateOrNull(record.edit_distance_proxy);
  if (explicit !== null) {
    return explicit;
  }

  const delta = intOrNull(record.prompt_length_delta);
  if (delta !== null) {
    return clamp01(Math.abs(delta) / PROMPT_LENGTH_NORM_FOR_EDIT_PROXY);
  }

  const current = intOrNull(record.prompt_length_chars);
  const prior = intOrNull(record.prior_prompt_length_chars);
  if (current === null || prior === null) {
    return null;
  }

  const maxLength = Math.max(current, prior, 1);
  return clamp01(Math.abs(current - prior) / maxLength);
}

function normalizeToolFailureChainCount(record: Record<string, unknown>): number | null {
  const explicit = intOrNull(record.tool_failure_chain_count);
  if (explicit !== null) {
    return explicit;
  }

  return intOrNull(record.consecutive_tool_failures);
}

/** Extract privacy-safe failure proxy scalars from a contrib or export row. */
export function extractFailureProxies(record: Record<string, unknown>): PSuccessFailureProxies {
  return {
    tool_failure_chain_count: normalizeToolFailureChainCount(record),
    stop_reason_invalid: normalizeStopReasonInvalid(record),
    reprompt_rate: normalizeRepromptRate(record),
    edit_distance_proxy: normalizeEditDistanceProxy(record),
  };
}

/** Map failure proxy scalars to verifier-grade training outcome signals. */
export function deriveVerifierFailureSignals(
  proxies: PSuccessFailureProxies,
): readonly VerifierFailureOutcomeSignal[] {
  const signals: VerifierFailureOutcomeSignal[] = [];

  if (
    proxies.tool_failure_chain_count !== null &&
    proxies.tool_failure_chain_count >= TOOL_FAILURE_CHAIN_LABEL_THRESHOLD
  ) {
    signals.push('tool_failure_chain');
  }

  if (proxies.stop_reason_invalid === true) {
    signals.push('stop_reason_invalid');
  }

  if (
    proxies.reprompt_rate !== null &&
    proxies.reprompt_rate >= REPROMPT_RATE_FAILURE_THRESHOLD
  ) {
    signals.push('reprompt_detected');
  }

  if (
    proxies.edit_distance_proxy !== null &&
    proxies.edit_distance_proxy >= EDIT_DISTANCE_PROXY_FAILURE_THRESHOLD
  ) {
    signals.push('high_edit_distance');
  }

  return signals;
}

function mergeTrainingOutcomeSignals(
  ...groups: ReadonlyArray<readonly TrainingOutcomeSignal[]>
): readonly TrainingOutcomeSignal[] {
  return [...new Set(groups.flat())];
}

function parseTrainingOutcomeSignals(raw: unknown): readonly TrainingOutcomeSignal[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (value): value is TrainingOutcomeSignal =>
      typeof value === 'string' && isTrainingOutcomeSignal(value),
  );
}

/** Derive success label from behavioral outcomes plus optional failure proxies. */
export function deriveSuccessLabel(
  outcomes: readonly RoutingOutcomeRecord[],
  options?: { readonly failureProxies?: PSuccessFailureProxies },
): { success: boolean | null; outcome_signals: readonly TrainingOutcomeSignal[] } {
  const behavioralSignals = [...new Set(outcomes.map((entry) => entry.signal_type))];
  const verifierSignals = options?.failureProxies
    ? deriveVerifierFailureSignals(options.failureProxies)
    : [];
  const signals = mergeTrainingOutcomeSignals(behavioralSignals, verifierSignals);

  if (signals.some((signal) => (FAILURE_OUTCOME_SIGNALS as readonly string[]).includes(signal))) {
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

/** Derive training labels from a privacy-safe export/contrib row (no prompt text). */
export function deriveSuccessLabelFromExportRow(
  record: Record<string, unknown>,
): {
  success: boolean | null;
  outcome_signals: readonly TrainingOutcomeSignal[];
  failure_proxies: PSuccessFailureProxies;
} {
  const failure_proxies = extractFailureProxies(record);
  const existingSignals = parseTrainingOutcomeSignals(record.outcome_signals);
  const verifierSignals = deriveVerifierFailureSignals(failure_proxies);
  const mergedSignals = mergeTrainingOutcomeSignals(existingSignals, verifierSignals);

  if (mergedSignals.some((signal) => (FAILURE_OUTCOME_SIGNALS as readonly string[]).includes(signal))) {
    return { success: false, outcome_signals: mergedSignals, failure_proxies };
  }

  if (mergedSignals.includes('feedback_good')) {
    return { success: true, outcome_signals: mergedSignals, failure_proxies };
  }

  if (typeof record.success_label === 'boolean') {
    return {
      success: record.success_label,
      outcome_signals: mergedSignals,
      failure_proxies,
    };
  }

  if (mergedSignals.length === 0) {
    return { success: null, outcome_signals: mergedSignals, failure_proxies };
  }

  return { success: true, outcome_signals: mergedSignals, failure_proxies };
}

/** Attach normalized failure proxy fields for calibration export rows. */
export function attachFailureProxiesToExport(
  exportRecord: Record<string, unknown>,
): Record<string, unknown> {
  const proxies = extractFailureProxies(exportRecord);

  return {
    ...exportRecord,
    tool_failure_chain_count: proxies.tool_failure_chain_count,
    stop_reason_invalid: proxies.stop_reason_invalid,
    reprompt_rate: proxies.reprompt_rate,
    edit_distance_proxy: proxies.edit_distance_proxy,
  };
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
    const failure_proxies = extractFailureProxies(record as unknown as Record<string, unknown>);
    const { success, outcome_signals } = deriveSuccessLabel(linked, { failureProxies: failure_proxies });

    return {
      request_id: record.request_id,
      features: extractPSuccessFeatures(record),
      success: success ?? true,
      outcome_signals,
      failure_proxies,
    };
  });
}

/** Attach join labels to a privacy-safe export object. */
export function attachOutcomeLabelsToExport(
  exportRecord: Record<string, unknown>,
  outcomes: readonly RoutingOutcomeRecord[],
): DatasetExportJoinRow {
  const withProxies = attachFailureProxiesToExport(exportRecord);
  const failure_proxies = extractFailureProxies(withProxies);
  const { success, outcome_signals } = deriveSuccessLabel(outcomes, { failureProxies: failure_proxies });

  return {
    ...withProxies,
    request_id: String(exportRecord.request_id ?? ''),
    success_label: success,
    outcome_signals,
    tool_failure_chain_count: failure_proxies.tool_failure_chain_count,
    stop_reason_invalid: failure_proxies.stop_reason_invalid,
    reprompt_rate: failure_proxies.reprompt_rate,
    edit_distance_proxy: failure_proxies.edit_distance_proxy,
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

  const labeled = deriveSuccessLabelFromExportRow(parsed);
  const record = parsed as unknown as RoutingDatasetRecord;

  return {
    request_id: requestId,
    features: extractPSuccessFeatures(record),
    success: labeled.success === false ? false : true,
    outcome_signals: labeled.outcome_signals,
    failure_proxies: labeled.failure_proxies,
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
