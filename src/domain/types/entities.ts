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
  | 'cache_economics';

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

// ─── RoutingDecision ─────────────────────────────────────────────────────────

export interface CandidateScore {
  readonly model_id: string;
  readonly score: number;
  readonly shortfall: number;
  readonly rejected_reason: string | null;
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
}

// ─── PriceCatalog ────────────────────────────────────────────────────────────

export interface PriceCatalog {
  readonly registry_snapshot: Readonly<Record<string, number>>;
  readonly user_overrides: Readonly<Record<string, number>>;
  readonly last_updated: string;
  readonly source: PriceSource;
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
}
