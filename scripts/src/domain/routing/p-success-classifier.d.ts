/**
 * Baseline P(success) classifier for economical-tier routing (SP-104).
 *
 * Trains a lightweight logistic scorer from privacy-safe dataset export rows
 * joined with behavioral outcome labels. No heavy ML dependencies.
 */
import { z } from 'zod';
import type { TierFeatureVector } from './tier-features.js';
import type { OutcomeSignalType, RoutingDatasetRecord, RoutingOutcomeRecord } from '../types/index.js';
/** Minimum labeled samples required before predictions deviate from neutral. */
export declare const MIN_TRAINING_SAMPLES = 30;
/** Neutral probability when training data is insufficient or artifact missing. */
export declare const NEUTRAL_P_SUCCESS = 0.5;
/** Behavioral outcome signals that mark cheap-tier training failure (SP-062). */
export declare const BEHAVIORAL_FAILURE_OUTCOME_SIGNALS: readonly OutcomeSignalType[];
/** Verifier-grade failure proxies derived from privacy-safe telemetry scalars (SP-131). */
export declare const VERIFIER_FAILURE_OUTCOME_SIGNALS: readonly ["tool_failure_chain", "stop_reason_invalid", "reprompt_detected", "high_edit_distance"];
export type VerifierFailureOutcomeSignal = (typeof VERIFIER_FAILURE_OUTCOME_SIGNALS)[number];
/** Execution telemetry failure signals (SP-104 review follow-up, SP-131). */
export declare const EXECUTION_FAILURE_OUTCOME_SIGNALS: readonly ["provider_failover", "stop_reason_length", "infra_error"];
export type ExecutionFailureOutcomeSignal = (typeof EXECUTION_FAILURE_OUTCOME_SIGNALS)[number];
/** Union of all training label signals consumed by P(success) export and aggregate paths. */
export type TrainingOutcomeSignal = OutcomeSignalType | VerifierFailureOutcomeSignal | ExecutionFailureOutcomeSignal;
/** Outcome signals that mark a routing attempt as unsuccessful for cheap-tier training. */
export declare const FAILURE_OUTCOME_SIGNALS: readonly TrainingOutcomeSignal[];
/** @deprecated Use EXECUTION_FAILURE_OUTCOME_SIGNALS */
export declare const FUTURE_FAILURE_SIGNALS: readonly ["provider_failover", "stop_reason_length", "infra_error"];
/** Privacy-safe scalar failure proxies exported in calibration contrib rows (SP-131). */
export declare const P_SUCCESS_FAILURE_PROXY_FIELDS: readonly ["tool_failure_chain_count", "stop_reason_invalid", "reprompt_rate", "edit_distance_proxy"];
export type PSuccessFailureProxyField = (typeof P_SUCCESS_FAILURE_PROXY_FIELDS)[number];
export interface PSuccessFailureProxies {
    readonly tool_failure_chain_count: number | null;
    readonly stop_reason_invalid: boolean | null;
    readonly reprompt_rate: number | null;
    readonly edit_distance_proxy: number | null;
}
/** Minimum identical tool failures before labeling a tool-failure chain (loop escalation uses 3). */
export declare const TOOL_FAILURE_CHAIN_LABEL_THRESHOLD = 2;
/** Normalized re-prompt rate at or above this marks failure. */
export declare const REPROMPT_RATE_FAILURE_THRESHOLD = 0.5;
/** Normalized edit-distance proxy at or above this marks likely re-prompt / correction. */
export declare const EDIT_DISTANCE_PROXY_FAILURE_THRESHOLD = 0.6;
/** Provider stop reasons treated as invalid task completion for training labels. */
export declare const INVALID_STOP_REASONS: Set<string>;
export declare const P_SUCCESS_FEATURE_NAMES: readonly ["prompt_length_norm", "estimated_input_tokens_norm", "triage_cyclomatic_score", "requirement_reasoning", "requirement_code_gen", "requirement_tool_use", "has_tool_context", "compaction_flag", "routing_latency_norm", "economical_tier"];
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
export declare const P_SUCCESS_INFERENCE_BUDGET_MS = 5;
export declare const PSuccessWeightsSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    min_training_samples: z.ZodNumber;
    feature_names: z.ZodArray<z.ZodEnum<{
        compaction_flag: "compaction_flag";
        requirement_reasoning: "requirement_reasoning";
        requirement_code_gen: "requirement_code_gen";
        requirement_tool_use: "requirement_tool_use";
        has_tool_context: "has_tool_context";
        prompt_length_norm: "prompt_length_norm";
        estimated_input_tokens_norm: "estimated_input_tokens_norm";
        triage_cyclomatic_score: "triage_cyclomatic_score";
        routing_latency_norm: "routing_latency_norm";
        economical_tier: "economical_tier";
    }>>;
    intercept: z.ZodNumber;
    coefficients: z.ZodArray<z.ZodNumber>;
    trained_sample_count: z.ZodNumber;
}, z.core.$strip>;
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
export declare class PSuccessWeightsLoaderError extends Error {
    readonly name = "PSuccessWeightsLoaderError";
    constructor(message: string, options?: ErrorOptions);
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
/** Map a dataset row to a normalized feature vector for training or inference. */
export declare function extractPSuccessFeatures(record: Pick<RoutingDatasetRecord, 'prompt_length_chars' | 'estimated_input_tokens' | 'triage_cyclomatic_score' | 'requirement_reasoning' | 'requirement_code_gen' | 'requirement_tool_use' | 'has_tool_context' | 'compaction_flag' | 'routing_latency_ms' | 'tier'>): PSuccessFeatures;
export declare function featuresToVector(features: PSuccessFeatures): number[];
/** Extract privacy-safe failure proxy scalars from a contrib or export row. */
export declare function extractFailureProxies(record: Record<string, unknown>): PSuccessFailureProxies;
/** Map failure proxy scalars to verifier-grade training outcome signals. */
export declare function deriveVerifierFailureSignals(proxies: PSuccessFailureProxies): readonly VerifierFailureOutcomeSignal[];
/** Derive success label from behavioral outcomes plus optional failure proxies. */
export declare function deriveSuccessLabel(outcomes: readonly RoutingOutcomeRecord[], options?: {
    readonly failureProxies?: PSuccessFailureProxies;
}): {
    success: boolean | null;
    outcome_signals: readonly TrainingOutcomeSignal[];
};
/** Derive training labels from a privacy-safe export/contrib row (no prompt text). */
export declare function deriveSuccessLabelFromExportRow(record: Record<string, unknown>): {
    success: boolean | null;
    outcome_signals: readonly TrainingOutcomeSignal[];
    failure_proxies: PSuccessFailureProxies;
};
/** Attach normalized failure proxy fields for calibration export rows. */
export declare function attachFailureProxiesToExport(exportRecord: Record<string, unknown>): Record<string, unknown>;
/** Group outcomes by request_id for export joins. */
export declare function indexOutcomesByRequestId(outcomes: readonly RoutingOutcomeRecord[]): Map<string, RoutingOutcomeRecord[]>;
/** Join dataset rows with outcome labels for training export. */
export declare function joinDatasetWithOutcomes(datasetRecords: readonly RoutingDatasetRecord[], outcomeRecords: readonly RoutingOutcomeRecord[]): LabeledTrainingSample[];
/** Attach join labels to a privacy-safe export object. */
export declare function attachOutcomeLabelsToExport(exportRecord: Record<string, unknown>, outcomes: readonly RoutingOutcomeRecord[]): DatasetExportJoinRow;
/** Train logistic weights from labeled samples via batch gradient descent. */
export declare function trainFromLabeledSamples(samples: readonly LabeledTrainingSample[], options?: {
    readonly learningRate?: number;
    readonly epochs?: number;
}): PSuccessWeights;
/** Parse one JSONL export line into a labeled training sample. */
export declare function parseTrainingExportLine(line: string): LabeledTrainingSample | null;
/** Train weights from privacy-safe labeled JSONL export content. */
export declare function trainFromExportJsonl(jsonl: string): PSuccessWeights;
/** Predict P_success_cheap in [0, 1]; returns neutral when under-trained. */
export declare function predictPSuccessCheap(features: PSuccessFeatures, weights: PSuccessWeights): number;
/** Default untrained weights artifact for operators to replace after export training. */
export declare function createDefaultPSuccessWeights(): PSuccessWeights;
/** Parse and validate a P(success) weights artifact from JSON text. */
export declare function parsePSuccessWeightsJson(raw: string): PSuccessWeights;
/**
 * Load P(success) weights from disk. Returns null when the artifact is missing;
 * throws only when the file exists but is invalid.
 */
export declare function loadPSuccessWeights(options?: LoadPSuccessWeightsOptions): PSuccessWeights | null;
/** Resolve weights for online inference — missing or invalid artifacts fall back safely. */
export declare function resolvePSuccessWeights(options?: LoadPSuccessWeightsOptions): PSuccessWeights;
/** Map live tier features to the P(success) feature vector (no prompt text). */
export declare function tierFeaturesToPSuccessFeatures(tierFeatures: TierFeatureVector, options?: {
    readonly routingLatencyMs?: number;
    readonly economicalTier?: boolean;
}): PSuccessFeatures;
/** Signed coefficient × feature contributions for operator explainability. */
export declare function computePSuccessFeatureImportances(features: PSuccessFeatures, weights: PSuccessWeights): Readonly<Record<PSuccessFeatureName, number>>;
/** Predict P_success_cheap with elapsed timing guard for the online routing budget. */
export declare function predictPSuccessCheapTimed(features: PSuccessFeatures, weights: PSuccessWeights, budgetMs?: number): PSuccessPredictionResult;
//# sourceMappingURL=p-success-classifier.d.ts.map