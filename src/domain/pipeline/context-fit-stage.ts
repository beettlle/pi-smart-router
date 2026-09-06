/**
 * Context-fit stage (SP-274, #143 partial): `context_fit`.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272).
 *
 * SP-093: filters the fleet to models whose context window fits the
 * estimated input tokens before session pin and HyDRA matching. Records
 * rejections for the feature sidecar and overflow escalation; never decides.
 */

import { filterFleetByContextFit } from '../routing/context-fit.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';

/** Filter the fleet to context-fitting models; narrow the shared fleet. */
export function createContextFitStage(): PipelineStage {
  return {
    name: 'context_fit',
    async run(context: RoutingContext): Promise<StageResult> {
      const result = filterFleetByContextFit(
        context.fleet,
        context.request,
        context.options.contextFitConfig,
      );
      context.fleet = result.effectiveFleet;
      context.contextFitRejected = result.rejected;
      context.contextFitViableCount = result.effectiveFleet.length;
      return { decided: false, stage: 'context_fit' };
    },
  };
}
