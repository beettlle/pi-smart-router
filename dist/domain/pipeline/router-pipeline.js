/**
 * Pipeline stage orchestrator — FR-001, FR-006, FR-022.
 *
 * Runs stages sequentially with early-exit on decision.
 * Session pin lookup runs before triage so existing pins hold (FR-006).
 * Any stage failure falls back to safeCloudDefault(); never throws to host.
 */
import { probeHardware } from '../../infrastructure/hardware/hardware-probe.js';
import { pingLocalServices } from '../../infrastructure/local/local-zero-tier.js';
import { triage as triageClassify } from '../triage/triage-engine.js';
import { classifyTurnEnvelope } from '../triage/turn-envelope.js';
import { safeCloudDefault } from './safe-default.js';
import { evaluateLoopEscalation } from '../pinning/loop-escalation.js';
// ─── Orchestrator ────────────────────────────────────────────────────────────
export class RouterPipeline {
    stages;
    fleet;
    options;
    /** Per-route transient state — reset on each route() call. */
    currentHardwareResult = 'disabled';
    currentTriageResult = null;
    currentHydraResult = null;
    constructor(fleet, options) {
        this.fleet = fleet;
        this.options = options ?? {};
        this.stages = [
            { name: 'hardware_probe', run: this.hardwareProbeStage.bind(this) },
            { name: 'loop_escalation', run: this.loopEscalation.bind(this) },
            { name: 'session_pin', run: this.sessionPin.bind(this) },
            { name: 'triage', run: this.triage.bind(this) },
            { name: 'turn_envelope', run: this.turnEnvelope.bind(this) },
            { name: 'local_zero', run: this.localZeroTierStage.bind(this) },
            { name: 'triage', run: this.triageCloudFallback.bind(this) },
            { name: 'hydra_match', run: this.hydraMatcher.bind(this) },
        ];
    }
    async route(request) {
        const start = Date.now();
        this.currentHardwareResult = 'disabled';
        this.currentTriageResult = null;
        this.currentHydraResult = null;
        let currentStage;
        try {
            for (const stage of this.stages) {
                currentStage = stage;
                const result = await stage.run(request);
                if (result.decided && result.decision) {
                    this.persistPinIfNeeded(request, result.decision);
                    this.emitTelemetry(request, result.decision);
                    return this.attachFeatures(result.decision);
                }
            }
        }
        catch (error) {
            // Constitution VI: zero-crash resilience — degrade to safe default
            const failedStage = this.resolveFailedStage(currentStage);
            const elapsedMs = Date.now() - start;
            const fallback = this.buildFallbackDecision(request, elapsedMs);
            this.logPipelineError(request, failedStage, error);
            this.emitPipelineErrorTelemetry(request, failedStage, fallback);
            this.persistPinIfNeeded(request, fallback);
            return this.attachFeatures(fallback);
        }
        const fallback = this.buildFallbackDecision(request, Date.now() - start);
        this.persistPinIfNeeded(request, fallback);
        this.emitTelemetry(request, fallback);
        return this.attachFeatures(fallback);
    }
    /** Attach privacy-safe dataset features captured during pipeline stages (SP-057). */
    attachFeatures(decision) {
        const features = {
            triage: this.currentTriageResult
                ? {
                    verdict: this.currentTriageResult.verdict,
                    reason_code: this.currentTriageResult.reason_code,
                    cyclomatic_score: this.currentTriageResult.cyclomatic_score,
                }
                : null,
            requirements: this.currentHydraResult?.requirements ?? null,
            candidates: this.currentHydraResult?.candidates ?? null,
        };
        return { ...decision, features };
    }
    resolveFailedStage(stage) {
        return stage?.name ?? 'unknown';
    }
    logPipelineError(request, stage, error) {
        console.warn('Router pipeline stage failed; degrading to safe default', {
            stage,
            request_id: request.request_id,
            session_id: request.session_id,
            error: this.redactPromptFromError(error, request.prompt_text),
        });
    }
    redactPromptFromError(error, promptText) {
        const message = error instanceof Error ? error.message : String(error);
        if (!promptText || !message.includes(promptText)) {
            return message;
        }
        return message.replaceAll(promptText, '[REDACTED]');
    }
    emitPipelineErrorTelemetry(request, failedStage, fallback) {
        this.options.telemetryEmitter?.emitPipelineError(request, failedStage, fallback);
    }
    /** Step 7: emit routing telemetry after decision (T040). */
    emitTelemetry(request, decision) {
        this.options.telemetryEmitter?.emit(request, decision);
    }
    buildFallbackDecision(request, elapsedMs) {
        const fallbackModel = safeCloudDefault(this.fleet);
        const modelId = fallbackModel?.id ?? 'unknown';
        const tier = fallbackModel?.tier ?? 'economical-cloud';
        return {
            request_id: request.request_id,
            selected_model_id: modelId,
            tier,
            stage: 'fallback',
            reason_code: 'safe_cloud_default',
            routing_latency_ms: elapsedMs,
            pin_reason: null,
        };
    }
    // ─── Implemented stages ─────────────────────────────────────────────────────
    async hardwareProbeStage(request) {
        void request;
        if (!this.options.hardwareConfig || !this.options.systemInfoProvider) {
            return { decided: false, stage: 'hardware_probe' };
        }
        const systemInfo = await this.options.systemInfoProvider();
        this.currentHardwareResult = probeHardware(this.options.hardwareConfig, systemInfo);
        return { decided: false, stage: 'hardware_probe' };
    }
    /**
     * SC-007: classification_only MUST NOT dispatch full local.
     * PRD Step 4: only trivial tasks with full_local hardware may use zero-tier.
     */
    async localZeroTierStage(request) {
        if (this.currentTriageResult?.verdict !== 'trivial') {
            return { decided: false, stage: 'local_zero' };
        }
        if (this.currentHardwareResult !== 'full_local') {
            return { decided: false, stage: 'local_zero' };
        }
        const readiness = await pingLocalServices(this.options.localConfig, this.options.httpFetchPort);
        if (!readiness.anyModelReady) {
            return { decided: false, stage: 'local_zero' };
        }
        const localModel = this.fleet.find((m) => m.tier === 'zero-tier' && m.healthy !== false);
        if (!localModel) {
            return { decided: false, stage: 'local_zero' };
        }
        return {
            decided: true,
            stage: 'local_zero',
            decision: {
                request_id: request.request_id,
                selected_model_id: localModel.id,
                tier: 'zero-tier',
                stage: 'local_zero',
                reason_code: 'local_model_ready',
                routing_latency_ms: readiness.combinedLatencyMs,
                pin_reason: null,
            },
        };
    }
    // ─── Triage stage (FR-003, SC-004 <5ms budget) ──────────────────────────────
    async triage(request) {
        const result = triageClassify(request.prompt_text);
        this.currentTriageResult = result;
        if (result.verdict === 'ambiguous') {
            return { decided: false, stage: 'triage' };
        }
        // Trivial prompts defer cloud routing until after local zero-tier (PRD Step 4).
        if (result.verdict === 'trivial') {
            return { decided: false, stage: 'triage' };
        }
        const targetTier = 'frontier-cloud';
        const model = this.fleet.find((m) => m.tier === targetTier && m.healthy !== false);
        if (!model) {
            return { decided: false, stage: 'triage' };
        }
        return {
            decided: true,
            stage: 'triage',
            decision: {
                request_id: request.request_id,
                selected_model_id: model.id,
                tier: targetTier,
                stage: 'triage',
                reason_code: result.reason_code,
                routing_latency_ms: 0,
                pin_reason: null,
            },
        };
    }
    /**
     * Economical-cloud fallback for trivial prompts after local zero-tier is skipped
     * or unavailable (PRD Step 4 cloud fallback).
     */
    async triageCloudFallback(request) {
        if (this.currentTriageResult?.verdict !== 'trivial') {
            return { decided: false, stage: 'triage' };
        }
        const model = this.fleet.find((m) => m.tier === 'economical-cloud' && m.healthy !== false);
        if (!model) {
            return { decided: false, stage: 'triage' };
        }
        return {
            decided: true,
            stage: 'triage',
            decision: {
                request_id: request.request_id,
                selected_model_id: model.id,
                tier: 'economical-cloud',
                stage: 'triage',
                reason_code: this.currentTriageResult.reason_code,
                routing_latency_ms: 0,
                pin_reason: null,
            },
        };
    }
    // ─── Session pin stage (FR-006, FR-007, FR-008) ──────────────────────────
    async sessionPin(request) {
        const pinner = this.options.sessionPinner;
        if (!pinner) {
            return { decided: false, stage: 'session_pin' };
        }
        const result = pinner.lookupPin(request, this.fleet);
        switch (result.action) {
            case 'use_pin': {
                const model = result.pinnedModel;
                const pin = pinner.getPin(request.session_id);
                return {
                    decided: true,
                    stage: 'session_pin',
                    decision: {
                        request_id: request.request_id,
                        selected_model_id: model.id,
                        tier: model.tier,
                        stage: 'session_pin',
                        reason_code: 'session_pinned',
                        routing_latency_ms: 0,
                        pin_reason: pin?.pin_reason ?? null,
                    },
                };
            }
            case 'sub_route': {
                const model = result.subRouteModel;
                const pin = pinner.getPin(request.session_id);
                return {
                    decided: true,
                    stage: 'session_pin',
                    decision: {
                        request_id: request.request_id,
                        selected_model_id: model.id,
                        tier: model.tier,
                        stage: 'session_pin',
                        reason_code: 'tool_result_sub_route',
                        routing_latency_ms: 0,
                        pin_reason: pin?.pin_reason ?? null,
                    },
                };
            }
            case 'break':
            case 'no_pin':
            default:
                return { decided: false, stage: 'session_pin' };
        }
    }
    /**
     * After a routing decision, persist an initial pin when none exists.
     * Sub-routes and already-pinned decisions skip persistence.
     */
    persistPinIfNeeded(request, decision) {
        const pinner = this.options.sessionPinner;
        if (!pinner)
            return;
        if (decision.reason_code === 'tool_result_sub_route')
            return;
        if (decision.reason_code === 'session_pinned')
            return;
        pinner.recordPin(request.session_id, decision.selected_model_id, 'initial');
    }
    // ─── Turn envelope stage (Step 2b, <2ms budget) ─────────────────────────
    static TURN_TIER_MAP = {
        planning: 'frontier-cloud',
        tool_result: 'economical-cloud',
        subagent: 'economical-cloud',
        main_loop: null,
        unknown: null,
    };
    async turnEnvelope(request) {
        const turnType = request.turn_type ?? classifyTurnEnvelope(request.messages);
        const targetTier = RouterPipeline.TURN_TIER_MAP[turnType] ?? null;
        if (!targetTier) {
            return { decided: false, stage: 'turn_envelope' };
        }
        const model = this.fleet.find((m) => m.tier === targetTier && m.healthy !== false);
        if (!model) {
            return { decided: false, stage: 'turn_envelope' };
        }
        return {
            decided: true,
            stage: 'turn_envelope',
            decision: {
                request_id: request.request_id,
                selected_model_id: model.id,
                tier: targetTier,
                stage: 'turn_envelope',
                reason_code: `turn_${turnType}`,
                routing_latency_ms: 0,
                pin_reason: null,
            },
        };
    }
    // ─── Loop escalation (Step 3b — FR-014) ─────────────────────────────────
    /**
     * Observational loop escalation: detects repeated identical tool failures
     * and re-pins the session to a frontier-capable tier.
     *
     * Runs before sessionPin so it can modify pin state. Never returns
     * decided: true — the subsequent sessionPin stage picks up the
     * (potentially escalated) pin and decides.
     */
    async loopEscalation(request) {
        const pinner = this.options.sessionPinner;
        const config = this.options.loopEscalationConfig;
        if (!pinner || !config) {
            return { decided: false, stage: 'loop_escalation' };
        }
        const pin = pinner.getPin(request.session_id);
        const result = evaluateLoopEscalation(pin, request, this.fleet, config);
        if (result.updatedPin) {
            pinner.loadPin(result.updatedPin);
        }
        if (result.shouldEscalate && result.escalationTarget) {
            pinner.breakPin(request.session_id);
            pinner.recordPin(request.session_id, result.escalationTarget.id, 'loop_escalation');
        }
        return { decided: false, stage: 'loop_escalation' };
    }
    /**
     * Step 5: HyDRA embedding matcher for ambiguous prompts (T050).
     * Scores fleet candidates via embedding cosine similarity with shortfall gate.
     * Pass-through when no matcher is configured.
     */
    async hydraMatcher(request) {
        const matcher = this.options.hydraMatcher;
        if (!matcher) {
            return { decided: false, stage: 'hydra_match' };
        }
        const result = await matcher.match(request, this.fleet);
        this.currentHydraResult = result;
        if (!result.selected) {
            return { decided: false, stage: 'hydra_match' };
        }
        const selectedModel = this.fleet.find((m) => m.id === result.selected.model_id);
        if (!selectedModel) {
            return { decided: false, stage: 'hydra_match' };
        }
        return {
            decided: true,
            stage: 'hydra_match',
            decision: {
                request_id: request.request_id,
                selected_model_id: selectedModel.id,
                tier: selectedModel.tier,
                stage: 'hydra_match',
                reason_code: 'hydra_embedding_match',
                candidates: result.candidates,
                routing_latency_ms: result.elapsedMs,
                pin_reason: null,
            },
        };
    }
}
//# sourceMappingURL=router-pipeline.js.map