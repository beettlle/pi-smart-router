/**
 * Multi-objective scoring — T049, FR-021.
 *
 * Re-ranks HyDRA match candidates using operator-configured frugality
 * weights (lambda_cost, lambda_latency, lambda_verbosity). At quality
 * parity (shortfall gate already applied by HydraMatcher), the scorer
 * penalizes cost, latency, and verbosity to prefer cheaper/faster/leaner
 * models.
 *
 * Score formula:
 *   score = capability_score
 *         - lambda_cost      * norm_cost
 *         - lambda_latency   * norm_latency
 *         - lambda_verbosity * norm_verbosity
 *
 * Normalization is min-max across the viable candidate set so penalties
 * are scale-invariant. Missing performance fields default to fleet
 * median behavior (0.5 normalized).
 */
// ─── Normalization helpers ───────────────────────────────────────────────────
const MIDPOINT = 0.5;
function rangeOf(values) {
    if (values.length === 0)
        return { min: 0, max: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (v < min)
            min = v;
        if (v > max)
            max = v;
    }
    return { min, max };
}
function normalize(value, range) {
    if (range.max === range.min)
        return MIDPOINT;
    return (value - range.min) / (range.max - range.min);
}
function extractMetrics(profile) {
    return {
        cost: profile.pricing.fallback_cost_per_1m,
        latency: profile.performance?.latency_p50_ms ?? 0,
        verbosity: profile.performance?.verbosity_factor ?? 1,
    };
}
// ─── Scorer ──────────────────────────────────────────────────────────────────
/**
 * Score and re-rank candidates with multi-objective cost/latency/verbosity
 * penalties.
 *
 * @param hydraScores - CandidateScore array from HydraMatcher (post-shortfall-gate)
 * @param fleet - Full fleet for metric lookup
 * @param weights - Operator frugality config (lambda_cost, lambda_latency, lambda_verbosity)
 */
export function scoreMultiObjective(hydraScores, fleet, weights) {
    const profileMap = new Map();
    for (const m of fleet) {
        profileMap.set(m.id, m);
    }
    const viable = hydraScores.filter((c) => c.rejected_reason === null);
    const rejected = hydraScores.filter((c) => c.rejected_reason !== null);
    if (viable.length === 0) {
        const scoredRejected = rejected.map((c) => ({
            model_id: c.model_id,
            capability_score: c.score,
            cost_penalty: 0,
            latency_penalty: 0,
            verbosity_penalty: 0,
            composite_score: 0,
            rejected_reason: c.rejected_reason,
        }));
        return { selected: null, candidates: scoredRejected };
    }
    const viableMetrics = viable.map((c) => {
        const profile = profileMap.get(c.model_id);
        return profile ? extractMetrics(profile) : { cost: 0, latency: 0, verbosity: 1 };
    });
    const costRange = rangeOf(viableMetrics.map((m) => m.cost));
    const latencyRange = rangeOf(viableMetrics.map((m) => m.latency));
    const verbosityRange = rangeOf(viableMetrics.map((m) => m.verbosity));
    const scoredViable = viable.map((c, i) => {
        const metrics = viableMetrics[i];
        const normCost = normalize(metrics.cost, costRange);
        const normLatency = normalize(metrics.latency, latencyRange);
        const normVerbosity = normalize(metrics.verbosity, verbosityRange);
        const costPenalty = weights.lambda_cost * normCost;
        const latencyPenalty = weights.lambda_latency * normLatency;
        const verbosityPenalty = weights.lambda_verbosity * normVerbosity;
        const composite = c.score - costPenalty - latencyPenalty - verbosityPenalty;
        return {
            model_id: c.model_id,
            capability_score: c.score,
            cost_penalty: costPenalty,
            latency_penalty: latencyPenalty,
            verbosity_penalty: verbosityPenalty,
            composite_score: composite,
            rejected_reason: null,
        };
    });
    const scoredRejected = rejected.map((c) => ({
        model_id: c.model_id,
        capability_score: c.score,
        cost_penalty: 0,
        latency_penalty: 0,
        verbosity_penalty: 0,
        composite_score: 0,
        rejected_reason: c.rejected_reason,
    }));
    const best = scoredViable.reduce((a, b) => b.composite_score > a.composite_score ? b : a);
    return {
        selected: best,
        candidates: [...scoredViable, ...scoredRejected],
    };
}
//# sourceMappingURL=multi-objective.js.map
