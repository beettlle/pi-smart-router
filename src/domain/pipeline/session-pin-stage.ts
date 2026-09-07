/**
 * Session-pin stage cluster (SP-273, #143 partial): `loop_escalation` +
 * `session_pin`.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272). Pin state mutations
 * still go through the injected `SessionPinner`; cross-stage outputs
 * (context-overflow escalation markers) are written to the shared context.
 */

import type { PriceCatalog, RoutingRequest } from '../types/index.js';
import type { PinLookupResult } from '../pinning/session-pinner.js';
import { FORCE_REJECTED_NOT_IN_FLEET } from '../pinning/session-pinner.js';
import { evaluateLoopEscalation } from '../pinning/loop-escalation.js';
import { safeCloudDefault } from './safe-default.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';
import {
  enrichRequestWithSaarCandidate,
  isPinOnlyFallbackActive,
  withEstimatedCost,
} from './stage-helpers.js';

/**
 * Mark context-overflow escalation from a pin break / context-rejected pin
 * (SP-095): the unfiltered fleet is consulted later by safe_default /
 * context_overflow_fallback, preferring the pinned model's provider.
 */
function markContextOverflowFromPin(
  context: RoutingContext,
  pinnedModelId: string,
): void {
  const pinnedModel = context.fullFleet.find((model) => model.id === pinnedModelId);
  context.contextOverflowTriggered = true;
  context.contextOverflowPreferredProvider = pinnedModel?.provider ?? null;
}

/**
 * Observational loop escalation (Step 3b — FR-014): detects repeated
 * identical tool failures and re-pins the session to a frontier-capable tier.
 *
 * Runs before turn_envelope and session_pin so it can modify pin state.
 * Never returns decided: true — turnEnvelope or sessionPin picks up the
 * (potentially escalated) pin on subsequent stages.
 */
export function createLoopEscalationStage(): PipelineStage {
  return {
    name: 'loop_escalation',
    async run(context: RoutingContext): Promise<StageResult> {
      const request = context.request;
      const pinner = context.options.sessionPinner;
      const config = context.options.loopEscalationConfig;
      if (!pinner || !config) {
        return { decided: false, stage: 'loop_escalation' };
      }

      const pin = pinner.getPin(request.session_id);
      const result = evaluateLoopEscalation(pin, request, context.fleet, config);

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
    },
  };
}

/**
 * Session pin stage (FR-006, FR-007, FR-008): warm-session pin reuse, SAAR
 * hard-lock / buffer routing, tool-result sub-routes, and fail-closed
 * force_model_id handling (SP-209, #121).
 */
export function createSessionPinStage(): PipelineStage {
  return {
    name: 'session_pin',
    async run(context: RoutingContext): Promise<StageResult> {
      const request = context.request;
      const pinner = context.options.sessionPinner;
      if (!pinner) {
        return { decided: false, stage: 'session_pin' };
      }

      const existingPin = pinner.getPin(request.session_id);
      const saarRequest = enrichRequestWithSaarCandidate(request, context.fleet);
      const result = pinner.lookupPin(saarRequest, context.fleet);
      const priceCatalog = context.options.priceCatalog ?? null;
      const costEstimator = context.options.costEstimator;

      switch (result.action) {
        case 'use_pin': {
          const model = result.pinnedModel!;
          const pin = pinner.getPin(request.session_id);
          const reasonCode =
            result.saarReason === 'saar_hard_lock'
              ? 'saar_hard_lock'
              : result.saarReason === 'saar_tier_upgrade'
                ? 'saar_tier_upgrade'
                : isPinOnlyFallbackActive(context.options, request)
                  ? 'pin_only_fallback'
                  : 'session_pinned';
          return {
            decided: true,
            stage: 'session_pin',
            decision: withEstimatedCost(
              request,
              model,
              {
                request_id: request.request_id,
                selected_model_id: model.id,
                tier: model.tier,
                stage: 'session_pin',
                reason_code: reasonCode,
                routing_latency_ms: 0,
                pin_reason: pin?.pin_reason ?? null,
              },
              priceCatalog,
              costEstimator,
            ),
          };
        }

        case 'saar_route': {
          const model = result.saarRouteModel!;
          const pin = pinner.getPin(request.session_id);
          return {
            decided: true,
            stage: 'session_pin',
            decision: withEstimatedCost(
              request,
              model,
              {
                request_id: request.request_id,
                selected_model_id: model.id,
                tier: model.tier,
                stage: 'session_pin',
                reason_code: result.saarReason ?? 'saar_buffer_active',
                routing_latency_ms: 0,
                pin_reason: pin?.pin_reason ?? null,
              },
              priceCatalog,
              costEstimator,
            ),
          };
        }

        case 'sub_route': {
          const model = result.subRouteModel!;
          const pin = pinner.getPin(request.session_id);
          return {
            decided: true,
            stage: 'session_pin',
            decision: withEstimatedCost(
              request,
              model,
              {
                request_id: request.request_id,
                selected_model_id: model.id,
                tier: model.tier,
                stage: 'session_pin',
                reason_code: 'tool_result_sub_route',
                routing_latency_ms: 0,
                pin_reason: pin?.pin_reason ?? null,
              },
              priceCatalog,
              costEstimator,
            ),
          };
        }

        case 'force_rejected': {
          return forceRejectedDecision(context, request, result, priceCatalog);
        }

        case 'break':
          if (result.breakReason === 'context_overflow' && existingPin) {
            markContextOverflowFromPin(context, existingPin.pinned_model_id);
          }
          return { decided: false, stage: 'session_pin' };

        case 'no_pin':
          if (existingPin) {
            const wasContextRejected = context.contextFitRejected.some(
              (candidate) => candidate.model_id === existingPin.pinned_model_id,
            );
            if (wasContextRejected) {
              markContextOverflowFromPin(context, existingPin.pinned_model_id);
            }
          }
          return { decided: false, stage: 'session_pin' };

        default:
          return { decided: false, stage: 'session_pin' };
      }
    },
  };
}

/**
 * SP-209 / #121: force_model_id could not be honored. Fail closed with an
 * explicit reason — never silently remap to a different provider family.
 * Degrade to the safe cloud default so the host agent still has a usable
 * model (constitution: zero-crash resilience), but record the rejection as
 * reason_code so explain / SMART_ROUTER_LOG_ROUTING=1 surfaces it instead of
 * masking it as a normal route.
 */
function forceRejectedDecision(
  context: RoutingContext,
  request: RoutingRequest,
  result: PinLookupResult,
  priceCatalog: PriceCatalog | null,
): StageResult {
  const fallbackModel = safeCloudDefault(context.fleet, {
    request,
    ...(context.options.contextFitConfig !== undefined
      ? { contextFitConfig: context.options.contextFitConfig }
      : {}),
  });
  const forceReasonCode =
    result.forceRejectionReason ?? FORCE_REJECTED_NOT_IN_FLEET;
  return {
    decided: true,
    stage: 'session_pin',
    decision: fallbackModel
      ? withEstimatedCost(
          request,
          fallbackModel,
          {
            request_id: request.request_id,
            selected_model_id: fallbackModel.id,
            tier: fallbackModel.tier,
            stage: 'session_pin',
            reason_code: forceReasonCode,
            routing_latency_ms: 0,
            pin_reason: 'user_forced',
          },
          priceCatalog,
          context.options.costEstimator,
        )
      : {
          request_id: request.request_id,
          selected_model_id: 'unknown',
          tier: 'economical-cloud',
          stage: 'session_pin',
          reason_code: forceReasonCode,
          routing_latency_ms: 0,
          pin_reason: 'user_forced',
        },
  };
}
