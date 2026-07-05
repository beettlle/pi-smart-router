/**
 * Zod schemas mirroring JSON-schema contracts and data-model entities.
 *
 * Canonical contract sources:
 *   - specs/001-build-smart-router/contracts/routing-request.schema.json
 *   - specs/001-build-smart-router/contracts/routing-decision.schema.json
 *   - specs/001-build-smart-router/data-model.md
 */
import { z } from 'zod';
// ─── Enum schemas ────────────────────────────────────────────────────────────
export const TurnTypeSchema = z.enum([
    'planning',
    'tool_result',
    'subagent',
    'main_loop',
    'unknown',
]);
export const PinReasonSchema = z.enum([
    'initial',
    'user_forced',
    'loop_escalation',
    'compaction',
    'cache_economics',
]);
export const TierSchema = z.enum([
    'zero-tier',
    'economical-cloud',
    'frontier-cloud',
]);
export const RoutingStageSchema = z.enum([
    'triage',
    'turn_envelope',
    'session_pin',
    'local_zero',
    'hydra_match',
    'fallback',
]);
export const PriceSourceSchema = z.enum([
    'override',
    'registry',
    'yaml_fallback',
]);
export const MessageRoleSchema = z.enum([
    'user',
    'assistant',
    'system',
    'tool',
]);
// ─── Message (contract: routing-request.schema.json) ─────────────────────────
export const MessageSchema = z.object({
    role: MessageRoleSchema,
    content: z.string(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.unknown()).optional(),
});
// ─── RoutingRequest (contract: routing-request.schema.json) ──────────────────
export const RoutingRequestSchema = z.object({
    request_id: z.string().uuid(),
    session_id: z.string().min(1),
    prompt_text: z.string(),
    messages: z.array(MessageSchema).optional(),
    turn_type: TurnTypeSchema.optional(),
    compaction_flag: z.boolean().optional(),
    force_model_id: z.string().optional(),
    estimated_input_tokens: z.number().int().nonnegative().optional(),
});
// ─── SessionPin (data-model.md) ──────────────────────────────────────────────
export const SessionPinSchema = z.object({
    session_id: z.string(),
    pinned_model_id: z.string(),
    pin_reason: PinReasonSchema,
    has_ever_switched: z.boolean(),
    consecutive_upstream_errors: z.number().int().nonnegative(),
    consecutive_tool_failures: z.number().int().nonnegative(),
    last_tool_failure_signature: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
});
// ─── ModelProfile (data-model.md) ────────────────────────────────────────────
export const ModelCapabilitiesSchema = z.object({
    reasoning: z.number().min(0).max(1),
    code_gen: z.number().min(0).max(1),
    tool_use: z.number().min(0).max(1),
});
export const ModelPerformanceSchema = z.object({
    latency_p50_ms: z.number().optional(),
    verbosity_factor: z.number().optional(),
    cache_friendly: z.boolean().optional(),
});
export const ModelPricingSchema = z.object({
    registry_key: z.string().optional(),
    fallback_cost_per_1m: z.number(),
});
export const ModelProfileSchema = z.object({
    id: z.string(),
    tier: TierSchema,
    provider: z.string(),
    endpoint: z.string().optional(),
    capabilities: ModelCapabilitiesSchema,
    performance: ModelPerformanceSchema.optional(),
    pricing: ModelPricingSchema,
    healthy: z.boolean().optional(),
});
// ─── CandidateScore (contract: routing-decision.schema.json) ─────────────────
export const CandidateScoreSchema = z.object({
    model_id: z.string(),
    score: z.number(),
    shortfall: z.number(),
    rejected_reason: z.string().nullable(),
});
// ─── RoutingDecision (contract: routing-decision.schema.json) ────────────────
export const RoutingDecisionSchema = z.object({
    request_id: z.string().uuid(),
    selected_model_id: z.string(),
    tier: TierSchema,
    stage: RoutingStageSchema,
    reason_code: z.string(),
    candidates: z.array(CandidateScoreSchema).optional(),
    estimated_cost_usd: z.number().nonnegative().optional(),
    routing_latency_ms: z.number().nonnegative(),
    pin_reason: PinReasonSchema.nullable(),
});
// ─── PriceCatalog (data-model.md) ────────────────────────────────────────────
export const PriceCatalogSchema = z.object({
    registry_snapshot: z.record(z.string(), z.number()),
    user_overrides: z.record(z.string(), z.number()),
    last_updated: z.string().datetime(),
    source: PriceSourceSchema,
});
// ─── RoutingTelemetry (data-model.md) ────────────────────────────────────────
export const RoutingTelemetrySchema = z.object({
    timestamp: z.string().datetime(),
    session_id: z.string(),
    request_id: z.string(),
    turn_type: z.string(),
    stage: z.string(),
    reason_code: z.string(),
    selected_model_id: z.string(),
    estimated_cost_usd: z.number(),
    routing_latency_ms: z.number(),
    pin_reason: z.string().nullable(),
});
// ─── Operator configuration schema (data-model.md § Configuration) ───────────
export const FrugalityConfigSchema = z.object({
    lambda_cost: z.number().min(0).max(1),
    lambda_latency: z.number().min(0),
    lambda_verbosity: z.number().min(0),
});
export const LoopEscalationConfigSchema = z.object({
    threshold: z.number().int().positive(),
});
export const PricingConfigSchema = z.object({
    staleness_days: z.number().int().positive(),
});
export const LocalConfigSchema = z.object({
    min_memory_gb_full: z.number().positive(),
    min_memory_gb_classification: z.number().positive(),
    battery_threshold_pct: z.number().min(0).max(100),
});
export const HydraConfigSchema = z.object({
    artifact_cache_path: z.string(),
});
export const OperatorConfigSchema = z.object({
    frugality: FrugalityConfigSchema,
    loop_escalation: LoopEscalationConfigSchema,
    pricing: PricingConfigSchema,
    local: LocalConfigSchema,
    hydra: HydraConfigSchema,
});
//# sourceMappingURL=schemas.js.map
