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
  'context_overflow',
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
  candidate_model_id: z.string().optional(),
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

export const ModelLimitsSchema = z.object({
  max_input_tokens: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().optional(),
});

export const ModelProfileSchema = z.object({
  id: z.string(),
  tier: TierSchema,
  provider: z.string(),
  endpoint: z.string().optional(),
  capabilities: ModelCapabilitiesSchema,
  performance: ModelPerformanceSchema.optional(),
  pricing: ModelPricingSchema,
  limits: ModelLimitsSchema.optional(),
  healthy: z.boolean().optional(),
});

/** Zod-validated model profile — aligned with {@link ModelProfile} in entities.ts. */
export type ValidatedModelProfile = z.infer<typeof ModelProfileSchema>;

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
  registry_limits_snapshot: z.record(z.string(), ModelLimitsSchema).optional(),
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

/** Rolling median local throughput gate knobs (SP-163, #84). */
export const ThroughputConfigSchema = z.object({
  /** Number of recent local inference samples in the rolling window. */
  window_size: z.number().int().positive(),
  /** Minimum median tokens_per_second for local viability (~25 tok/s). */
  threshold_tps: z.number().positive(),
});

export type ThroughputConfig = z.infer<typeof ThroughputConfigSchema>;

/** Throughput defaults per routing-roadmap.md §3 / #84 (SP-163). */
export const DEFAULT_THROUGHPUT_CONFIG: Readonly<ThroughputConfig> = {
  window_size: 50,
  threshold_tps: 25,
} as const;

/**
 * Pre-local_zero tool-use / capability gate knobs (SP-177, #98).
 * Defaults keep true trivial traffic on the cheap local path.
 */
export const LocalZeroConfigSchema = z.object({
  /** When false, local_zero never dispatches (falls through to later stages). */
  enabled: z.boolean().default(true),
  /**
   * Max predicted tool_use requirement (0–1) allowed for local_zero dispatch.
   * Effective ceiling is min(local model tool_use capability, this value).
   */
  max_tool_use_requirement: z.number().min(0).max(1),
});

export type LocalZeroConfig = z.infer<typeof LocalZeroConfigSchema>;

/** Safe defaults: gate on, ceiling above trivial (0) but below agentic tool cues. */
export const DEFAULT_LOCAL_ZERO_CONFIG: Readonly<LocalZeroConfig> = {
  enabled: true,
  max_tool_use_requirement: 0.25,
} as const;

/** HyDRA text encoder selection (SP-156, #80). */
export const EncoderSchema = z.enum(['minilm', 'granite']);

export type Encoder = z.infer<typeof EncoderSchema>;

export const DEFAULT_ENCODER: Encoder = 'minilm';

/** HyDRA requirement head mode (SP-158, #81). */
export const HydraHeadsSchema = z.enum(['learned_projection', 'modernbert_k4']);

export type HydraHeads = z.infer<typeof HydraHeadsSchema>;

export const DEFAULT_HYDRA_HEADS: HydraHeads = 'learned_projection';

export const HydraConfigSchema = z.object({
  artifact_cache_path: z.string(),
  /** ONNX encoder: MiniLM (default) or Granite 97M 384-dim long-context trial. */
  encoder: EncoderSchema.default(DEFAULT_ENCODER),
  /**
   * Requirement extraction mode:
   * - `learned_projection` — SP-115 384×3 linear projection (default)
   * - `modernbert_k4` — ModernBERT-base [CLS] with K=4 sigmoid heads (enable when
   *   calibration Top-1 error exceeds ~10%; see routing-roadmap.md §2 P3)
   */
  hydra_heads: HydraHeadsSchema.default(DEFAULT_HYDRA_HEADS),
});

export const LowIntensityWeightsSchema = z.object({
  prompt_shortness: z.number().min(0),
  token_shortness: z.number().min(0),
  cyclomatic_low: z.number().min(0),
  trivial_signal: z.number().min(0),
  complex_inverse: z.number().min(0),
  triage_verdict: z.number().min(0),
  turn_type: z.number().min(0),
  no_tool_context: z.number().min(0),
  message_shallow: z.number().min(0),
  prose_ratio: z.number().min(0),
  requirement_low: z.number().min(0),
  cluster_signal: z.number().min(0),
});

export const LowIntensityConfigSchema = z.object({
  weights: LowIntensityWeightsSchema,
  high_threshold: z.number().min(0).max(1),
  low_threshold: z.number().min(0).max(1),
  /** Minimum P_success_cheap to bias toward economical/local tier (SP-105). */
  p_success_alpha: z.number().min(0).max(1),
}).superRefine((value, ctx) => {
  if (value.high_threshold <= value.low_threshold) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'high_threshold must be greater than low_threshold',
      path: ['high_threshold'],
    });
  }
});

export const RoutingClustersConfigSchema = z.object({
  config_path: z.string().min(1),
});

/** SAAR operator knobs (SP-121, #72). */
export const SaarConfigSchema = z.object({
  planning_turn_buffer: z.number().int().positive(),
  prefix_cache_weight: z.number().min(0).max(1),
  idle_timeout_seconds: z.number().int().positive(),
  switch_threshold: z.number().min(0).max(1),
});

