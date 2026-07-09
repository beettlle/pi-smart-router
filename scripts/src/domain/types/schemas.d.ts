/**
 * Zod schemas mirroring JSON-schema contracts and data-model entities.
 *
 * Canonical contract sources:
 *   - specs/001-build-smart-router/contracts/routing-request.schema.json
 *   - specs/001-build-smart-router/contracts/routing-decision.schema.json
 *   - specs/001-build-smart-router/data-model.md
 */
import { z } from 'zod';
export declare const TurnTypeSchema: z.ZodEnum<{
    planning: "planning";
    tool_result: "tool_result";
    subagent: "subagent";
    main_loop: "main_loop";
    unknown: "unknown";
}>;
export declare const PinReasonSchema: z.ZodEnum<{
    initial: "initial";
    user_forced: "user_forced";
    loop_escalation: "loop_escalation";
    compaction: "compaction";
    cache_economics: "cache_economics";
    context_overflow: "context_overflow";
}>;
export declare const TierSchema: z.ZodEnum<{
    "zero-tier": "zero-tier";
    "economical-cloud": "economical-cloud";
    "frontier-cloud": "frontier-cloud";
}>;
export declare const RoutingStageSchema: z.ZodEnum<{
    triage: "triage";
    turn_envelope: "turn_envelope";
    session_pin: "session_pin";
    local_zero: "local_zero";
    hydra_match: "hydra_match";
    fallback: "fallback";
}>;
export declare const PriceSourceSchema: z.ZodEnum<{
    override: "override";
    registry: "registry";
    yaml_fallback: "yaml_fallback";
}>;
export declare const MessageRoleSchema: z.ZodEnum<{
    user: "user";
    assistant: "assistant";
    system: "system";
    tool: "tool";
}>;
export declare const MessageSchema: z.ZodObject<{
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
        system: "system";
        tool: "tool";
    }>;
    content: z.ZodString;
    tool_call_id: z.ZodOptional<z.ZodString>;
    tool_calls: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
}, z.core.$strip>;
export declare const RoutingRequestSchema: z.ZodObject<{
    request_id: z.ZodString;
    session_id: z.ZodString;
    prompt_text: z.ZodString;
    messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<{
            user: "user";
            assistant: "assistant";
            system: "system";
            tool: "tool";
        }>;
        content: z.ZodString;
        tool_call_id: z.ZodOptional<z.ZodString>;
        tool_calls: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    }, z.core.$strip>>>;
    turn_type: z.ZodOptional<z.ZodEnum<{
        planning: "planning";
        tool_result: "tool_result";
        subagent: "subagent";
        main_loop: "main_loop";
        unknown: "unknown";
    }>>;
    compaction_flag: z.ZodOptional<z.ZodBoolean>;
    force_model_id: z.ZodOptional<z.ZodString>;
    candidate_model_id: z.ZodOptional<z.ZodString>;
    estimated_input_tokens: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const SessionPinSchema: z.ZodObject<{
    session_id: z.ZodString;
    pinned_model_id: z.ZodString;
    pin_reason: z.ZodEnum<{
        initial: "initial";
        user_forced: "user_forced";
        loop_escalation: "loop_escalation";
        compaction: "compaction";
        cache_economics: "cache_economics";
        context_overflow: "context_overflow";
    }>;
    has_ever_switched: z.ZodBoolean;
    consecutive_upstream_errors: z.ZodNumber;
    consecutive_tool_failures: z.ZodNumber;
    last_tool_failure_signature: z.ZodNullable<z.ZodString>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export declare const ModelCapabilitiesSchema: z.ZodObject<{
    reasoning: z.ZodNumber;
    code_gen: z.ZodNumber;
    tool_use: z.ZodNumber;
}, z.core.$strip>;
export declare const ModelPerformanceSchema: z.ZodObject<{
    latency_p50_ms: z.ZodOptional<z.ZodNumber>;
    verbosity_factor: z.ZodOptional<z.ZodNumber>;
    cache_friendly: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const ModelPricingSchema: z.ZodObject<{
    registry_key: z.ZodOptional<z.ZodString>;
    fallback_cost_per_1m: z.ZodNumber;
}, z.core.$strip>;
export declare const ModelLimitsSchema: z.ZodObject<{
    max_input_tokens: z.ZodOptional<z.ZodNumber>;
    max_output_tokens: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const ModelProfileSchema: z.ZodObject<{
    id: z.ZodString;
    tier: z.ZodEnum<{
        "zero-tier": "zero-tier";
        "economical-cloud": "economical-cloud";
        "frontier-cloud": "frontier-cloud";
    }>;
    provider: z.ZodString;
    endpoint: z.ZodOptional<z.ZodString>;
    capabilities: z.ZodObject<{
        reasoning: z.ZodNumber;
        code_gen: z.ZodNumber;
        tool_use: z.ZodNumber;
    }, z.core.$strip>;
    performance: z.ZodOptional<z.ZodObject<{
        latency_p50_ms: z.ZodOptional<z.ZodNumber>;
        verbosity_factor: z.ZodOptional<z.ZodNumber>;
        cache_friendly: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    pricing: z.ZodObject<{
        registry_key: z.ZodOptional<z.ZodString>;
        fallback_cost_per_1m: z.ZodNumber;
    }, z.core.$strip>;
    limits: z.ZodOptional<z.ZodObject<{
        max_input_tokens: z.ZodOptional<z.ZodNumber>;
        max_output_tokens: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    healthy: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/** Zod-validated model profile — aligned with {@link ModelProfile} in entities.ts. */
export type ValidatedModelProfile = z.infer<typeof ModelProfileSchema>;
export declare const CandidateScoreSchema: z.ZodObject<{
    model_id: z.ZodString;
    score: z.ZodNumber;
    shortfall: z.ZodNumber;
    rejected_reason: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const RoutingDecisionSchema: z.ZodObject<{
    request_id: z.ZodString;
    selected_model_id: z.ZodString;
    tier: z.ZodEnum<{
        "zero-tier": "zero-tier";
        "economical-cloud": "economical-cloud";
        "frontier-cloud": "frontier-cloud";
    }>;
    stage: z.ZodEnum<{
        triage: "triage";
        turn_envelope: "turn_envelope";
        session_pin: "session_pin";
        local_zero: "local_zero";
        hydra_match: "hydra_match";
        fallback: "fallback";
    }>;
    reason_code: z.ZodString;
    candidates: z.ZodOptional<z.ZodArray<z.ZodObject<{
        model_id: z.ZodString;
        score: z.ZodNumber;
        shortfall: z.ZodNumber;
        rejected_reason: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
    estimated_cost_usd: z.ZodOptional<z.ZodNumber>;
    routing_latency_ms: z.ZodNumber;
    pin_reason: z.ZodNullable<z.ZodEnum<{
        initial: "initial";
        user_forced: "user_forced";
        loop_escalation: "loop_escalation";
        compaction: "compaction";
        cache_economics: "cache_economics";
        context_overflow: "context_overflow";
    }>>;
}, z.core.$strip>;
export declare const PriceCatalogSchema: z.ZodObject<{
    registry_snapshot: z.ZodRecord<z.ZodString, z.ZodNumber>;
    registry_limits_snapshot: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        max_input_tokens: z.ZodOptional<z.ZodNumber>;
        max_output_tokens: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    user_overrides: z.ZodRecord<z.ZodString, z.ZodNumber>;
    last_updated: z.ZodString;
    source: z.ZodEnum<{
        override: "override";
        registry: "registry";
        yaml_fallback: "yaml_fallback";
    }>;
}, z.core.$strip>;
export declare const RoutingTelemetrySchema: z.ZodObject<{
    timestamp: z.ZodString;
    session_id: z.ZodString;
    request_id: z.ZodString;
    turn_type: z.ZodString;
    stage: z.ZodString;
    reason_code: z.ZodString;
    selected_model_id: z.ZodString;
    estimated_cost_usd: z.ZodNumber;
    routing_latency_ms: z.ZodNumber;
    pin_reason: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const FrugalityConfigSchema: z.ZodObject<{
    lambda_cost: z.ZodNumber;
    lambda_latency: z.ZodNumber;
    lambda_verbosity: z.ZodNumber;
}, z.core.$strip>;
export declare const LoopEscalationConfigSchema: z.ZodObject<{
    threshold: z.ZodNumber;
}, z.core.$strip>;
export declare const PricingConfigSchema: z.ZodObject<{
    staleness_days: z.ZodNumber;
}, z.core.$strip>;
export declare const LocalConfigSchema: z.ZodObject<{
    min_memory_gb_full: z.ZodNumber;
    min_memory_gb_classification: z.ZodNumber;
    battery_threshold_pct: z.ZodNumber;
}, z.core.$strip>;
export declare const HydraConfigSchema: z.ZodObject<{
    artifact_cache_path: z.ZodString;
}, z.core.$strip>;
export declare const LowIntensityWeightsSchema: z.ZodObject<{
    prompt_shortness: z.ZodNumber;
    token_shortness: z.ZodNumber;
    cyclomatic_low: z.ZodNumber;
    trivial_signal: z.ZodNumber;
    complex_inverse: z.ZodNumber;
    triage_verdict: z.ZodNumber;
    turn_type: z.ZodNumber;
    no_tool_context: z.ZodNumber;
    message_shallow: z.ZodNumber;
    prose_ratio: z.ZodNumber;
    requirement_low: z.ZodNumber;
    cluster_signal: z.ZodNumber;
}, z.core.$strip>;
export declare const LowIntensityConfigSchema: z.ZodObject<{
    weights: z.ZodObject<{
        prompt_shortness: z.ZodNumber;
        token_shortness: z.ZodNumber;
        cyclomatic_low: z.ZodNumber;
        trivial_signal: z.ZodNumber;
        complex_inverse: z.ZodNumber;
        triage_verdict: z.ZodNumber;
        turn_type: z.ZodNumber;
        no_tool_context: z.ZodNumber;
        message_shallow: z.ZodNumber;
        prose_ratio: z.ZodNumber;
        requirement_low: z.ZodNumber;
        cluster_signal: z.ZodNumber;
    }, z.core.$strip>;
    high_threshold: z.ZodNumber;
    low_threshold: z.ZodNumber;
    p_success_alpha: z.ZodNumber;
}, z.core.$strip>;
export declare const RoutingClustersConfigSchema: z.ZodObject<{
    config_path: z.ZodString;
}, z.core.$strip>;
/** SAAR operator knobs (SP-121, #72). */
export declare const SaarConfigSchema: z.ZodObject<{
    planning_turn_buffer: z.ZodNumber;
    prefix_cache_weight: z.ZodNumber;
    idle_timeout_seconds: z.ZodNumber;
    switch_threshold: z.ZodNumber;
}, z.core.$strip>;
export type SaarConfig = z.infer<typeof SaarConfigSchema>;
/** SAAR defaults per routing-roadmap.md §2 P0 (SP-121). */
export declare const DEFAULT_SAAR_CONFIG: Readonly<SaarConfig>;
/** Merge SAAR env overrides onto defaults (invalid env values are ignored). */
export declare function resolveSaarConfigFromEnv(base?: SaarConfig): SaarConfig;
/** Per-session SAAR runtime state (SP-121 types; logic in SP-122). */
export declare const SaarSessionStateSchema: z.ZodObject<{
    turn_index: z.ZodNumber;
    hard_lock: z.ZodBoolean;
    last_activity_at: z.ZodString;
}, z.core.$strip>;
/** Stable snake_case cluster id — used as reason-code suffix (`cluster_${id}`). */
export declare const RoutingClusterIdSchema: z.ZodString;
export declare const RoutingClusterSchema: z.ZodObject<{
    id: z.ZodString;
    tier_bias: z.ZodEnum<{
        "zero-tier": "zero-tier";
        "economical-cloud": "economical-cloud";
        "frontier-cloud": "frontier-cloud";
    }>;
    reference_prompts: z.ZodArray<z.ZodString>;
    min_similarity: z.ZodNumber;
    min_margin: z.ZodNumber;
}, z.core.$strip>;
export declare const RoutingClustersFileSchema: z.ZodObject<{
    clusters: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        tier_bias: z.ZodEnum<{
            "zero-tier": "zero-tier";
            "economical-cloud": "economical-cloud";
            "frontier-cloud": "frontier-cloud";
        }>;
        reference_prompts: z.ZodArray<z.ZodString>;
        min_similarity: z.ZodNumber;
        min_margin: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const OperatorConfigSchema: z.ZodObject<{
    frugality: z.ZodObject<{
        lambda_cost: z.ZodNumber;
        lambda_latency: z.ZodNumber;
        lambda_verbosity: z.ZodNumber;
    }, z.core.$strip>;
    loop_escalation: z.ZodObject<{
        threshold: z.ZodNumber;
    }, z.core.$strip>;
    pricing: z.ZodObject<{
        staleness_days: z.ZodNumber;
    }, z.core.$strip>;
    local: z.ZodObject<{
        min_memory_gb_full: z.ZodNumber;
        min_memory_gb_classification: z.ZodNumber;
        battery_threshold_pct: z.ZodNumber;
    }, z.core.$strip>;
    hydra: z.ZodObject<{
        artifact_cache_path: z.ZodString;
    }, z.core.$strip>;
    low_intensity: z.ZodObject<{
        weights: z.ZodObject<{
            prompt_shortness: z.ZodNumber;
            token_shortness: z.ZodNumber;
            cyclomatic_low: z.ZodNumber;
            trivial_signal: z.ZodNumber;
            complex_inverse: z.ZodNumber;
            triage_verdict: z.ZodNumber;
            turn_type: z.ZodNumber;
            no_tool_context: z.ZodNumber;
            message_shallow: z.ZodNumber;
            prose_ratio: z.ZodNumber;
            requirement_low: z.ZodNumber;
            cluster_signal: z.ZodNumber;
        }, z.core.$strip>;
        high_threshold: z.ZodNumber;
        low_threshold: z.ZodNumber;
        p_success_alpha: z.ZodNumber;
    }, z.core.$strip>;
    saar: z.ZodObject<{
        planning_turn_buffer: z.ZodNumber;
        prefix_cache_weight: z.ZodNumber;
        idle_timeout_seconds: z.ZodNumber;
        switch_threshold: z.ZodNumber;
    }, z.core.$strip>;
    routing_clusters: z.ZodOptional<z.ZodObject<{
        config_path: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type OperatorConfig = z.infer<typeof OperatorConfigSchema>;
export type LowIntensityConfig = z.infer<typeof LowIntensityConfigSchema>;
//# sourceMappingURL=schemas.d.ts.map