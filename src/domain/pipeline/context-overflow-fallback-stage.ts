/**
 * Context-overflow fallback cluster (SP-274, #143 partial):
 * `context_overflow_fallback` + shared escalation predicates.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272).
 *
 * SP-095: after safe_default, escalate to the largest-fit model when
 * economical models cannot fit the current context. The exported predicate /
 * decision builder are shared with the orchestrator's pipeline-error
 * fallback path (`buildFallbackDecision`).
 */

import {
  needsContextOverflowFallback,
  resolveContextOverflowFallback,
  CONTEXT_OVERFLOW_NO_FIT,
} from '../routing/context-fit.js';
import type { RoutingDecision } from '../types/index.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';
import { withEstimatedCost } from './stage-helpers.js';

/**
 * True when the route should defer to context-overflow escalation: the
 * context_fit stage rejected every economical candidate (or a pin break
 * marked overflow earlier) and the request is not force-pinned.
 */
export function shouldAttemptContextOverflowFallback(
  context: RoutingContext,
): boolean {
  if (context.request.force_model_id) {
    return false;
  }

  if (context.contextOverflowTriggered) {
    return true;
  }

  return needsContextOverflowFallback(
    context.fleet,
    context.contextFitRejected,
    context.fullFleet,
  );
}

/** Build the overflow-escalation decision (or its no_fit terminal form). */
export function buildContextOverflowFallbackDecision(
  context: RoutingContext,
  elapsedMs: number,
): RoutingDecision {
  const request = context.request;
  const overflow = resolveContextOverflowFallback(
    context.fullFleet,
    request,
    context.contextOverflowPreferredProvider,
    context.options.contextFitConfig,
  );

  if (overflow.kind === 'no_fit') {
    return {
      request_id: request.request_id,
      selected_model_id: 'unknown',
      tier: 'economical-cloud',
      stage: 'fallback',
      reason_code: CONTEXT_OVERFLOW_NO_FIT,
      candidates: context.contextFitRejected,
      routing_latency_ms: elapsedMs,
      pin_reason: null,
    };
  }

  const model = overflow.model!;
  return withEstimatedCost(
    request,
    model,
    {
      request_id: request.request_id,
      selected_model_id: model.id,
      tier: model.tier,
      stage: 'fallback',
      reason_code: overflow.reasonCode,
      candidates: context.contextFitRejected,
      routing_latency_ms: elapsedMs,
      pin_reason: null,
    },
    context.options.priceCatalog ?? null,
  );
}

/**
 * SP-095 final stage: escalate to the largest-fit model when economical
 * models were context-rejected. Decides only when escalation applies.
 */
export function createContextOverflowFallbackStage(): PipelineStage {
  return {
    name: 'context_overflow_fallback',
    async run(context: RoutingContext): Promise<StageResult> {
      if (!shouldAttemptContextOverflowFallback(context)) {
        return { decided: false, stage: 'context_overflow_fallback' };
      }

      const decision = buildContextOverflowFallbackDecision(context, 0);
      return {
        decided: true,
        stage: 'context_overflow_fallback',
        decision,
      };
    },
  };
}
