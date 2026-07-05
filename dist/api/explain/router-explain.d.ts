/**
 * Explain endpoint handler — T041.
 *
 * Returns routing rationale (tier, stage, reason_code, candidates) without
 * dispatching upstream inference. Runs the same pipeline as the live path
 * to guarantee bit-for-bit decision equivalence.
 *
 * Contract: specs/001-build-smart-router/contracts/explain-endpoint.md v1.0.0
 *
 * Invariants:
 *   - MUST NOT call upstream LLM providers
 *   - MUST produce a decision identical to the live pipeline for the same input
 *   - MUST emit no RoutingTelemetry with upstream cost (routing_latency_ms only)
 */
import type { ModelProfile, RoutingDecision } from '../../domain/types/index.js';
import { RouterPipeline } from '../../domain/pipeline/router-pipeline.js';
export interface ExplainValidationError {
    readonly error: 'validation_failed';
    readonly details: readonly string[];
}
export interface ExplainSuccess {
    readonly status: 200;
    readonly body: RoutingDecision;
}
export interface ExplainBadRequest {
    readonly status: 400;
    readonly body: ExplainValidationError;
}
export interface ExplainUnavailable {
    readonly status: 503;
    readonly body: RoutingDecision;
}
export type ExplainResult = ExplainSuccess | ExplainBadRequest | ExplainUnavailable;
export interface ExplainHandlerDeps {
    readonly fleet: readonly ModelProfile[];
    readonly pipeline: RouterPipeline;
}
/**
 * Create an explain handler bound to a shared pipeline instance.
 *
 * Reuses the same RouterPipeline as the live dispatch path so
 * session pin state and stage ordering are identical.
 */
export declare function createExplainHandler(deps: ExplainHandlerDeps): (rawBody: unknown) => Promise<ExplainResult>;
//# sourceMappingURL=router-explain.d.ts.map
