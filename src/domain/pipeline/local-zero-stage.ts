/**
 * Local-zero stage (SP-274, #143 partial): `local_zero` + speculative
 * prewarm of the local runtime.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272).
 *
 * SC-007: classification_only MUST NOT dispatch full local.
 * Eligibility: triage trivial OR low-intensity zero-tier hint OR zero-tier
 * cluster (SP-111). Pre-dispatch tool-use capability gate (SP-177, #98)
 * skips when predicted need exceeds min(local tool_use capability,
 * local_zero.max_tool_use_requirement); throughput gate (SP-164, #84) and
 * bounded speculative prewarm (SP-217, #117) follow.
 *
 * The lazily created `SpeculativePrewarmGuard` is session-scoped (its
 * acceptance state spans routes), so it lives in the stage factory closure —
 * one guard per RouterPipeline instance, exactly as the orchestrator field
 * it replaces.
 */

import type { LocalReadinessResult } from '../ports/local-runtime-port.js';
import { defaultLocalRuntimePort } from '../ports/local-runtime-port.js';
import { DEFAULT_LOCAL_ZERO_CONFIG } from '../types/schemas.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../config/defaults.js';
import {
  LOCAL_ZERO_DISABLED,
  THROUGHPUT_BELOW_THRESHOLD,
  TOOL_USE_CAPABILITY_SHORTFALL,
} from '../ports/telemetry-emitter-port.js';
import {
  DEFAULT_SPECULATIVE_PREWARM_CONFIG,
  PREWARM_DISABLED_LOW_ACCEPTANCE,
  SpeculativePrewarmGuard,
} from '../routing/speculative-prewarm.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';
import {
  estimateCheapToolUseRequirement,
  resolveLocalEligible,
  resolveLocalZeroToolUseCeiling,
} from './stage-helpers.js';

/**
 * Bounded speculative prewarm of the local runtime (Colibri PILOT pattern).
 * Runs only when local_zero eligibility already passed and the operator
 * opted in. Returns the warm readiness result to reuse when accepted; null
 * otherwise (caller falls back to the normal readiness probe — fail open).
 * Pre-generation only: the warm probe is an I/O readiness ping; it never
 * waits on generated tokens.
 */
async function attemptSpeculativePrewarm(
  context: RoutingContext,
  guard: SpeculativePrewarmGuard,
): Promise<LocalReadinessResult | null> {
  if (!guard.isEnabled()) {
    return null;
  }

  if (!guard.shouldAttempt(context.request.session_id)) {
    context.prewarmOutcome = {
      attempted: false,
      accepted: null,
      target: 'local_runtime',
      elapsed_ms: null,
      reason:
        guard.disabledReason(context.request.session_id) ??
        PREWARM_DISABLED_LOW_ACCEPTANCE,
    };
    return null;
  }

  let captured: LocalReadinessResult | null = null;
  const outcome = await guard.attempt(
    context.request.session_id,
    'local_runtime',
    async (signal) => {
      const localRuntime = context.options.localRuntime ?? defaultLocalRuntimePort;
      const readiness = await localRuntime.pingServices(
        context.options.localConfig,
        context.options.httpFetchPort,
      );
      if (signal.aborted) {
        return false;
      }
      captured = readiness;
      return readiness.anyModelReady;
    },
  );
  context.prewarmOutcome = outcome;

  if (outcome.accepted === true && captured !== null) {
    return captured;
  }
  return null;
}

