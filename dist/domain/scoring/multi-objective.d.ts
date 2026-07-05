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
import type { CandidateScore, ModelProfile } from '../types/index.js';
export interface FrugalityWeights {
    readonly lambda_cost: number;
    readonly lambda_latency: number;
    readonly lambda_verbosity: number;
}
export interface ScoredCandidate {
    readonly model_id: string;
    readonly capability_score: number;
    readonly cost_penalty: number;
    readonly latency_penalty: number;
    readonly verbosity_penalty: number;
    readonly composite_score: number;
    readonly rejected_reason: string | null;
}
export interface MultiObjectiveResult {
    readonly selected: ScoredCandidate | null;
    readonly candidates: readonly ScoredCandidate[];
}
/**
 * Score and re-rank candidates with multi-objective cost/latency/verbosity
 * penalties.
 *
 * @param hydraScores - CandidateScore array from HydraMatcher (post-shortfall-gate)
 * @param fleet - Full fleet for metric lookup
 * @param weights - Operator frugality config (lambda_cost, lambda_latency, lambda_verbosity)
 */
export declare function scoreMultiObjective(hydraScores: readonly CandidateScore[], fleet: readonly ModelProfile[], weights: FrugalityWeights): MultiObjectiveResult;
//# sourceMappingURL=multi-objective.d.ts.map