export type SaarConfig = z.infer<typeof SaarConfigSchema>;

/** Compressed context limits for planning delegate sub-calls (SP-142, #71). */
export const CompressedContextSpecSchema = z.object({
  max_messages: z.number().int().positive(),
  max_tokens: z.number().int().positive(),
  exclude_execution_history: z.boolean(),
});

export type CompressedContextSpec = z.infer<typeof CompressedContextSpecSchema>;

/** Planning delegate operator knobs (SP-142, #71). */
export const PlanningDelegateConfigSchema = z.object({
  enabled: z.boolean(),
  compressed_context: CompressedContextSpecSchema,
});

export type PlanningDelegateConfig = z.infer<typeof PlanningDelegateConfigSchema>;

/** Virtual cost v2 operator knobs (SP-148, #78). */
export const VirtualCostV2ConfigSchema = z.object({
  /** Cursor-style rolling window duration in seconds (default 5h). */
  window_duration_seconds: z.number().int().positive(),
  /** Exponent for λ decay as remaining window shrinks. */
  lambda_decay_exponent: z.number().positive(),
  /** Maximum λ at window exhaustion (λ = 1 when window is full). */
  lambda_max_multiplier: z.number().min(1),
  /** Weight on quota arbitrage premium at late-window positions. */
  quota_arbitrage_weight: z.number().min(0),
  /** Weight on exhaustion risk premium below threshold. */
  exhaustion_risk_weight: z.number().min(0),
  /** Remaining-window fraction below which exhaustion risk premium applies. */
  exhaustion_risk_threshold: z.number().min(0).max(1),
  /** Prefix cache discount for KV savings credit (aligned with SAAR / SP-125). */
  prefix_cache_discount: z.number().min(0).max(1),
  /** Prefix cache weight for KV savings credit (aligned with SAAR / SP-125). */
  prefix_cache_weight: z.number().min(0).max(1),
});

export type VirtualCostV2Config = z.infer<typeof VirtualCostV2ConfigSchema>;

/** Virtual cost v2 defaults per routing-roadmap.md §2 P2 (SP-148). */
export const DEFAULT_VIRTUAL_COST_V2_CONFIG: Readonly<VirtualCostV2Config> = {
  window_duration_seconds: 5 * 60 * 60,
  lambda_decay_exponent: 2,
  lambda_max_multiplier: 3,
  quota_arbitrage_weight: 0.5,
  exhaustion_risk_weight: 1,
  exhaustion_risk_threshold: 0.2,
  prefix_cache_discount: 0.9,
  prefix_cache_weight: 0.2,
} as const;

export const QuotaWindowPositionSchema = z.object({
  remaining_window_fraction: z.number().min(0).max(1),
  elapsed_window_seconds: z.number().nonnegative().optional(),
});

/** SAAR defaults per routing-roadmap.md §2 P0 (SP-121). */
export const DEFAULT_SAAR_CONFIG: Readonly<SaarConfig> = {
  planning_turn_buffer: 2,
  prefix_cache_weight: 0.20,
  idle_timeout_seconds: 300,
  switch_threshold: 0.5,
} as const;

/** Planning delegate defaults per routing-roadmap.md §2 P0 / #71 (SP-142). */
export const DEFAULT_PLANNING_DELEGATE_CONFIG: Readonly<PlanningDelegateConfig> = {
  enabled: true,
  compressed_context: {
    max_messages: 12,
    max_tokens: 16_384,
    exclude_execution_history: true,
  },
} as const;

/** Env: SMART_ROUTER_PLANNING_DELEGATE_ENABLED — enable delegate path (default true). */
const ENV_PLANNING_DELEGATE_ENABLED = 'SMART_ROUTER_PLANNING_DELEGATE_ENABLED';
/** Env: SMART_ROUTER_PLANNING_DELEGATE_MAX_MESSAGES — compressed context message cap (default 12). */
const ENV_PLANNING_DELEGATE_MAX_MESSAGES = 'SMART_ROUTER_PLANNING_DELEGATE_MAX_MESSAGES';
/** Env: SMART_ROUTER_PLANNING_DELEGATE_MAX_TOKENS — compressed context token cap (default 16384). */
const ENV_PLANNING_DELEGATE_MAX_TOKENS = 'SMART_ROUTER_PLANNING_DELEGATE_MAX_TOKENS';
/** Env: SMART_ROUTER_PLANNING_DELEGATE_EXCLUDE_EXECUTION_HISTORY — exclude tool traces (default true). */
const ENV_PLANNING_DELEGATE_EXCLUDE_EXECUTION_HISTORY =
  'SMART_ROUTER_PLANNING_DELEGATE_EXCLUDE_EXECUTION_HISTORY';

function readBooleanEnv(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return undefined;
}

