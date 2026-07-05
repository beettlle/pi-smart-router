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
// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_SIZE_THRESHOLD = 2048;
// ─── Policy ───────────────────────────────────────────────────────────────────
/**
 * Evaluate sub-route eligibility for a single request against a session pin.
 *
 * Designed for the hot path — no allocation beyond the return object,
 * no I/O, deterministic.
 */
export function evaluateSubRoutePolicy(request, pin, fleet, config) {
    const threshold = config?.sizeThreshold ?? DEFAULT_SIZE_THRESHOLD;
    if (request.turn_type !== 'tool_result') {
        return { eligible: false, reason: 'not_tool_result' };
    }
    const payloadSize = request.estimated_input_tokens ?? request.prompt_text.length;
    if (payloadSize > threshold) {
        return { eligible: false, reason: 'payload_exceeds_threshold' };
    }
    const pinnedModel = fleet.find((m) => m.id === pin.pinned_model_id);
    if (!pinnedModel) {
        return { eligible: false, reason: 'pinned_model_not_in_fleet' };
    }
    const econModel = fleet.find((m) => m.tier === 'economical-cloud' &&
        m.provider === pinnedModel.provider &&
        m.id !== pin.pinned_model_id &&
        m.healthy !== false);
    if (!econModel) {
        return { eligible: false, reason: 'no_same_provider_economical' };
    }
    return {
        eligible: true,
        subRouteModel: econModel,
        pinnedModel,
        reason: 'eligible',
    };
}
//# sourceMappingURL=sub-route-policy.js.map
