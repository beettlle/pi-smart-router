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
    healthy: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
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
    }>>;
}, z.core.$strip>;
export declare const PriceCatalogSchema: z.ZodObject<{
    registry_snapshot: z.ZodRecord<z.ZodString, z.ZodNumber>;
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
}, z.core.$strip>;
export type OperatorConfig = z.infer<typeof OperatorConfigSchema>;
//# sourceMappingURL=schemas.d.ts.map