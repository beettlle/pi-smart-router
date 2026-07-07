/**
 * Domain entity types for the pi-smart-router routing pipeline.
 * Derived from specs/001-build-smart-router/data-model.md
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type TurnType =
  | 'planning'
  | 'tool_result'
  | 'subagent'
  | 'main_loop'
  | 'unknown';

export type PinReason =
  | 'initial'
  | 'user_forced'
  | 'loop_escalation'
  | 'compaction'
  | 'cache_economics'
  | 'context_overflow';

export type Tier = 'zero-tier' | 'economical-cloud' | 'frontier-cloud';

export type RoutingStage =
  | 'triage'
  | 'turn_envelope'
  | 'session_pin'
  | 'local_zero'
  | 'hydra_match'
  | 'fallback';

export type PriceSource = 'override' | 'registry' | 'yaml_fallback';

// ─── Message ─────────────────────────────────────────────────────────────────

export interface Message {
  readonly role: string;
  readonly content: string;
  readonly tool_blocks?: readonly unknown[];
}

// ─── RoutingRequest ──────────────────────────────────────────────────────────

export interface RoutingRequest {
  readonly request_id: string;
  readonly session_id: string;
  readonly prompt_text: string;
  readonly messages?: readonly Message[];
  readonly turn_type?: TurnType;
  readonly compaction_flag?: boolean;
  readonly force_model_id?: string;
  readonly candidate_model_id?: string;
  readonly estimated_input_tokens?: number;
}

// ─── SessionPin ──────────────────────────────────────────────────────────────

export interface SessionPin {
  readonly session_id: string;
  readonly pinned_model_id: string;
  readonly pin_reason: PinReason;
  readonly has_ever_switched: boolean;
  readonly consecutive_upstream_errors: number;
  readonly consecutive_tool_failures: number;
  readonly last_tool_failure_signature: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

// ─── ModelProfile ────────────────────────────────────────────────────────────

export interface ModelCapabilities {
  readonly reasoning: number;
  readonly code_gen: number;
  readonly tool_use: number;
}

export interface ModelPerformance {
  readonly latency_p50_ms?: number | undefined;
  readonly verbosity_factor?: number | undefined;
  readonly cache_friendly?: boolean | undefined;
}

export interface ModelPricing {
  readonly registry_key?: string | undefined;
  /** Per-token API/catalog fallback USD per 1M tokens. */
  readonly fallback_cost_per_1m: number;
  /**
   * Virtual subscription-quota cost USD per 1M tokens (SP-096).
   * Used for frugality scoring and telemetry when set; does not replace API billing rates.
   */
  readonly quota_cost_per_1m?: number | undefined;
}

export interface ModelLimits {
  readonly max_input_tokens?: number | undefined;
  readonly max_output_tokens?: number | undefined;
}

export interface ModelProfile {
  readonly id: string;
  readonly tier: Tier;
  readonly provider: string;
  readonly endpoint?: string | undefined;
  readonly capabilities: ModelCapabilities;
  readonly performance?: ModelPerformance | undefined;
  readonly pricing: ModelPricing;
  readonly limits?: ModelLimits | undefined;
  readonly healthy?: boolean | undefined;
}

// ─── RoutingDecision ─────────────────────────────────────────────────────────

export interface CandidateScore {
  readonly model_id: string;
  readonly score: number;
  readonly shortfall: number;
  readonly rejected_reason: string | null;
}

/** Privacy-safe context-fit rejection entry for telemetry and explain (SP-110). */
export interface ContextFitRejectedEntry {
  readonly model_id: string;
  readonly max_input_tokens: number | null;
  readonly reason: string;
}

/** Context-fit observability metadata (SP-110, #53). */
export interface ContextFitObservability {
  readonly estimated_input_tokens: number | null;
  readonly context_fit_viable_count: number | null;
  readonly context_fit_rejected_json: string | null;
  readonly context_overflow_pin_break: boolean;
  readonly selected_model_max_input_tokens: number | null;
  readonly context_fit_reason_code: string | null;
}

export interface TriageFeatureSummary {
  readonly verdict: 'trivial' | 'complex' | 'ambiguous';
  readonly reason_code: string;
  readonly cyclomatic_score: number;
}

/** HyDRA requirement vector projected from prompt embedding (SP-057). */
export interface RequirementVector {
  readonly reasoning: number;
  readonly code_gen: number;
  readonly tool_use: number;
}

/**
 * Privacy-safe routing feature sidecar for dataset capture (SP-057).
 * Metadata and routing signals only — no prompt text, messages, or tool arguments.
 */
export interface RoutingFeatureSidecar {
  readonly triage: TriageFeatureSummary | null;
  readonly requirements: RequirementVector | null;
  readonly candidates: readonly CandidateScore[] | null;
  /** Tier gate hint from low_intensity stage (SP-103, #62 explain). */
  readonly tier_hint: Tier | null;
  readonly tier_hint_reason_code: string | null;
  readonly low_intensity_score: number | null;
  /** P(success) cheap-tier probability from low_intensity gate (SP-105). */
  readonly p_success_cheap: number | null;
  /** Operator alpha threshold used for P(success) routing (SP-105). */
  readonly p_success_alpha: number | null;
  /** Context-fit gate observability (SP-110). */
  readonly context_fit?: ContextFitObservability;
}

