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
import type { ModelProfile, RoutingRequest, SessionPin } from '../types/index.js';
export interface LoopEscalationConfig {
    readonly threshold: number;
}
export interface LoopEscalationResult {
    readonly shouldEscalate: boolean;
    readonly updatedPin: SessionPin | null;
    readonly escalationTarget: ModelProfile | null;
    readonly reason: string;
}
/**
 * Extract a tool-failure signature from the request's messages.
 * Returns null when the request does not carry a tool failure.
 *
 * Only inspects tool_result turns — other turn types cannot
 * carry observational failure signals (FR-014: no post-generation judging).
 */
export declare function extractToolFailureSignature(request: RoutingRequest): string | null;
/**
 * Evaluate whether the session should escalate to a higher tier.
 *
 * Pure function — does not mutate pin state. Returns `updatedPin`
 * when the caller should persist new failure-tracking state.
 *
 * Caller applies updates via `SessionPinner.loadPin()`, and on
 * escalation via `breakPin()` + `recordPin()`.
 */
export declare function evaluateLoopEscalation(pin: SessionPin | null, request: RoutingRequest, fleet: readonly ModelProfile[], config: LoopEscalationConfig): LoopEscalationResult;
//# sourceMappingURL=loop-escalation.d.ts.map
