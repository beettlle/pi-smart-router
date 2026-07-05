/**
 * Session pinner — FR-006, FR-007, FR-008, FR-024.
 *
 * Pins a session to one model after the initial routing decision.
 * Pin holds across subsequent turns until a qualified break event.
 *
 * Break rules (FR-008, exhaustive):
 *   1. History compaction
 *   2. Explicit operator/user override
 *   3. Qualified loop escalation (threshold managed externally)
 *   4. Cache-warmup economics (stub — SP-030)
 *
 * Sub-routing (FR-024): tool-result turns below the payload threshold
 * may use an economical model on the same provider without breaking the pin.
 */
import type { ModelProfile, PinReason, RoutingRequest, SessionPin } from '../types/index.js';
export type PinAction = 'use_pin' | 'sub_route' | 'break' | 'no_pin';
export interface PinLookupResult {
    readonly action: PinAction;
    readonly pinnedModel?: ModelProfile;
    readonly subRouteModel?: ModelProfile;
    readonly breakReason?: PinReason;
}
export interface SessionPinnerConfig {
    /** FR-024: max payload size (bytes or token estimate) for sub-routing. Default 2048. */
    readonly toolResultSizeThreshold?: number;
}
export declare class SessionPinner {
    private readonly pins;
    private readonly toolResultSizeThreshold;
    constructor(config?: SessionPinnerConfig);
    /**
     * Synchronous pin lookup — must complete in <1ms.
     * All data is in-memory (Map); no I/O.
     */
    lookupPin(request: RoutingRequest, fleet: readonly ModelProfile[]): PinLookupResult;
    /**
     * Create or update a session pin after a routing decision.
     */
    recordPin(sessionId: string, modelId: string, reason: PinReason): SessionPin;
    /**
     * Delete a session pin — used by loop escalation or external callers.
     */
    breakPin(sessionId: string): void;
    /**
     * Hydrate a pin from persistent storage (e.g. SQLite restore).
     */
    loadPin(pin: SessionPin): void;
    /**
     * Read-only access to the current pin (telemetry, inspection).
     */
    getPin(sessionId: string): SessionPin | null;
    private evaluateBreakRules;
    private handleForceOverride;
    private evaluateSubRouting;
}
//# sourceMappingURL=session-pinner.d.ts.map
