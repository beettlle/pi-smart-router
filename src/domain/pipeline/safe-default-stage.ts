/**
 * Safe-default stage (SP-274, #143 partial): `safe_default` + shared
 * fallback decision builder.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272).
 *
 * SP-022: economical-cloud default when no earlier stage decides. Defers to
 * context_overflow_fallback when economical models were context-rejected.
 * The exported decision builder is shared with the orchestrator's
 * pipeline-error fallback path (`buildFallbackDecision`).
 */

import type { RoutingDecision } from '../types/index.js';
import { safeCloudDefault } from './safe-default.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';
import { shouldAttemptContextOverflowFallback } from './context-overflow-fallback-stage.js';

/**
 * Build the safe-cloud-default fallback decision for the orchestrator's
 * pipeline-error / no-stage-decided path. Never throws; degrades to the
 * 'unknown' placeholder when even the fallback selector finds no model.
 */
export function buildSafeDefaultFallbackDecision(
  context: RoutingContext,
  elapsedMs: number,
): RoutingDecision {
  const fallbackModel = safeCloudDefault(context.fleet, {
    request: context.request,
    ...(context.options.contextFitConfig !== undefined
      ? { contextFitConfig: context.options.contextFitConfig }
      : {}),
  });
  const modelId = fallbackModel?.id ?? 'unknown';
  const tier = fallbackModel?.tier ?? 'economical-cloud';

  return {
    request_id: context.request.request_id,
    selected_model_id: modelId,
    tier,
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    routing_latency_ms: elapsedMs,
    pin_reason: null,
  };
}

/**
 * SP-022: economical-cloud default when no earlier stage decides. Defers to
 * context_overflow_fallback when economical models were context-rejected.
 */
export function createSafeDefaultStage(): PipelineStage {
  return {
    name: 'safe_default',
    async run(context: RoutingContext): Promise<StageResult> {
      if (shouldAttemptContextOverflowFallback(context)) {
        return { decided: false, stage: 'safe_default' };
      }

      const fallbackModel = safeCloudDefault(context.fleet, {
        request: context.request,
        ...(context.options.contextFitConfig !== undefined
          ? { contextFitConfig: context.options.contextFitConfig }
          : {}),
      });

      if (!fallbackModel) {
        return { decided: false, stage: 'safe_default' };
      }

      return {
        decided: true,
        stage: 'fallback',
        decision: {
          request_id: context.request.request_id,
          selected_model_id: fallbackModel.id,
          tier: fallbackModel.tier,
          stage: 'fallback',
          reason_code: 'safe_cloud_default',
          routing_latency_ms: 0,
          pin_reason: null,
        },
      };
    },
  };
}