export interface RoutingDecision {
  readonly request_id: string;
  readonly selected_model_id: string;
  readonly tier: Tier;
  readonly stage: RoutingStage;
  readonly reason_code: string;
  readonly candidates?: readonly CandidateScore[];
  readonly estimated_cost_usd?: number;
  readonly routing_latency_ms: number;
  readonly pin_reason: string | null;
  /** Optional dataset feature sidecar; omitted on legacy call paths. */
  readonly features?: RoutingFeatureSidecar;
}

// ─── PriceCatalog ────────────────────────────────────────────────────────────

export interface PriceCatalog {
  readonly registry_snapshot: Readonly<Record<string, number>>;
  /** LiteLLM context limits keyed by model id and provider/model aliases. */
  readonly registry_limits_snapshot?: Readonly<Record<string, ModelLimits>> | undefined;
  readonly user_overrides: Readonly<Record<string, number>>;
  readonly last_updated: string;
  readonly source: PriceSource;
}

// ─── RoutingDatasetRecord ────────────────────────────────────────────────────

/**
 * Privacy-safe routing dataset record (Tier 1).
 * Metadata and routing features only — no prompt text, messages, or tool arguments.
 */
export interface RoutingDatasetRecord {
  readonly request_id: string;
  readonly timestamp: string;
  readonly turn_type: string;
  readonly stage: string;
  readonly reason_code: string;
  readonly selected_model_id: string;
  readonly tier: Tier;
  readonly candidates_json: string | null;
  readonly prompt_length_chars: number;
  readonly estimated_input_tokens: number | null;
  readonly message_count: number;
  readonly has_tool_context: boolean;
  readonly compaction_flag: boolean;
  readonly triage_verdict: string | null;
  readonly triage_reason_code: string | null;
  readonly triage_cyclomatic_score: number | null;
  readonly triage_trivial_hits: number | null;
  readonly triage_complex_hits: number | null;
  readonly triage_sanitized_length_delta: number | null;
  readonly requirement_reasoning: number | null;
  readonly requirement_code_gen: number | null;
  readonly requirement_tool_use: number | null;
  readonly routing_latency_ms: number;
  readonly estimated_cost_usd: number | null;
  /** HMAC-SHA256 fingerprint for dedup when SMART_ROUTER_DATASET_FINGERPRINT=1. */
  readonly prompt_fingerprint: string | null;
  readonly estimated_input_tokens_gate: number | null;
  readonly context_fit_viable_count: number | null;
  readonly context_fit_rejected_json: string | null;
  readonly context_overflow_pin_break: boolean;
  readonly selected_model_max_input_tokens: number | null;
  readonly context_fit_reason_code: string | null;
}

// ─── RoutingOutcomeRecord ────────────────────────────────────────────────────

/** Behavioral outcome signal for policy learning (SP-062). No prompt text. */
export type OutcomeSignalType =
  | 'model_override'
  | 'compaction_pin_break'
  | 'feedback_good'
  | 'feedback_bad';

/**
 * Privacy-safe routing outcome label keyed by request_id.
 * Links to a dataset record; never stores prompt text or messages.
 */
export interface RoutingOutcomeRecord {
  readonly request_id: string;
  readonly session_id: string;
  readonly timestamp: string;
  readonly signal_type: OutcomeSignalType;
  /** Model selected by the router for the linked request. */
  readonly routed_model_id: string | null;
  /** User-chosen model after override; only for model_override. */
  readonly override_model_id: string | null;
}

// ─── Routing cluster catalog (SP-099) ────────────────────────────────────────

/** Stable cluster identifier used as reason-code suffix (`cluster_${id}`). */
export type RoutingClusterId =
  | 'low_stakes_general'
  | 'mechanical_edit'
  | 'deep_debug'
  | 'architecture'
  | (string & {});

/** Reference-prompt cluster definition from routing-clusters.yaml. */
export interface RoutingCluster {
  readonly id: RoutingClusterId;
  readonly tier_bias: Tier;
  readonly reference_prompts: readonly string[];
  readonly min_similarity: number;
  readonly min_margin: number;
}

/** Cluster with precomputed centroid embedding (mean of reference prompts). */
export interface LoadedRoutingCluster extends RoutingCluster {
  readonly centroid: Float32Array;
}

export interface RoutingClusterCatalog {
  readonly clusters: readonly LoadedRoutingCluster[];
}

// ─── RoutingTelemetry ────────────────────────────────────────────────────────

export interface RoutingTelemetry {
  readonly timestamp: string;
  readonly session_id: string;
  readonly request_id: string;
  readonly turn_type: string;
  readonly stage: string;
  readonly reason_code: string;
  readonly selected_model_id: string;
  readonly estimated_cost_usd: number;
  readonly routing_latency_ms: number;
  readonly pin_reason: string | null;
  readonly estimated_input_tokens: number | null;
  readonly context_fit_viable_count: number | null;
  readonly context_fit_rejected_json: string | null;
  readonly context_overflow_pin_break: boolean;
  readonly selected_model_max_input_tokens: number | null;
  readonly context_fit_reason_code: string | null;
}
