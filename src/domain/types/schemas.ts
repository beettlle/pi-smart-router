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

/**
 * Stage names emitted on a RoutingDecision — full `PIPELINE_STAGE_ORDER`
 * (`src/domain/pipeline/router-pipeline.ts`) plus `'fallback'` (decision-level
 * degradation marker). Kept as a literal list to avoid a circular import with
 * the pipeline module; tests/contract/routing-schemas.test.ts asserts this
 * enum matches `[...PIPELINE_STAGE_ORDER, 'fallback']` (SP-229, #136).
 */
export const RoutingStageSchema = z.enum([
  'hardware_probe',
  'loop_escalation',
  'turn_envelope',
  'typed_judgment',
  'context_fit',
  'low_intensity',
  'session_pin',
  'triage',
  'local_zero',
  'triage_cloud_fallback',
  'hydra_match',
  'safe_default',
  'context_overflow_fallback',
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

export const MessageSchema = z
  .object({
    role: MessageRoleSchema,
    content: z.string(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.unknown()).optional(),
    is_error: z.boolean().optional(),
    status: z.number().optional(),
  })
  .strict();

// ─── RoutingRequest (contract: routing-request.schema.json) ──────────────────

export const RoutingRequestSchema = z
  .object({
    request_id: z.string().uuid(),
    session_id: z.string().min(1),
    prompt_text: z.string(),
    messages: z.array(MessageSchema).optional(),
    turn_type: TurnTypeSchema.optional(),
    compaction_flag: z.boolean().optional(),
    force_model_id: z.string().optional(),
    candidate_model_id: z.string().optional(),
    estimated_input_tokens: z.number().int().nonnegative().optional(),
  })
  .strict();

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

export const CandidateScoreSchema = z
  .object({
    model_id: z.string(),
    score: z.number(),
    shortfall: z.number(),
    rejected_reason: z.string().nullable(),
  })
  .strict();

// ─── RoutingFeatureSidecar (contract: routing-decision.schema.json) ──────────

/** Degraded failover path classification (SP-212, #119). */
export const RoutePathSchema = z.enum(['neural', 'learned', 'heuristic', 'safe_default']);

export const TriageFeatureSummarySchema = z
  .object({
    verdict: z.enum(['trivial', 'complex', 'ambiguous']),
    reason_code: z.string(),
    cyclomatic_score: z.number(),
  })
  .strict();

export const RequirementVectorSchema = z
  .object({
    reasoning: z.number(),
    code_gen: z.number(),
    tool_use: z.number(),
  })
  .strict();

export const ContextFitObservabilitySchema = z
  .object({
    estimated_input_tokens: z.number().nullable(),
    context_fit_viable_count: z.number().nullable(),
    context_fit_rejected_json: z.string().nullable(),
    context_overflow_pin_break: z.boolean(),
    selected_model_max_input_tokens: z.number().nullable(),
    context_fit_reason_code: z.string().nullable(),
  })
  .strict();

export const ClusterMatchTableEntrySchema = z
  .object({
    cluster_id: z.string(),
    tier_bias: TierSchema,
    similarity: z.number(),
    margin: z.number().nullable(),
    confidence: z.enum(['high', 'none']),
    selected: z.boolean(),
  })
  .strict();

export const TierFeatureSummarySchema = z
  .object({
    triage_verdict: z.string().nullable(),
    triage_reason_code: z.string().nullable(),
    cyclomatic_score: z.number().nullable(),
    requirement_reasoning: z.number().nullable(),
    requirement_code_gen: z.number().nullable(),
    requirement_tool_use: z.number().nullable(),
  })
  .strict();

export const RejectedTierEntrySchema = z
  .object({
    tier: z.string(),
    expected_cost_usd: z.number(),
    adjusted_expected_cost_usd: z.number(),
    reason: z.string(),
  })
  .strict();

export const LowIntensityBreakdownSchema = z
  .object({
    score: z.number().nullable(),
    tier_hint: TierSchema.nullable(),
    tier_hint_reason_code: z.string().nullable(),
    tier_selection_reason_code: z.string().nullable(),
    p_success_cheap: z.number().nullable(),
    p_success_raw: z.number().nullable(),
    p_success_calibrated: z.number().nullable(),
    p_success_alpha: z.number().nullable(),
    rejected_tiers: z.array(RejectedTierEntrySchema),
  })
  .strict();

export const TierSelectionObservabilitySchema = z
  .object({
    cluster_id: z.string().nullable(),
    cluster_similarity: z.number().nullable(),
    cluster_margin: z.number().nullable(),
    low_intensity_score: z.number().nullable(),
    tier_hint: TierSchema.nullable(),
    p_success_cheap: z.number().nullable(),
    local_eligible_reason: z.string().nullable(),
    tier_selection_reason_code: z.string().nullable(),
    cluster_match_table: z.array(ClusterMatchTableEntrySchema).nullable(),
    tier_feature_summary: TierFeatureSummarySchema.nullable(),
    low_intensity_breakdown: LowIntensityBreakdownSchema.nullable(),
    local_zero_skip_reasons: z.array(z.string()),
  })
  .strict();

export const BreakevenObservabilitySchema = z
  .object({
    marginal_savings: z.number().nullable(),
    future_cache_value: z.number().nullable(),
    cache_reprime_cost: z.number().nullable(),
    decision: z.enum(['pass', 'blocked']).nullable(),
    breakeven_reason_code: z.string().nullable(),
  })
  .strict();

export const SaarObservabilitySchema = z
  .object({
    buffer_active: z.boolean(),
    hard_lock: z.boolean(),
    turn_index_in_session: z.number().nullable(),
    planning_turn_buffer: z.number().nullable(),
    idle_timeout_seconds: z.number().nullable(),
    saar_reason_code: z.string().nullable(),
  })
  .strict();

export const PlanningDelegatePathSchema = z.enum(['delegate', 'direct', 'none']);

export const PlanningDelegateObservabilitySchema = z
  .object({
    path: PlanningDelegatePathSchema,
    primary_model_id: z.string().nullable(),
    delegate_model_id: z.string().nullable(),
    // Mirrors CompressedContextSpecSchema (defined in the operator-config
    // section below); inlined to avoid a module-evaluation-order dependency.
    compressed_context: z
      .object({
        max_messages: z.number().int().positive(),
        max_tokens: z.number().int().positive(),
        exclude_execution_history: z.boolean(),
      })
      .strict()
      .nullable(),
    planning_delegate_reason_code: z.string().nullable(),
    fallback_reason: z.string().nullable(),
    workers_spawned: z.number().nullable(),
    workers_succeeded: z.number().nullable(),
    worker_timeout_count: z.number().nullable(),
  })
  .strict();

/** HyDRA text encoder selection (SP-156, #80). Hoisted above the feature
 * sidecar schema: cascade telemetry (SP-292) embeds EncoderSchema there. */
export const EncoderSchema = z.enum(['minilm', 'granite']);

export type Encoder = z.infer<typeof EncoderSchema>;

export const DEFAULT_ENCODER: Encoder = 'minilm';

/**
 * Privacy-safe routing feature sidecar attached to live decisions (SP-057).
 * Mirrors {@link RoutingFeatureSidecar} in entities.ts.
 */
export const RoutingFeatureSidecarSchema = z
  .object({
    triage: TriageFeatureSummarySchema.nullable(),
    requirements: RequirementVectorSchema.nullable(),
    candidates: z.array(CandidateScoreSchema).nullable(),
    tier_hint: TierSchema.nullable(),
    tier_hint_reason_code: z.string().nullable(),
    low_intensity_score: z.number().nullable(),
    p_success_cheap: z.number().nullable(),
    p_success_raw: z.number().nullable(),
    p_success_calibrated: z.number().nullable(),
    p_success_alpha: z.number().nullable(),
    context_fit: ContextFitObservabilitySchema.optional(),
    tier_selection: TierSelectionObservabilitySchema.optional(),
    breakeven: BreakevenObservabilitySchema.optional(),
    saar: SaarObservabilitySchema.optional(),
    planning_delegate: PlanningDelegateObservabilitySchema.optional(),
    local_eligible_reason: z.string().nullable(),
    route_path: RoutePathSchema.nullable().optional(),
    route_path_confidence: z.number().nullable().optional(),
    embedding: z.array(z.number()).length(384).optional(),
    prewarm_attempted: z.boolean().nullable().optional(),
    prewarm_accepted: z.boolean().nullable().optional(),
    prewarm_disabled_reason: z.string().nullable().optional(),
    // Encoder cascade decision telemetry (SP-292, #173); present only on
    // cascade-enabled hydra_match decisions.
    encoder_selected: EncoderSchema.nullable().optional(),
    token_estimate: z.number().nullable().optional(),
    cascade_threshold: z.number().nullable().optional(),
    cascade_fallback_reason: z.string().nullable().optional(),
  })
  .strict();

// ─── RoutingDecision (contract: routing-decision.schema.json) ────────────────

export const RoutingDecisionSchema = z
  .object({
    request_id: z.string().uuid(),
    selected_model_id: z.string(),
    tier: TierSchema,
    stage: RoutingStageSchema,
    reason_code: z.string(),
    candidates: z.array(CandidateScoreSchema).optional(),
    estimated_cost_usd: z.number().nonnegative().optional(),
    routing_latency_ms: z.number().nonnegative(),
    pin_reason: PinReasonSchema.nullable(),
    /** Privacy-safe feature sidecar attached by live routing (SP-057, SP-229). */
    features: RoutingFeatureSidecarSchema.optional(),
  })
  .strict();

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

/** HyDRA requirement head mode (SP-158, #81). */
export const HydraHeadsSchema = z.enum(['learned_projection', 'modernbert_k4']);

export type HydraHeads = z.infer<typeof HydraHeadsSchema>;

export const DEFAULT_HYDRA_HEADS: HydraHeads = 'learned_projection';

/**
 * Opt-in encoder cascade knobs (SP-291, #173 part 1).
 *
 * When enabled, prompts whose estimated token count reaches
 * `token_threshold` are routed to `long_context_encoder` (Granite) instead of
 * the primary `hydra.encoder` (MiniLM), avoiding 512-token truncation on long
 * prompts. Default OFF: existing single-encoder installs are unaffected and
 * pay zero added cost (the gate is pre-embedding arithmetic).
 *
 * Hard constraint (#173): embeddings from different encoders live in different
 * vector spaces — the cascade must never mix per-encoder artifacts (centroids,
 * learned projection). Per-encoder artifact sets + cascading embedder land in
 * SP-292.
 */
export const EncoderCascadeConfigSchema = z.object({
  /** When false (default), every prompt uses the primary `hydra.encoder`. */
  enabled: z.boolean().default(false),
  /** Long-context encoder selected at/over the threshold. Granite 97M (SP-156). */
  long_context_encoder: EncoderSchema.default('granite'),
  /**
   * Estimated-token boundary: estimates >= threshold route to the long-context
   * encoder. Default 512 matches the MiniLM context window.
   */
  token_threshold: z.number().int().min(1).default(512),
});

export type EncoderCascadeConfig = z.infer<typeof EncoderCascadeConfigSchema>;

/** Encoder cascade defaults per #173: opt-in, default off, 512-token threshold. */
export const DEFAULT_ENCODER_CASCADE_CONFIG: Readonly<EncoderCascadeConfig> = {
  enabled: false,
  long_context_encoder: 'granite',
  token_threshold: 512,
} as const;

export const HydraConfigSchema = z.object({
  artifact_cache_path: z.string(),
  /** ONNX encoder: MiniLM (default) or Granite 97M 384-dim long-context trial. */
  encoder: EncoderSchema.default(DEFAULT_ENCODER),
  /**
   * Opt-in per-prompt encoder cascade (SP-291, #173). Default off; when
   * enabled, over-threshold prompts use the long-context encoder.
   */
  encoder_cascade: EncoderCascadeConfigSchema.default(
    DEFAULT_ENCODER_CASCADE_CONFIG,
  ),
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

/** Planning delegate operator knobs (SP-142, #71; timeouts SP-213, #120). */
export const PlanningDelegateConfigSchema = z.object({
  enabled: z.boolean(),
  compressed_context: CompressedContextSpecSchema,
  /** Global cap (ms) for the whole delegate stage; mirrors llm-use WORKER_GLOBAL_TIMEOUT. */
  global_timeout_ms: z.number().int().positive(),
  /** Per-call cap (ms) for each delegate sub-call worker; mirrors llm-use WORKER_CALL_TIMEOUT. */
  sub_call_timeout_ms: z.number().int().positive(),
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

/**
 * Degraded neural failover sandwich knobs (SP-212, #119).
 * Fail-open chain when the encoder/neural stage errors or exceeds budget:
 * learned map → operator pattern pack → safe default. Never crashes the host.
 */
export const DegradedRouteConfigSchema = z.object({
  /** When false, neural failures fall through to the legacy safe_default stage. */
  enabled: z.boolean().default(true),
  /** Minimum learned-entry confidence to honor a learned tier suggestion. */
  learned_min_confidence: z.number().min(0).max(1),
  /** Maximum learned-map entries (FIFO eviction; poisoning bound). */
  learned_max_entries: z.number().int().positive(),
  /**
   * Cheap tool-use cue ceiling (0–1). Learned/pattern suggestions toward cheaper
   * tiers are only honored below this estimate — a cheap overlay may never alone
   * override a predicted capability shortfall.
   */
  pattern_tool_use_ceiling: z.number().min(0).max(1),
  /**
   * SP-252 / #148: when true, missing/invalid HyDRA projection or ModernBERT K=4
   * head weight artifacts are treated as `neural_misconfigured` — the matcher
   * refuses to silently score with placeholder heads and routing drops into the
   * degraded sandwich with the SP-251 reason codes (`hydra_weights_missing`,
   * `k4_heads_placeholder`) surfaced on the decision path. Default false keeps
   * the fail-open placeholder behavior for existing installs.
   */
  fail_closed_on_missing_weights: z.boolean().default(false),
});

export type DegradedRouteConfig = z.infer<typeof DegradedRouteConfigSchema>;

/**
 * Workload heat map + soft fleet affinity knobs (SP-215, #115).
 * Colibri learning-cache analog: privacy-safe histogram of successful routes
 * (requirement fingerprint / cluster id → tier/model success counts) that
 * soft-biases first-turn expected-cost selection. The bias is SOFT — it only
 * discounts the heat-preferred tier's expected cost and can never override a
 * hard capability shortfall, the frontier–economical price-delta gate, pin
 * cache economics, or absolute release gates. No frugality defaults or
 * absolute gates are flipped by this config.
 */
export const WorkloadHeatConfigSchema = z.object({
  /** Master switch for heat recording and soft first-turn bias. */
  enabled: z.boolean().default(true),
  /**
   * Fractional expected-cost discount applied to the heat-preferred tier
   * (0–0.25). Applied only after a heat cell clears min_samples and
   * min_success_margin; capped so heat can never dominate hard gates.
   */
  bias_strength: z.number().min(0).max(0.25),
  /** Minimum recorded samples on a tier before its heat cell may bias routing. */
  min_samples: z.number().int().positive(),
  /** Minimum success-rate margin over the runner-up tier required to prefer a tier. */
  min_success_margin: z.number().min(0).max(1),
  /** Maximum histogram cells per key space (FIFO eviction; poisoning bound). */
  max_entries: z.number().int().positive(),
  /**
   * Live affinity updates at pin-safe boundaries (Colibri REPIN analog).
   * Default OFF — serve-time repinning is opt-in; the persisted histogram and
   * first-turn soft bias work without it.
   */
  live_update_enabled: z.boolean().default(false),
  /** Hysteresis band: success-rate advantage required before a live affinity swap (~25%). */
  hysteresis_band: z.number().min(0).max(1),
  /** Maximum live affinity swaps per session (thrash cap). */
  swap_cap: z.number().int().positive(),
});

export type WorkloadHeatConfig = z.infer<typeof WorkloadHeatConfigSchema>;

/** Workload heat defaults per #115 (SP-215). No frugality/gate flips. */
export const DEFAULT_WORKLOAD_HEAT_CONFIG: Readonly<WorkloadHeatConfig> = {
  enabled: true,
  bias_strength: 0.1,
  min_samples: 3,
  min_success_margin: 0.15,
  max_entries: 512,
  live_update_enabled: false,
  hysteresis_band: 0.25,
  swap_cap: 1,
} as const;

/** Degraded sandwich defaults per #119 (SP-212). */
export const DEFAULT_DEGRADED_ROUTE_CONFIG: Readonly<DegradedRouteConfig> = {
  enabled: true,
  learned_min_confidence: 0.6,
  learned_max_entries: 512,
  pattern_tool_use_ceiling: 0.3,
  /** SP-252 / #148: fail-open placeholders remain the default (#148 opt-in). */
  fail_closed_on_missing_weights: false,
} as const;

/**
 * Speculative prewarm knobs (SP-217, #117 — Colibri PILOT pattern).
 * Optional local/encoder prewarm within a strict TTFT deadline, with an
 * adaptive acceptance guard. Default OFF; fail open to the normal route.
 * Pre-generation only — the warm probe never waits on generated tokens.
 */
export const SpeculativePrewarmConfigSchema = z.object({
  /** When false (default), no speculative prewarm is attempted. */
  enabled: z.boolean().default(false),
  /** Hard deadline for a prewarm attempt; timeout cancels and proceeds (no hang). */
  deadline_ms: z.number().int().min(1).max(5000).default(50),
  /** Guard band: session acceptance rate below this disables prewarm. */
  min_acceptance_rate: z.number().min(0).max(1).default(0.5),
  /** Minimum recorded attempts before the acceptance guard may trip. */
  min_attempts_before_guard: z.number().int().min(1).max(100).default(4),
});

export type SpeculativePrewarmConfig = z.infer<typeof SpeculativePrewarmConfigSchema>;

/** Speculative prewarm defaults per #117 (SP-217): default off, fail open. */
export const DEFAULT_SPECULATIVE_PREWARM_CONFIG: Readonly<SpeculativePrewarmConfig> = {
  enabled: false,
  deadline_ms: 50,
  min_acceptance_rate: 0.5,
  min_attempts_before_guard: 4,
} as const;

// ─── Adaptive reasoning (SP-246, #166) ──────────────────────────────────────

/**
 * Discrete thinking levels — mirrors pi-ai `ThinkingLevel` (kept as a literal
 * zod enum so domain schemas stay free of pi-ai imports).
 */
export const AdaptiveReasoningLevelSchema = z.enum([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export type AdaptiveReasoningLevel = z.infer<typeof AdaptiveReasoningLevelSchema>;

/** Rank order used to validate floor ≤ ceiling (minimal < low < … < max). */
const ADAPTIVE_REASONING_LEVEL_ORDER: Readonly<Record<AdaptiveReasoningLevel, number>> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
};

/**
 * Adaptive reasoning operator knobs (SP-246, #166).
 *
 * Floor/ceiling are discrete thinking levels that bound what the *policy*
 * derives per turn class — deliberately NOT a free-form verbosity percent.
 * An explicit operator `/thinking` choice is never lowered: floor/ceiling
 * bind only policy-derived levels (see src/domain/delegation/adaptive-reasoning.ts).
 */
export const AdaptiveReasoningConfigSchema = z
  .object({
    /** When false, the policy is skipped: caller reasoning passes through unchanged. */
    enabled: z.boolean().default(true),
    /** Floor: policy-derived levels are raised to at least this level. */
    min_level: AdaptiveReasoningLevelSchema.optional(),
    /** Ceiling: policy-derived levels are capped at this level. */
    max_level: AdaptiveReasoningLevelSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.min_level !== undefined &&
      value.max_level !== undefined &&
      ADAPTIVE_REASONING_LEVEL_ORDER[value.min_level] >
        ADAPTIVE_REASONING_LEVEL_ORDER[value.max_level]
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'adaptive_reasoning.min_level must not exceed max_level',
        path: ['min_level'],
      });
    }
  });

export type AdaptiveReasoningConfig = z.infer<typeof AdaptiveReasoningConfigSchema>;

/** Adaptive reasoning defaults per #166 (SP-246): on, no floor/ceiling bounds. */
export const DEFAULT_ADAPTIVE_REASONING_CONFIG: Readonly<AdaptiveReasoningConfig> = {
  enabled: true,
} as const;

/** Env: SMART_ROUTER_ADAPTIVE_REASONING_ENABLED — master switch (default true). */
const ENV_ADAPTIVE_REASONING_ENABLED = 'SMART_ROUTER_ADAPTIVE_REASONING_ENABLED';
/** Env: SMART_ROUTER_ADAPTIVE_REASONING_MIN_LEVEL — policy floor level (unset = none). */
const ENV_ADAPTIVE_REASONING_MIN_LEVEL = 'SMART_ROUTER_ADAPTIVE_REASONING_MIN_LEVEL';
/** Env: SMART_ROUTER_ADAPTIVE_REASONING_MAX_LEVEL — policy ceiling level (unset = none). */
const ENV_ADAPTIVE_REASONING_MAX_LEVEL = 'SMART_ROUTER_ADAPTIVE_REASONING_MAX_LEVEL';

const ADAPTIVE_REASONING_LEVEL_NAMES = new Set<string>(AdaptiveReasoningLevelSchema.options);

function readLevelEnv(name: string): AdaptiveReasoningLevel | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  return ADAPTIVE_REASONING_LEVEL_NAMES.has(normalized)
    ? (normalized as AdaptiveReasoningLevel)
    : undefined;
}

/** Merge adaptive reasoning env overrides onto defaults (invalid env values are ignored). */
export function resolveAdaptiveReasoningConfigFromEnv(
  base: AdaptiveReasoningConfig = DEFAULT_ADAPTIVE_REASONING_CONFIG,
): AdaptiveReasoningConfig {
  const minLevel = readLevelEnv(ENV_ADAPTIVE_REASONING_MIN_LEVEL) ?? base.min_level;
  const maxLevel = readLevelEnv(ENV_ADAPTIVE_REASONING_MAX_LEVEL) ?? base.max_level;
  return {
    enabled: readBooleanEnv(ENV_ADAPTIVE_REASONING_ENABLED) ?? base.enabled,
    ...(minLevel !== undefined ? { min_level: minLevel } : {}),
    ...(maxLevel !== undefined ? { max_level: maxLevel } : {}),
  };
}

/** SAAR defaults per routing-roadmap.md §2 P0 (SP-121). */
export const DEFAULT_SAAR_CONFIG: Readonly<SaarConfig> = {
  planning_turn_buffer: 2,
  prefix_cache_weight: 0.20,
  idle_timeout_seconds: 300,
  switch_threshold: 0.5,
} as const;

/** Planning delegate defaults per routing-roadmap.md §2 P0 / #71 (SP-142).
 * Timeout bounds mirror llm-use worker discipline (SP-213, #120):
 * 120s global stage cap (WORKER_GLOBAL_TIMEOUT), 30s per sub-call (WORKER_CALL_TIMEOUT).
 */
export const DEFAULT_PLANNING_DELEGATE_CONFIG: Readonly<PlanningDelegateConfig> = {
  enabled: true,
  compressed_context: {
    max_messages: 12,
    max_tokens: 16_384,
    exclude_execution_history: true,
  },
  global_timeout_ms: 120_000,
  sub_call_timeout_ms: 30_000,
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
/** Env: SMART_ROUTER_PLANNING_DELEGATE_GLOBAL_TIMEOUT_MS — global delegate stage cap ms (default 120000). */
const ENV_PLANNING_DELEGATE_GLOBAL_TIMEOUT_MS =
  'SMART_ROUTER_PLANNING_DELEGATE_GLOBAL_TIMEOUT_MS';
/** Env: SMART_ROUTER_PLANNING_DELEGATE_SUB_CALL_TIMEOUT_MS — per sub-call worker cap ms (default 30000). */
const ENV_PLANNING_DELEGATE_SUB_CALL_TIMEOUT_MS =
  'SMART_ROUTER_PLANNING_DELEGATE_SUB_CALL_TIMEOUT_MS';

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
    global_timeout_ms:
      readPositiveIntEnv(ENV_PLANNING_DELEGATE_GLOBAL_TIMEOUT_MS) ??
      base.global_timeout_ms,
    sub_call_timeout_ms:
      readPositiveIntEnv(ENV_PLANNING_DELEGATE_SUB_CALL_TIMEOUT_MS) ??
      base.sub_call_timeout_ms,
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

// ─── Typed judgment (SP-304, #184) ──────────────────────────────────────────

/** Loopback hosts accepted for `typed_judgment.endpoint` without `allow_remote`. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** Parse an endpoint URL and return its normalized hostname (brackets stripped). */
function parseEndpointHostname(endpoint: string): string | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return undefined;
  }
  const hostname = url.hostname;
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Typed judgment (Jev-compatible "systemone") operator knobs (SP-304, #184).
 *
 * The router can ask a calibrated, schema-safe semantic judge about a turn
 * via `TypedJudgmentPort` (src/domain/ports/typed-judgment-port.ts). Default
 * OFF: existing installs pay zero added cost and no network call is made.
 *
 * Fail closed on remote endpoints: `superRefine` rejects any non-loopback
 * `endpoint` host unless the operator explicitly sets `allow_remote: true`
 * (local OpenJev is the intended default; remote hosted Jev is opt-in).
 *
 * The schema never holds an API key value — only the name of the env var
 * (`api_key_env`) the adapter reads the key from at call time.
 */
export const TypedJudgmentConfigSchema = z
  .object({
    /** When false (default), no typed-judgment calls are made. */
    enabled: z.boolean().default(false),
    /** Judge endpoint. Loopback-only unless `allow_remote` is true. */
    endpoint: z.string().min(1).default('http://127.0.0.1:8080/v1/systemone'),
    /** Judge model id (hosted Jev ignores this; OpenJev uses it). */
    model: z.string().min(1).default('openjev-latest'),
    /**
     * Per-call timeout (ms), sized for user-prompt turns: local OpenJev runs
     * ~385–990 ms per judgment (epic #183), so 1500 ms covers p99 with
     * headroom without stalling interactive routing.
     */
    timeout_ms: z.number().int().positive().default(1500),
    /**
     * Judge samples per question (OpenJev extension for self-consistency
     * voting). The adapter omits this field for hosted Jev.
     */
    samples: z.number().int().positive().default(1),
    /**
     * Name of the env var holding the API key (never the key itself).
     * Domain code and config never read or store key material.
     */
    api_key_env: z.string().min(1).default('TYPESAFE_API_KEY'),
    /**
     * Opt-in escape hatch allowing non-loopback endpoints (hosted Jev).
     * Default false = fail closed to local judge only.
     */
    allow_remote: z.boolean().default(false),
    /**
     * Minimum answer confidence (0–1) for a judgment to influence routing.
     * Consumed by later trains (#188); defined now to stabilize the config
     * shape.
     */
    min_confidence: z.number().min(0).max(1).default(0.6),
  })
  .superRefine((value, ctx) => {
    const hostname = parseEndpointHostname(value.endpoint);
    if (hostname === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'typed_judgment.endpoint must be a valid URL',
        path: ['endpoint'],
      });
      return;
    }
    if (!value.allow_remote && !LOOPBACK_HOSTS.has(hostname)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'typed_judgment.endpoint must be loopback (127.0.0.1, ::1, or localhost) ' +
          'unless allow_remote is true (fail closed: remote judges are opt-in)',
        path: ['endpoint'],
      });
    }
  });

