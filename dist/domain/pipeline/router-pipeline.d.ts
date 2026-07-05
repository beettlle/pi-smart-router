/**
 * Pipeline stage orchestrator — FR-001, FR-006, FR-022.
 *
 * Runs stages sequentially with early-exit on decision.
 * Session pin lookup runs before triage so existing pins hold (FR-006).
 * Any stage failure falls back to safeCloudDefault(); never throws to host.
 */
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../types/index.js';
import type { HardwareProbeConfig, SystemInfo } from '../../infrastructure/hardware/hardware-probe.js';
import type { HttpFetchPort, LocalZeroTierConfig } from '../../infrastructure/local/local-zero-tier.js';
import type { SessionPinner } from '../pinning/session-pinner.js';
import type { LoopEscalationConfig } from '../pinning/loop-escalation.js';
import { RoutingTelemetryEmitter } from '../../infrastructure/telemetry/routing-telemetry.js';
import type { HydraMatcher as HydraMatcherType } from '../matching/hydra-matcher.js';
export interface StageResult {
    readonly decided: boolean;
    readonly decision?: RoutingDecision;
    readonly stage: string;
}
export type PipelineStage = (request: RoutingRequest) => Promise<StageResult>;
export interface PipelineOptions {
    readonly hardwareConfig?: HardwareProbeConfig;
    readonly localConfig?: LocalZeroTierConfig;
    readonly systemInfoProvider?: () => Promise<SystemInfo>;
    readonly httpFetchPort?: HttpFetchPort;
    readonly sessionPinner?: SessionPinner;
    readonly loopEscalationConfig?: LoopEscalationConfig;
    readonly telemetryEmitter?: RoutingTelemetryEmitter;
    readonly hydraMatcher?: HydraMatcherType;
}
export declare class RouterPipeline {
    private readonly stages;
    private readonly fleet;
    private readonly options;
    /** Per-route transient state — reset on each route() call. */
    private currentHardwareResult;
    constructor(fleet: readonly ModelProfile[], options?: PipelineOptions);
    route(request: RoutingRequest): Promise<RoutingDecision>;
    /** Step 7: emit routing telemetry after decision (T040). */
    private emitTelemetry;
    private buildFallbackDecision;
    private hardwareProbeStage;
    /**
     * SC-007: classification_only MUST NOT dispatch full local.
     * Only routes to zero-tier when hardware says full_local AND a local model is ready.
     */
    private localZeroTierStage;
    private triage;
    private sessionPin;
    /**
     * After a routing decision, persist an initial pin when none exists.
     * Sub-routes and already-pinned decisions skip persistence.
     */
    private persistPinIfNeeded;
    private static readonly TURN_TIER_MAP;
    private turnEnvelope;
    /**
     * Observational loop escalation: detects repeated identical tool failures
     * and re-pins the session to a frontier-capable tier.
     *
     * Runs before sessionPin so it can modify pin state. Never returns
     * decided: true — the subsequent sessionPin stage picks up the
     * (potentially escalated) pin and decides.
     */
    private loopEscalation;
    /**
     * Step 5: HyDRA embedding matcher for ambiguous prompts (T050).
     * Scores fleet candidates via embedding cosine similarity with shortfall gate.
     * Pass-through when no matcher is configured.
     */
    private hydraMatcher;
}
//# sourceMappingURL=router-pipeline.d.ts.map
