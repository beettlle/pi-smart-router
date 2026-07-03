/**
 * Pipeline stage orchestrator — FR-001, FR-022.
 *
 * Runs stages sequentially with early-exit on decision.
 * Any stage failure falls back to safeCloudDefault(); never throws to host.
 */

import type { ModelProfile, RoutingDecision, RoutingRequest } from '../types/index.js';
import { safeCloudDefault } from './safe-default.js';

// ─── Stage result ────────────────────────────────────────────────────────────

export interface StageResult {
  readonly decided: boolean;
  readonly decision?: RoutingDecision;
  readonly stage: string;
}

export type PipelineStage = (request: RoutingRequest) => Promise<StageResult>;

// ─── Orchestrator ────────────────────────────────────────────────────────────

export class RouterPipeline {
  private readonly stages: PipelineStage[];
  private readonly fleet: readonly ModelProfile[];

  constructor(fleet: readonly ModelProfile[]) {
    this.fleet = fleet;
    this.stages = [
      this.hardwareProbe.bind(this),
      this.triage.bind(this),
      this.turnEnvelope.bind(this),
      this.sessionPin.bind(this),
      this.loopEscalation.bind(this),
      this.localZeroTier.bind(this),
      this.hydraMatcher.bind(this),
    ];
  }

  async route(request: RoutingRequest): Promise<RoutingDecision> {
    const start = Date.now();
    try {
      for (const stage of this.stages) {
        const result = await stage(request);
        if (result.decided && result.decision) {
          return result.decision;
        }
      }
    } catch {
      // Constitution VI: zero-crash resilience — degrade to safe default
    }

    return this.buildFallbackDecision(request, Date.now() - start);
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

  // ─── Placeholder stages (to be implemented by future tasks) ──────────────

  private async hardwareProbe(_request: RoutingRequest): Promise<StageResult> {
    return { decided: false, stage: 'hardware_probe' };
  }

  private async triage(_request: RoutingRequest): Promise<StageResult> {
    return { decided: false, stage: 'triage' };
  }

  private async turnEnvelope(_request: RoutingRequest): Promise<StageResult> {
    return { decided: false, stage: 'turn_envelope' };
  }

  private async sessionPin(_request: RoutingRequest): Promise<StageResult> {
    return { decided: false, stage: 'session_pin' };
  }

  private async loopEscalation(_request: RoutingRequest): Promise<StageResult> {
    return { decided: false, stage: 'loop_escalation' };
  }

  private async localZeroTier(_request: RoutingRequest): Promise<StageResult> {
    return { decided: false, stage: 'local_zero' };
  }

  private async hydraMatcher(_request: RoutingRequest): Promise<StageResult> {
    return { decided: false, stage: 'hydra_match' };
  }
}
