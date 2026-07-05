/**
 * Operator configuration defaults (FR-021).
 * Values sourced from specs/001-build-smart-router/data-model.md § Configuration (Operator).
 */
export const DEFAULT_OPERATOR_CONFIG = {
    frugality: {
        lambda_cost: 0.5,
        lambda_latency: 0.1,
        lambda_verbosity: 0.15,
    },
    loop_escalation: {
        threshold: 3,
    },
    pricing: {
        staleness_days: 14,
    },
    local: {
        min_memory_gb_full: 16,
        min_memory_gb_classification: 8,
        battery_threshold_pct: 20,
    },
    hydra: {
        artifact_cache_path: '.pi-smart-router/models/',
    },
};
//# sourceMappingURL=defaults.js.map