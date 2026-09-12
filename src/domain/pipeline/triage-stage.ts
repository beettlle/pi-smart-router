/**
 * Triage stage cluster (SP-273, #143 partial): `triage` + `triage_cloud_fallback`.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272). Trivial prompts defer
 * cloud routing until after local zero-tier (PRD Step 4); complex prompts
 * route to frontier; ambiguous prompts fall through to later stages.
 */

import { triage as triageClassify } from '../triage/triage-engine.js';
import { resolveTriageCyclomaticThreshold } from '../triage/triage-thresholds.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';

/**
 * Triage stage (FR-003, SC-004 <5ms budget).
 *
 * Records the triage result on the shared context for downstream stages
 * (local_zero eligibility, feature sidecar) regardless of the verdict.
 * Cyclomatic threshold loads from routing-calibration when trained (#171).
 */
export function createTriageStage(): PipelineStage {
  let thresholdLoaded = false;
  let cachedThreshold: number | undefined;

  const resolveThreshold = (context: RoutingContext): number => {
    if (context.options.cyclomaticThreshold !== undefined) {
      return context.options.cyclomaticThreshold;
    }
    if (!thresholdLoaded) {
      cachedThreshold = resolveTriageCyclomaticThreshold({
        ...(context.options.routingCalibrationPath !== undefined
          ? { filePath: context.options.routingCalibrationPath }
          : {}),
      });
      thresholdLoaded = true;
    }
    return cachedThreshold!;
  };

  return {
    name: 'triage',
    async run(context: RoutingContext): Promise<StageResult> {
      const request = context.request;
      const result = triageClassify(request.prompt_text, {
        cyclomaticThreshold: resolveThreshold(context),
      });
      context.triageResult = result;

      if (result.verdict === 'ambiguous') {
        return { decided: false, stage: 'triage' };
      }

      // Trivial prompts defer cloud routing until after local zero-tier (PRD Step 4).
      if (result.verdict === 'trivial') {
        return { decided: false, stage: 'triage' };
      }

      const targetTier = 'frontier-cloud';
      const model = context.fleet.find((m) => m.tier === targetTier && m.healthy !== false);

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
    },
  };
}

/**
 * Economical-cloud fallback for trivial prompts after local zero-tier is
 * skipped or unavailable (PRD Step 4 cloud fallback).
 */
export function createTriageCloudFallbackStage(): PipelineStage {
  return {
    name: 'triage_cloud_fallback',
    async run(context: RoutingContext): Promise<StageResult> {
      const request = context.request;

      if (context.triageResult?.verdict !== 'trivial') {
        return { decided: false, stage: 'triage' };
      }

      const model = context.fleet.find(
        (m) => m.tier === 'economical-cloud' && m.healthy !== false,
      );

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
          reason_code: context.triageResult.reason_code,
          routing_latency_ms: 0,
          pin_reason: null,
        },
      };
    },
  };
}
