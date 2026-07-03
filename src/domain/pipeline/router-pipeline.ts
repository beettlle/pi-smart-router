/**
 * Pipeline stage orchestrator — FR-001, FR-006, FR-022.
 *
 * Runs stages sequentially with early-exit on decision.
 * Session pin lookup runs before triage so existing pins hold (FR-006).
 * Any stage failure falls back to safeCloudDefault(); never throws to host.
 */

import type { ModelProfile, RoutingDecision, RoutingRequest, Tier } from '../types/index.js';
import type { HardwareProbeConfig, HardwareProbeResult, SystemInfo } from '../../infrastructure/hardware/hardware-probe.js';
import type { HttpFetchPort, LocalZeroTierConfig } from '../../infrastructure/local/local-zero-tier.js';
import { probeHardware } from '../../infrastructure/hardware/hardware-probe.js';
import { pingLocalServices } from '../../infrastructure/local/local-zero-tier.js';
import { triage as triageClassify } from '../triage/triage-engine.js';
import { classifyTurnEnvelope } from '../triage/turn-envelope.js';
import { safeCloudDefault } from './safe-default.js';
import type { SessionPinner } from '../pinning/session-pinner.js';
import { evaluateLoopEscalation } from '../pinning/loop-escalation.js';
import type { LoopEscalationConfig } from '../pinning/loop-escalation.js';
import { RoutingTelemetryEmitter } from '../../infrastructure/telemetry/routing-telemetry.js';
import type { HydraMatcher as HydraMatcherType } from '../matching/hydra-matcher.js';

// ─── Stage result ────────────────────────────────────────────────────────────

export interface StageResult {
  readonly decided: boolean;
  readonly decision?: RoutingDecision;
  readonly stage: string;
}

export type PipelineStage = (request: RoutingRequest) => Promise<StageResult>;

// ─── Pipeline configuration ──────────────────────────────────────────────────

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

// ─── Orchestrator ────────────────────────────────────────────────────────────

export class RouterPipeline {
  private readonly stages: PipelineStage[];
  private readonly fleet: readonly ModelProfile[];
  private readonly options: PipelineOptions;

  /** Per-route transient state — reset on each route() call. */
  private currentHardwareResult: HardwareProbeResult = 'disabled';

  constructor(fleet: readonly ModelProfile[], options?: PipelineOptions) {
    this.fleet = fleet;
    this.options = options ?? {};
    this.stages = [
      this.hardwareProbeStage.bind(this),
      this.loopEscalation.bind(this),
      this.sessionPin.bind(this),
      this.triage.bind(this),
      this.turnEnvelope.bind(this),
      this.localZeroTierStage.bind(this),
      this.hydraMatcher.bind(this),
    ];
  }

  async route(request: RoutingRequest): Promise<RoutingDecision> {
    const start = Date.now();
    this.currentHardwareResult = 'disabled';

    try {
      for (const stage of this.stages) {
        const result = await stage(request);
        if (result.decided && result.decision) {
          this.persistPinIfNeeded(request, result.decision);
          this.emitTelemetry(request, result.decision);
          return result.decision;
        }
      }
    } catch {
      // Constitution VI: zero-crash resilience — degrade to safe default
    }

    const fallback = this.buildFallbackDecision(request, Date.now() - start);
    this.persistPinIfNeeded(request, fallback);
    this.emitTelemetry(request, fallback);
    return fallback;
  }

  /** Step 7: emit routing telemetry after decision (T040). */
  private emitTelemetry(request: RoutingRequest, decision: RoutingDecision): void {
    this.options.telemetryEmitter?.emit(request, decision);
  }

  private buildFallbackDecision(
    request: RoutingRequest,
    elapsedMs: number,
  ): RoutingDecision {
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

  private async hardwareProbeStage(_request: RoutingRequest): Promise<StageResult> {
    if (!this.options.hardwareConfig || !this.options.systemInfoProvider) {
      return { decided: false, stage: 'hardware_probe' };
    }

    const systemInfo = await this.options.systemInfoProvider();
    this.currentHardwareResult = probeHardware(this.options.hardwareConfig, systemInfo);
    return { decided: false, stage: 'hardware_probe' };
  }

  /**
   * SC-007: classification_only MUST NOT dispatch full local.
   * Only routes to zero-tier when hardware says full_local AND a local model is ready.
   */
  private async localZeroTierStage(request: RoutingRequest): Promise<StageResult> {
    if (this.currentHardwareResult !== 'full_local') {
      return { decided: false, stage: 'local_zero' };
    }

    const readiness = await pingLocalServices(
      this.options.localConfig,
      this.options.httpFetchPort,
    );

    if (!readiness.anyModelReady) {
      return { decided: false, stage: 'local_zero' };
    }

    const localModel = this.fleet.find(
      (m) => m.tier === 'zero-tier' && m.healthy !== false,
    );

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

  private async triage(request: RoutingRequest): Promise<StageResult> {
    const result = triageClassify(request.prompt_text);

    if (result.verdict === 'ambiguous') {
      return { decided: false, stage: 'triage' };
    }

    const targetTier = result.verdict === 'trivial' ? 'economical-cloud' : 'frontier-cloud';
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

  // ─── Session pin stage (FR-006, FR-007, FR-008) ──────────────────────────

  private async sessionPin(request: RoutingRequest): Promise<StageResult> {
    const pinner = this.options.sessionPinner;
    if (!pinner) {
      return { decided: false, stage: 'session_pin' };
    }

    const result = pinner.lookupPin(request, this.fleet);

    switch (result.action) {
      case 'use_pin': {
        const model = result.pinnedModel!;
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
        const model = result.subRouteModel!;
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
  private persistPinIfNeeded(
    request: RoutingRequest,
    decision: RoutingDecision,
  ): void {
    const pinner = this.options.sessionPinner;
    if (!pinner) return;

    if (decision.reason_code === 'tool_result_sub_route') return;
    if (decision.reason_code === 'session_pinned') return;

    pinner.recordPin(request.session_id, decision.selected_model_id, 'initial');
  }

  // ─── Turn envelope stage (Step 2b, <2ms budget) ─────────────────────────

  private static readonly TURN_TIER_MAP: Readonly<Record<string, Tier | null>> = {
    planning: 'frontier-cloud',
    tool_result: 'economical-cloud',
    subagent: 'economical-cloud',
    main_loop: null,
    unknown: null,
  };

  private async turnEnvelope(request: RoutingRequest): Promise<StageResult> {
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
  private async loopEscalation(request: RoutingRequest): Promise<StageResult> {
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
      pinner.recordPin(
        request.session_id,
        result.escalationTarget.id,
        'loop_escalation',
      );
    }

    return { decided: false, stage: 'loop_escalation' };
  }

  /**
   * Step 5: HyDRA embedding matcher for ambiguous prompts (T050).
   * Scores fleet candidates via embedding cosine similarity with shortfall gate.
   * Pass-through when no matcher is configured.
   */
  private async hydraMatcher(request: RoutingRequest): Promise<StageResult> {
    const matcher = this.options.hydraMatcher;
    if (!matcher) {
      return { decided: false, stage: 'hydra_match' };
    }

    const result = await matcher.match(request, this.fleet);

    if (!result.selected) {
      return { decided: false, stage: 'hydra_match' };
    }

    const selectedModel = this.fleet.find(
      (m) => m.id === result.selected!.model_id,
    );
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
