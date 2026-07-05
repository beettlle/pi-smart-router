/**
 * Loop escalation — FR-014, FR-008 rule #3.
 *
 * Detects bounded repeated identical tool failures and signals
 * session pin escalation to a frontier-capable tier.
 *
 * Escalation fires once per session; no tier oscillation (FR-008).
 * Threshold defaults to 3 identical tool failures (operator configurable).
 *
 * Design: pure evaluation function — caller (pipeline stage) is
 * responsible for applying pin state updates via SessionPinner.
 */
// ─── Failure signature extraction ─────────────────────────────────────────────
const FAILURE_PATTERNS = [
    'error',
    'fail',
    'exception',
    'timed out',
    'timeout',
    'econnrefused',
    'enotfound',
    'econnreset',
    'epipe',
];
/**
 * Extract a tool-failure signature from the request's messages.
 * Returns null when the request does not carry a tool failure.
 *
 * Only inspects tool_result turns — other turn types cannot
 * carry observational failure signals (FR-014: no post-generation judging).
 */
export function extractToolFailureSignature(request) {
    const msgs = request.messages;
    if (!msgs || msgs.length === 0)
        return null;
    for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i];
        if (msg.role === 'tool') {
            if (looksLikeFailure(msg.content)) {
                return computeSignature(msg.content);
            }
            return null;
        }
    }
    return null;
}
function looksLikeFailure(content) {
    const lower = content.toLowerCase();
    return FAILURE_PATTERNS.some((p) => lower.includes(p));
}
/** Deterministic djb2 hash of normalised error content. */
function computeSignature(content) {
    const normalized = content.trim().slice(0, 256).toLowerCase();
    let h = 5381;
    for (let i = 0; i < normalized.length; i++) {
        h = ((h << 5) + h + normalized.charCodeAt(i)) | 0;
    }
    return `tf:${(h >>> 0).toString(16)}`;
}
// ─── Evaluation ───────────────────────────────────────────────────────────────
/**
 * Evaluate whether the session should escalate to a higher tier.
 *
 * Pure function — does not mutate pin state. Returns `updatedPin`
 * when the caller should persist new failure-tracking state.
 *
 * Caller applies updates via `SessionPinner.loadPin()`, and on
 * escalation via `breakPin()` + `recordPin()`.
 */
export function evaluateLoopEscalation(pin, request, fleet, config) {
    if (!pin) {
        return noEscalation('no_pin');
    }
    if (pin.pin_reason === 'loop_escalation') {
        return noEscalation('already_escalated');
    }
    if (request.turn_type !== 'tool_result') {
        return noEscalation('not_tool_result');
    }
    const signature = extractToolFailureSignature(request);
    if (!signature) {
        if (pin.consecutive_tool_failures > 0) {
            return {
                shouldEscalate: false,
                updatedPin: {
                    ...pin,
                    consecutive_tool_failures: 0,
                    last_tool_failure_signature: null,
                    updated_at: new Date().toISOString(),
                },
                escalationTarget: null,
                reason: 'success_reset',
            };
        }
        return noEscalation('no_failure');
    }
    const isIdentical = pin.last_tool_failure_signature === signature;
    const newCount = isIdentical ? pin.consecutive_tool_failures + 1 : 1;
    const updated = {
        ...pin,
        consecutive_tool_failures: newCount,
        last_tool_failure_signature: signature,
        updated_at: new Date().toISOString(),
    };
    if (newCount >= config.threshold) {
        const target = selectEscalationTarget(fleet, pin.pinned_model_id);
        if (target) {
            return {
                shouldEscalate: true,
                updatedPin: updated,
                escalationTarget: target,
                reason: 'threshold_exceeded',
            };
        }
        return {
            shouldEscalate: false,
            updatedPin: updated,
            escalationTarget: null,
            reason: 'no_frontier_available',
        };
    }
    return {
        shouldEscalate: false,
        updatedPin: updated,
        escalationTarget: null,
        reason: 'below_threshold',
    };
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function noEscalation(reason) {
    return { shouldEscalate: false, updatedPin: null, escalationTarget: null, reason };
}
/** Select the best healthy frontier-cloud model that differs from the current pin. */
function selectEscalationTarget(fleet, currentModelId) {
    return (fleet.find((m) => m.tier === 'frontier-cloud' && m.id !== currentModelId && m.healthy !== false) ?? null);
}
//# sourceMappingURL=loop-escalation.js.map
