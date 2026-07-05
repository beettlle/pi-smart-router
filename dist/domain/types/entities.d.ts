/**
 * Domain entity types for the pi-smart-router routing pipeline.
 * Derived from specs/001-build-smart-router/data-model.md
 */
export type TurnType = 'planning' | 'tool_result' | 'subagent' | 'main_loop' | 'unknown';
export type PinReason = 'initial' | 'user_forced' | 'loop_escalation' | 'compaction' | 'cache_economics';
export type Tier = 'zero-tier' | 'economical-cloud' | 'frontier-cloud';
export type RoutingStage = 'triage' | 'turn_envelope' | 'session_pin' | 'local_zero' | 'hydra_match' | 'fallback';
export type PriceSource = 'override' | 'registry' | 'yaml_fallback';
export interface Message {
    readonly role: string;
    readonly content: string;
    readonly tool_blocks?: readonly unknown[];
}
export interface RoutingRequest {
    readonly request_id: string;
    readonly session_id: string;
    readonly prompt_text: string;
    readonly messages?: readonly Message[];
    readonly turn_type?: TurnType;
    readonly compaction_flag?: boolean;
    readonly force_model_id?: string;
    readonly estimated_input_tokens?: number;
}
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
export interface ModelCapabilities {
    readonly reasoning: number;
    readonly code_gen: number;
    readonly tool_use: number;
}
export interface ModelPerformance {
    readonly latency_p50_ms?: number;
    readonly verbosity_factor?: number;
    readonly cache_friendly?: boolean;
}
export interface ModelPricing {
    readonly registry_key?: string;
    readonly fallback_cost_per_1m: number;
}
export interface ModelProfile {
    readonly id: string;
    readonly tier: Tier;
    readonly provider: string;
    readonly endpoint?: string;
    readonly capabilities: ModelCapabilities;
    readonly performance?: ModelPerformance;
    readonly pricing: ModelPricing;
    readonly healthy?: boolean;
}
export interface CandidateScore {
    readonly model_id: string;
    readonly score: number;
    readonly shortfall: number;
    readonly rejected_reason: string | null;
}
/** Privacy-safe triage summary for dataset capture (SP-057). No prompt text. */
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
export interface PriceCatalog {
    readonly registry_snapshot: Readonly<Record<string, number>>;
    readonly user_overrides: Readonly<Record<string, number>>;
    readonly last_updated: string;
    readonly source: PriceSource;
}
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
}
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
}
//# sourceMappingURL=entities.d.ts.map