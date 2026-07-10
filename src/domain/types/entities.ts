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

// ─── SAAR (Session-Aware Agentic Routing, SP-121 / #72) ─────────────────────

/** Operator knobs for SAAR pin policy (config surface; behavior in SP-122+). */
export interface SaarConfig {
  /** Turns 0..(buffer-1) may reach frontier without permanent pin overwrite. */
  readonly planning_turn_buffer: number;
  /** Weight applied to prefix-cache value when gating model switches (0–1). */
  readonly prefix_cache_weight: number;
  /** Idle seconds before SAAR reopens the routing decision. */
  readonly idle_timeout_seconds: number;
  /** Minimum routing score delta required to break a warm pin (0–1). */
  readonly switch_threshold: number;
}

/** Per-session SAAR runtime state (types only; state machine in SP-122). */
export interface SaarSessionState {
  readonly turn_index: number;
  readonly hard_lock: boolean;
  readonly last_activity_at: string;
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

/** Rolling subscription quota window position (SP-148, #78). */
export interface QuotaWindowPosition {
  /**
   * Fraction of rolling window budget remaining, in [0, 1].
   * 1 = full window; 0 = exhausted (Cursor-style 5h limits).
   */
  readonly remaining_window_fraction: number;
  /** Elapsed seconds in the current rolling window (optional telemetry). */
  readonly elapsed_window_seconds?: number | undefined;
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

/** Per-cluster cosine score row for explain output (SP-113, #62). */
export interface ClusterMatchTableEntry {
  readonly cluster_id: string;
  readonly tier_bias: Tier;
  readonly similarity: number;
  readonly margin: number | null;
  readonly confidence: 'high' | 'none';
  readonly selected: boolean;
}

/** Privacy-safe tier feature summary for explain (SP-113). */
export interface TierFeatureSummary {
  readonly triage_verdict: string | null;
  readonly triage_reason_code: string | null;
  readonly cyclomatic_score: number | null;
  readonly requirement_reasoning: number | null;
  readonly requirement_code_gen: number | null;
  readonly requirement_tool_use: number | null;
}

/** Expected-cost tier candidate rejected in favor of the winner (SP-113). */
export interface RejectedTierEntry {
  readonly tier: string;
  readonly expected_cost_usd: number;
  readonly adjusted_expected_cost_usd: number;
  readonly reason: string;
}

/** Low-intensity gate breakdown for explain (SP-113). */
export interface LowIntensityBreakdown {
  readonly score: number | null;
  readonly tier_hint: Tier | null;
  readonly tier_hint_reason_code: string | null;
  readonly tier_selection_reason_code: string | null;
  readonly p_success_cheap: number | null;
  readonly p_success_raw: number | null;
  readonly p_success_calibrated: number | null;
  readonly p_success_alpha: number | null;
  readonly rejected_tiers: readonly RejectedTierEntry[];
}

/** Cache breakeven gate observability (SP-126, #73). */
export interface BreakevenObservability {
  readonly marginal_savings: number | null;
  readonly future_cache_value: number | null;
  readonly cache_reprime_cost: number | null;
  /** `pass` when switch clears breakeven; `blocked` when gate denies. */
  readonly decision: 'pass' | 'blocked' | null;
  readonly breakeven_reason_code: string | null;
}

/** Planning delegate routing path (SP-142, #71). */
export type PlanningDelegatePath = 'delegate' | 'direct' | 'none';

/**
 * Compressed context limits for ephemeral frontier sub-calls (SP-142).
 * Excludes full execution history per #71; enforced by pi extension in SP-144.
 */
export interface CompressedContextSpec {
  /** Max user/assistant messages retained in the delegate sub-call. */
  readonly max_messages: number;
  /** Max estimated tokens for delegate context window. */
  readonly max_tokens: number;
  /** When true, tool execution traces and verbose history are excluded. */
  readonly exclude_execution_history: boolean;
}

/** Operator knobs for cache-preserving planning delegate (SP-142, #71). */
export interface PlanningDelegateConfig {
  /** Prefer ephemeral frontier sub-call over primary model switch on planning turns. */
  readonly enabled: boolean;
  readonly compressed_context: CompressedContextSpec;
}

/** Planning delegate observability for explain and telemetry (SP-142, #71). */
export interface PlanningDelegateObservability {
  /** Active routing path for this planning turn. */
  readonly path: PlanningDelegatePath;
  /** Primary model kept on pinned session when path is delegate. */
  readonly primary_model_id: string | null;
  /** Frontier model selected for delegate sub-call when path is delegate. */
  readonly delegate_model_id: string | null;
  /** Compressed context limits applied to delegate sub-call. */
  readonly compressed_context: CompressedContextSpec | null;
  /**
   * Machine-readable path reason, e.g. `planning_delegate`, `planning_direct_frontier`,
   * `planning_delegate_disabled`.
   */
  readonly planning_delegate_reason_code: string | null;
  /** Operator-visible fallback explanation when path is not delegate. */
  readonly fallback_reason: string | null;
}

/** SAAR pin policy observability (SP-126, #72). */
export interface SaarObservability {
  readonly buffer_active: boolean;
  readonly hard_lock: boolean;
  readonly turn_index_in_session: number | null;
  readonly planning_turn_buffer: number | null;
  readonly idle_timeout_seconds: number | null;
  readonly saar_reason_code: string | null;
}

/** Tier/cluster selection observability (SP-113, #62). */
export interface TierSelectionObservability {
  readonly cluster_id: string | null;
  readonly cluster_similarity: number | null;
  readonly cluster_margin: number | null;
  readonly low_intensity_score: number | null;
  readonly tier_hint: Tier | null;
  readonly p_success_cheap: number | null;
  readonly local_eligible_reason: string | null;
  readonly tier_selection_reason_code: string | null;
  readonly cluster_match_table: readonly ClusterMatchTableEntry[] | null;
  readonly tier_feature_summary: TierFeatureSummary | null;
  readonly low_intensity_breakdown: LowIntensityBreakdown | null;
  readonly local_zero_skip_reasons: readonly string[];
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
  /** Raw logistic P(success) before isotonic calibration (SP-133). */
  readonly p_success_raw: number | null;
  /** Isotonic-calibrated P(success) used for gate thresholding (SP-133). */
  readonly p_success_calibrated: number | null;
  /** Operator alpha threshold used for P(success) routing (SP-105). */
  readonly p_success_alpha: number | null;
  /** Context-fit gate observability (SP-110). */
  readonly context_fit?: ContextFitObservability;
  /** Tier/cluster selection observability (SP-113, #62). */
  readonly tier_selection?: TierSelectionObservability;
  /** Cache breakeven gate breakdown (SP-126, #73). */
  readonly breakeven?: BreakevenObservability;
  /** SAAR pin state summary (SP-126, #72). */
  readonly saar?: SaarObservability;
  /** Planning delegate path summary (SP-142, #71). */
  readonly planning_delegate?: PlanningDelegateObservability;
  /** Why local_zero eligibility passed (SP-111, #59). */
  readonly local_eligible_reason: string | null;
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
  readonly cluster_id: string | null;
  readonly cluster_similarity: number | null;
  readonly cluster_margin: number | null;
  readonly low_intensity_score: number | null;
  readonly tier_hint: Tier | null;
  readonly p_success_cheap: number | null;
  readonly local_eligible_reason: string | null;
  readonly tier_selection_reason_code: string | null;
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
  readonly cluster_id: string | null;
  readonly cluster_similarity: number | null;
  readonly cluster_margin: number | null;
  readonly low_intensity_score: number | null;
  readonly tier_hint: Tier | null;
  readonly p_success_cheap: number | null;
  readonly local_eligible_reason: string | null;
  readonly tier_selection_reason_code: string | null;
  readonly marginal_savings: number | null;
  readonly future_cache_value: number | null;
  readonly cache_reprime_cost: number | null;
  readonly breakeven_decision: string | null;
  readonly breakeven_reason_code: string | null;
  readonly saar_buffer_active: boolean;
  readonly saar_hard_lock: boolean;
  readonly turn_index_in_session: number | null;
  readonly saar_reason_code: string | null;
  readonly planning_delegate_path: PlanningDelegatePath | null;
  readonly planning_delegate_primary_model_id: string | null;
  readonly planning_delegate_model_id: string | null;
  readonly planning_delegate_reason_code: string | null;
  readonly planning_delegate_fallback_reason: string | null;
  readonly planning_delegate_max_messages: number | null;
  readonly planning_delegate_max_tokens: number | null;
  readonly planning_delegate_exclude_execution_history: boolean | null;
  /** True when emergency pin-only fallback routed this request (SP-162, #83). */
  readonly pin_only_fallback_active: boolean;
}