/** Local zero-tier dispatch with eligibility, capability, throughput, readiness gates. */
export function createLocalZeroStage(): PipelineStage {
  // Lazily created session-scoped prewarm guard (acceptance state spans
  // routes) — one per RouterPipeline instance via the factory closure.
  let prewarmGuardInstance: SpeculativePrewarmGuard | null = null;

  const resolvePrewarmGuard = (context: RoutingContext): SpeculativePrewarmGuard => {
    if (context.options.prewarmGuard) {
      return context.options.prewarmGuard;
    }
    if (!prewarmGuardInstance) {
      prewarmGuardInstance = new SpeculativePrewarmGuard(
        context.options.prewarmConfig ??
          DEFAULT_OPERATOR_CONFIG.speculative_prewarm ??
          DEFAULT_SPECULATIVE_PREWARM_CONFIG,
      );
    }
    return prewarmGuardInstance;
  };

  return {
    name: 'local_zero',
    async run(ctx: RoutingContext): Promise<StageResult> {
      const request = ctx.request;
      const lowIntensityConfig =
        ctx.options.lowIntensityConfig ?? DEFAULT_OPERATOR_CONFIG.low_intensity;
      const localZeroConfig =
        ctx.options.localZeroConfig ??
        DEFAULT_OPERATOR_CONFIG.local_zero ??
        DEFAULT_LOCAL_ZERO_CONFIG;
      const eligibility = resolveLocalEligible({
        triageVerdict: ctx.triageResult?.verdict ?? null,
        tierHint: ctx.tierHint,
        lowIntensityScore: ctx.lowIntensityScore,
        highThreshold: lowIntensityConfig.high_threshold,
        clusterMatch: ctx.clusterMatch,
      });

      if (!eligibility.eligible) {
        return { decided: false, stage: 'local_zero' };
      }

      if (!localZeroConfig.enabled) {
        ctx.localEligibleReason = eligibility.reason;
        ctx.localZeroGateSkipReasons = [LOCAL_ZERO_DISABLED];
        return { decided: false, stage: 'local_zero' };
      }

      if (ctx.hardwareResult !== 'full_local') {
        return { decided: false, stage: 'local_zero' };
      }

      const localModel = ctx.fleet.find(
        (m) => m.tier === 'zero-tier' && m.healthy !== false,
      );

      if (!localModel) {
        return { decided: false, stage: 'local_zero' };
      }

      const predictedToolUse = estimateCheapToolUseRequirement(request.prompt_text);
      const ceiling = resolveLocalZeroToolUseCeiling(
        localModel.capabilities.tool_use,
        localZeroConfig.max_tool_use_requirement,
      );
      if (predictedToolUse > ceiling) {
        ctx.localEligibleReason = eligibility.reason;
        ctx.localZeroGateSkipReasons = [TOOL_USE_CAPABILITY_SHORTFALL];
        return { decided: false, stage: 'local_zero' };
      }

      const throughputMeter = ctx.options.throughputMeter;
      if (throughputMeter && !throughputMeter.isAboveThreshold()) {
        const economicalModel = ctx.fleet.find(
          (m) => m.tier === 'economical-cloud' && m.healthy !== false,
        );
        if (!economicalModel) {
          return { decided: false, stage: 'local_zero' };
        }

        ctx.localEligibleReason = eligibility.reason;
        ctx.localZeroGateSkipReasons = [THROUGHPUT_BELOW_THRESHOLD];

        return {
          decided: true,
          stage: 'local_zero',
          decision: {
            request_id: request.request_id,
            selected_model_id: economicalModel.id,
            tier: 'economical-cloud',
            stage: 'local_zero',
            reason_code: THROUGHPUT_BELOW_THRESHOLD,
            routing_latency_ms: 0,
            pin_reason: null,
          },
        };
      }

      // SP-217 / #117: speculative prewarm of the local runtime within a strict
      // deadline when early signals lean local. Fail open — on timeout/miss we
      // fall back to the normal unbounded readiness probe below (no hang).
      const prewarmedReadiness = await attemptSpeculativePrewarm(ctx, resolvePrewarmGuard(ctx));
      const localRuntime = ctx.options.localRuntime ?? defaultLocalRuntimePort;
      const readiness =
        prewarmedReadiness ??
        (await localRuntime.pingServices(
          ctx.options.localConfig,
          ctx.options.httpFetchPort,
        ));

      if (!readiness.anyModelReady) {
        return { decided: false, stage: 'local_zero' };
      }

      ctx.localEligibleReason = eligibility.reason;

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
    },
  };
}
