/**
 * Sub-route policy — FR-024.
 *
 * Pure policy function that evaluates whether a tool-result turn is
 * eligible for same-provider economical sub-routing without breaking
 * the session pin.
 *
 * Rules (FR-024, exhaustive):
 *   1. Turn must be a tool_result.
 *   2. Payload must be below the configurable size threshold (default 2 KB).
 *   3. An economical-cloud model on the same provider as the pin must exist
 *      and be healthy.
 *   4. The economical model must not be the pinned model itself.
 *
 * When all conditions are met the caller may dispatch to the economical
 * model. The session pin record is unchanged — the pin holds.
 */
import type { ModelProfile, RoutingRequest, SessionPin } from '../types/index.js';
export type SubRouteReason = 'eligible' | 'not_tool_result' | 'payload_exceeds_threshold' | 'pinned_model_not_in_fleet' | 'no_same_provider_economical';
export interface SubRouteEvaluation {
    readonly eligible: boolean;
    readonly subRouteModel?: ModelProfile;
    readonly pinnedModel?: ModelProfile;
    readonly reason: SubRouteReason;
}
export interface SubRoutePolicyConfig {
    /** Max payload size (bytes or token estimate) for sub-routing. Default 2048. */
    readonly sizeThreshold?: number;
}
/**
 * Evaluate sub-route eligibility for a single request against a session pin.
 *
 * Designed for the hot path — no allocation beyond the return object,
 * no I/O, deterministic.
 */
export declare function evaluateSubRoutePolicy(request: RoutingRequest, pin: SessionPin, fleet: readonly ModelProfile[], config?: SubRoutePolicyConfig): SubRouteEvaluation;
//# sourceMappingURL=sub-route-policy.d.ts.map