/** Merge planning delegate env overrides onto defaults (invalid env values are ignored). */
export function resolvePlanningDelegateConfigFromEnv(
  base: PlanningDelegateConfig = DEFAULT_PLANNING_DELEGATE_CONFIG,
): PlanningDelegateConfig {
  return {
    enabled: readBooleanEnv(ENV_PLANNING_DELEGATE_ENABLED) ?? base.enabled,
    compressed_context: {
      max_messages:
        readPositiveIntEnv(ENV_PLANNING_DELEGATE_MAX_MESSAGES) ??
        base.compressed_context.max_messages,
      max_tokens:
        readPositiveIntEnv(ENV_PLANNING_DELEGATE_MAX_TOKENS) ??
        base.compressed_context.max_tokens,
      exclude_execution_history:
        readBooleanEnv(ENV_PLANNING_DELEGATE_EXCLUDE_EXECUTION_HISTORY) ??
        base.compressed_context.exclude_execution_history,
    },
  };
}

/** Env: SMART_ROUTER_PLANNING_TURN_BUFFER — SAAR planning buffer turns (default 2). */
const ENV_PLANNING_TURN_BUFFER = 'SMART_ROUTER_PLANNING_TURN_BUFFER';
/** Env: SMART_ROUTER_PREFIX_CACHE_WEIGHT — SAAR prefix cache weight 0–1 (default 0.20). */
const ENV_PREFIX_CACHE_WEIGHT = 'SMART_ROUTER_PREFIX_CACHE_WEIGHT';
/** Env: SMART_ROUTER_IDLE_TIMEOUT_SECONDS — SAAR idle reopen timeout seconds (default 300). */
const ENV_IDLE_TIMEOUT_SECONDS = 'SMART_ROUTER_IDLE_TIMEOUT_SECONDS';
/** Env: SMART_ROUTER_SWITCH_THRESHOLD — SAAR switch score gate 0–1 (default 0.5). */
const ENV_SWITCH_THRESHOLD = 'SMART_ROUTER_SWITCH_THRESHOLD';

function readPositiveIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readUnitIntervalEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

/** Merge SAAR env overrides onto defaults (invalid env values are ignored). */
export function resolveSaarConfigFromEnv(
  base: SaarConfig = DEFAULT_SAAR_CONFIG,
): SaarConfig {
  return {
    planning_turn_buffer:
      readPositiveIntEnv(ENV_PLANNING_TURN_BUFFER) ?? base.planning_turn_buffer,
    prefix_cache_weight:
      readUnitIntervalEnv(ENV_PREFIX_CACHE_WEIGHT) ?? base.prefix_cache_weight,
    idle_timeout_seconds:
      readPositiveIntEnv(ENV_IDLE_TIMEOUT_SECONDS) ?? base.idle_timeout_seconds,
    switch_threshold:
      readUnitIntervalEnv(ENV_SWITCH_THRESHOLD) ?? base.switch_threshold,
  };
}

/** Per-session SAAR runtime state (SP-121 types; logic in SP-122). */
export const SaarSessionStateSchema = z.object({
  turn_index: z.number().int().nonnegative(),
  hard_lock: z.boolean(),
  last_activity_at: z.string().datetime(),
});

/** Stable snake_case cluster id — used as reason-code suffix (`cluster_${id}`). */
export const RoutingClusterIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/, 'Cluster id must be lowercase snake_case');

export const RoutingClusterSchema = z.object({
  id: RoutingClusterIdSchema,
  tier_bias: TierSchema,
  reference_prompts: z.array(z.string().min(1)).min(1),
  min_similarity: z.number().min(0).max(1),
  min_margin: z.number().min(0).max(1),
});

export const RoutingClustersFileSchema = z
  .object({
    clusters: z.array(RoutingClusterSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, cluster] of value.clusters.entries()) {
      if (seen.has(cluster.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate cluster id: ${cluster.id}`,
          path: ['clusters', index, 'id'],
        });
      }
      seen.add(cluster.id);
    }
  });

export const OperatorConfigSchema = z.object({
  frugality: FrugalityConfigSchema,
  loop_escalation: LoopEscalationConfigSchema,
  pricing: PricingConfigSchema,
  local: LocalConfigSchema,
  hydra: HydraConfigSchema,
  low_intensity: LowIntensityConfigSchema,
  saar: SaarConfigSchema,
  planning_delegate: PlanningDelegateConfigSchema,
  throughput: ThroughputConfigSchema.optional(),
  /** Pre-local_zero tool-use capability gate (SP-177, #98). */
  local_zero: LocalZeroConfigSchema.optional(),
  routing_clusters: RoutingClustersConfigSchema.optional(),
  /**
   * Emergency pin-on-first-turn fallback (#83, SP-161).
   * When true, subsequent turns use the session pin only — multi-stage routing
   * (turn_envelope, triage, HyDRA) is skipped after the initial pin is set.
   * Default false — not a design pivot; enable only when shadow quality regresses.
   */
  pin_only_fallback: z.boolean().default(false),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type OperatorConfig = z.infer<typeof OperatorConfigSchema>;
export type HydraConfig = z.infer<typeof HydraConfigSchema>;
export type LowIntensityConfig = z.infer<typeof LowIntensityConfigSchema>;