export type TypedJudgmentConfig = z.infer<typeof TypedJudgmentConfigSchema>;

/** Typed judgment defaults per #184 (SP-304): disabled, loopback-only. */
export const DEFAULT_TYPED_JUDGMENT_CONFIG: Readonly<TypedJudgmentConfig> = {
  enabled: false,
  endpoint: 'http://127.0.0.1:8080/v1/systemone',
  model: 'openjev-latest',
  timeout_ms: 1500,
  samples: 1,
  api_key_env: 'TYPESAFE_API_KEY',
  allow_remote: false,
  min_confidence: 0.6,
} as const;

/** Env: SMART_ROUTER_TYPED_JUDGMENT_ENABLED — master switch (default false). */
const ENV_TYPED_JUDGMENT_ENABLED = 'SMART_ROUTER_TYPED_JUDGMENT_ENABLED';
/** Env: SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT — judge endpoint (loopback-only unless allow_remote). */
const ENV_TYPED_JUDGMENT_ENDPOINT = 'SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT';
/** Env: SMART_ROUTER_TYPED_JUDGMENT_MODEL — judge model id (default openjev-latest). */
const ENV_TYPED_JUDGMENT_MODEL = 'SMART_ROUTER_TYPED_JUDGMENT_MODEL';
/** Env: SMART_ROUTER_TYPED_JUDGMENT_TIMEOUT_MS — per-call timeout ms (default 1500). */
const ENV_TYPED_JUDGMENT_TIMEOUT_MS = 'SMART_ROUTER_TYPED_JUDGMENT_TIMEOUT_MS';
/** Env: SMART_ROUTER_TYPED_JUDGMENT_SAMPLES — OpenJev samples per question (default 1). */
const ENV_TYPED_JUDGMENT_SAMPLES = 'SMART_ROUTER_TYPED_JUDGMENT_SAMPLES';
/** Env: SMART_ROUTER_TYPED_JUDGMENT_API_KEY_ENV — name of the env var holding the API key. */
const ENV_TYPED_JUDGMENT_API_KEY_ENV = 'SMART_ROUTER_TYPED_JUDGMENT_API_KEY_ENV';
/** Env: SMART_ROUTER_TYPED_JUDGMENT_ALLOW_REMOTE — permit non-loopback endpoints (default false). */
const ENV_TYPED_JUDGMENT_ALLOW_REMOTE = 'SMART_ROUTER_TYPED_JUDGMENT_ALLOW_REMOTE';
/** Env: SMART_ROUTER_TYPED_JUDGMENT_MIN_CONFIDENCE — min answer confidence 0–1 (default 0.6). */
const ENV_TYPED_JUDGMENT_MIN_CONFIDENCE = 'SMART_ROUTER_TYPED_JUDGMENT_MIN_CONFIDENCE';

function readNonEmptyStringEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Merge typed judgment env overrides onto defaults (invalid scalar env values
 * are ignored). An env `endpoint` override is re-validated against the same
 * loopback rule as the schema: if the merged result fails validation (e.g. a
 * remote endpoint without `allow_remote`), fall back to the base config and
 * keep `enabled: false` (fail closed — never route judgments to an endpoint
 * the operator did not explicitly clear).
 */
export function resolveTypedJudgmentConfigFromEnv(
  base: TypedJudgmentConfig = DEFAULT_TYPED_JUDGMENT_CONFIG,
): TypedJudgmentConfig {
  const candidate: TypedJudgmentConfig = {
    enabled: readBooleanEnv(ENV_TYPED_JUDGMENT_ENABLED) ?? base.enabled,
    endpoint: readNonEmptyStringEnv(ENV_TYPED_JUDGMENT_ENDPOINT) ?? base.endpoint,
    model: readNonEmptyStringEnv(ENV_TYPED_JUDGMENT_MODEL) ?? base.model,
    timeout_ms: readPositiveIntEnv(ENV_TYPED_JUDGMENT_TIMEOUT_MS) ?? base.timeout_ms,
    samples: readPositiveIntEnv(ENV_TYPED_JUDGMENT_SAMPLES) ?? base.samples,
    api_key_env: readNonEmptyStringEnv(ENV_TYPED_JUDGMENT_API_KEY_ENV) ?? base.api_key_env,
    allow_remote: readBooleanEnv(ENV_TYPED_JUDGMENT_ALLOW_REMOTE) ?? base.allow_remote,
    min_confidence:
      readUnitIntervalEnv(ENV_TYPED_JUDGMENT_MIN_CONFIDENCE) ?? base.min_confidence,
  };
  const parsed = TypedJudgmentConfigSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }
  // Fail closed: invalid env override (e.g. remote endpoint without
  // allow_remote) leaves the base config intact and disabled.
  return { ...base, enabled: false };
}

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
  /** Degraded neural failover sandwich knobs (SP-212, #119). */
  degraded_route: DegradedRouteConfigSchema.optional(),
  /** Workload heat map + soft fleet affinity knobs (SP-215, #115). */
  workload_heat: WorkloadHeatConfigSchema.optional(),
  /** Speculative prewarm with acceptance guard (SP-217, #117). Default off. */
  speculative_prewarm: SpeculativePrewarmConfigSchema.optional(),
  /** Adaptive reasoning (thinking-level) policy knobs (SP-246, #166). Default on. */
  adaptive_reasoning: AdaptiveReasoningConfigSchema.optional(),
  /** Typed judgment (Jev systemone) knobs (SP-304, #184). Default off; loopback-only unless allow_remote. */
  typed_judgment: TypedJudgmentConfigSchema.optional(),
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
