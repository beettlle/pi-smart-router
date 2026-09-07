/**
 * Turn-envelope stage (SP-274, #143 partial): `turn_envelope`.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272).
 *
 * Step 2b (<2ms budget): per-turn tier bias from the turn envelope
 * (planning → frontier, tool_result/subagent → economical), gated by the
 * pin-switch breakeven model (SP-126/SP-123 SAAR buffer) and composed with
 * the cache-preserving planning delegate (SP-143, #71).
 */

import type {
  ModelProfile,
  PlanningDelegateConfig,
  RoutingRequest,
} from '../types/index.js';
import { classifyTurnEnvelope } from '../triage/turn-envelope.js';
import {
  evaluateModelSwitchBreakeven,
  type ModelSwitchBreakevenContext,
} from '../pinning/session-pinner.js';
import { selectLowestCostModel } from '../pinning/sub-route-policy.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../config/defaults.js';
import {
  createPlanningDelegateObservability,
  PLANNING_DELEGATE,
  PLANNING_DELEGATE_DISABLED,
  PLANNING_DIRECT_FRONTIER,
} from '../ports/telemetry-emitter-port.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';
import { TURN_TIER_MAP, isPinOnlyFallbackActive, withEstimatedCost } from './stage-helpers.js';

function shouldDeferPlanningForSaar(context: RoutingContext): boolean {
  const saarConfig = context.options.saarConfig;
  const pinner = context.options.sessionPinner;
  if (!saarConfig || !pinner) {
    return false;
  }

  const pin = pinner.getPin(context.request.session_id);
  if (!pin) {
    return false;
  }

  const saarState = pinner.getSaarState(context.request.session_id);
  const turnIndex = saarState?.turn_index ?? 0;
  return turnIndex >= saarConfig.planning_turn_buffer;
}

/**
 * SP-123: SAAR planning buffer explicitly allows frontier planning turns
 * without breakeven gating (#73 composes with buffer, not replaces it).
 */
function isSaarPlanningBufferActive(context: RoutingContext): boolean {
  const saarConfig = context.options.saarConfig;
  const pinner = context.options.sessionPinner;
  if (!saarConfig || !pinner) {
    return false;
  }

  if (!pinner.getPin(context.request.session_id)) {
    return false;
  }

  const saarState = pinner.getSaarState(context.request.session_id);
  if (!saarState) {
    return false;
  }

  return saarState.turn_index < saarConfig.planning_turn_buffer;
}

function resolveBreakevenContext(
  context: RoutingContext,
): ModelSwitchBreakevenContext | undefined {
  if (
    context.options.quotaWindowPosition === undefined &&
    context.options.virtualCostV2Config === undefined
  ) {
    return undefined;
  }

  return {
    priceCatalog: context.options.priceCatalog ?? null,
    ...(context.options.quotaWindowPosition !== undefined
      ? { quotaWindowPosition: context.options.quotaWindowPosition }
      : {}),
    ...(context.options.virtualCostV2Config !== undefined
      ? { virtualCostV2Config: context.options.virtualCostV2Config }
      : {}),
  };
}

function resolvePlanningDelegateConfig(
  context: RoutingContext,
): PlanningDelegateConfig {
  return (
    context.options.planningDelegateConfig ??
    DEFAULT_OPERATOR_CONFIG.planning_delegate
  );
}

function resolvePlanningDirectFallbackReason(
  context: RoutingContext,
): string | null {
  const config = resolvePlanningDelegateConfig(context);
  if (!config.enabled) {
    return PLANNING_DELEGATE_DISABLED;
  }
  return null;
}

/**
 * SP-143: emit planning_delegate when enabled; otherwise record direct fallback
 * observability and return null so breakeven-gated direct frontier can proceed.
 */
function tryPlanningDelegateDecision(
  context: RoutingContext,
  pinnedModel: ModelProfile,
  frontierModel: ModelProfile,
): StageResult | null {
  const config = resolvePlanningDelegateConfig(context);
  if (!config.enabled) {
    return null;
  }

  context.planningDelegate = createPlanningDelegateObservability({
    path: 'delegate',
    primary_model_id: pinnedModel.id,
    delegate_model_id: frontierModel.id,
    compressed_context: config.compressed_context,
    planning_delegate_reason_code: PLANNING_DELEGATE,
  });

  return {
    decided: true,
    stage: 'turn_envelope',
    decision: withEstimatedCost(
      context.request,
      pinnedModel,
      {
        request_id: context.request.request_id,
        selected_model_id: pinnedModel.id,
        tier: pinnedModel.tier,
        stage: 'turn_envelope',
        reason_code: PLANNING_DELEGATE,
        routing_latency_ms: 0,
        pin_reason: null,
      },
      context.options.priceCatalog ?? null,
      context.options.costEstimator,
    ),
  };
}

function setPlanningDelegateDirectFallback(
  context: RoutingContext,
  delegateModelId: string | null,
  fallbackReason: string,
): void {
  context.planningDelegate = createPlanningDelegateObservability({
    path: 'direct',
    delegate_model_id: delegateModelId,
    planning_delegate_reason_code: PLANNING_DIRECT_FRONTIER,
    fallback_reason: fallbackReason,
  });
}

/** Step 2b: per-turn tier bias with pin-breakeven + planning-delegate gating. */
export function createTurnEnvelopeStage(): PipelineStage {
  return {
    name: 'turn_envelope',
    async run(context: RoutingContext): Promise<StageResult> {
      const request: RoutingRequest = context.request;
      if (isPinOnlyFallbackActive(context.options, request)) {
        return { decided: false, stage: 'turn_envelope' };
      }

      // SP-209 / #121: an explicit force_model_id override must be resolved by the
      // session_pin stage (healthy in-fleet → use_pin; unavailable → fail-closed
      // reason). Do not let the turn envelope short-circuit and silently drop the
      // force, which previously caused first-turn forces to remap providers.
      if (request.force_model_id) {
        return { decided: false, stage: 'turn_envelope' };
      }

      const turnType = request.turn_type ?? classifyTurnEnvelope(request.messages);
      const targetTier = TURN_TIER_MAP[turnType] ?? null;

      if (!targetTier) {
        return { decided: false, stage: 'turn_envelope' };
      }

      // SP-123: post-buffer planning defers to session_pin SAAR hard-lock.
      if (turnType === 'planning' && shouldDeferPlanningForSaar(context)) {
        return { decided: false, stage: 'turn_envelope' };
      }

      const tierCandidates = context.fleet.filter(
        (m) => m.tier === targetTier && m.healthy !== false,
      );
      const targetModel = selectLowestCostModel(tierCandidates);
      if (!targetModel) {
        return { decided: false, stage: 'turn_envelope' };
      }

      const pinner = context.options.sessionPinner;
      const pin = pinner?.getPin(request.session_id) ?? null;
      const pinnedModel =
        pin !== null
          ? context.fleet.find(
              (m) => m.id === pin.pinned_model_id && m.healthy !== false,
            )
          : undefined;

      // SP-143: cache-preserving planning delegate when warm economical pin would switch to frontier.
      if (
        turnType === 'planning' &&
        pinnedModel &&
        pinnedModel.tier === 'economical-cloud' &&
        pinnedModel.id !== targetModel.id
      ) {
        const delegateDecision = tryPlanningDelegateDecision(
          context,
          pinnedModel,
          targetModel,
        );
        if (delegateDecision) {
          return delegateDecision;
        }
      }

      if (pinnedModel && pinnedModel.id !== targetModel.id) {
        const skipBreakeven =
          turnType === 'planning' && isSaarPlanningBufferActive(context);
        if (!skipBreakeven) {
          const tokenEstimate =
            request.estimated_input_tokens ?? request.prompt_text.length;
          const breakeven = evaluateModelSwitchBreakeven(
            pinnedModel,
            targetModel,
            tokenEstimate,
            tokenEstimate,
            context.options.saarConfig,
            resolveBreakevenContext(context),
          );
          if (!breakeven.shouldSwitch) {
            context.breakevenReason = 'breakeven_blocked';
            return { decided: false, stage: 'turn_envelope' };
          }
          context.breakevenReason = 'breakeven_pass';
        }
      }

      const directReasonCode = `turn_${turnType}`;
      let planningDirectFallback: string | null = null;

      if (
        turnType === 'planning' &&
        pinnedModel &&
        pinnedModel.tier === 'economical-cloud' &&
        pinnedModel.id !== targetModel.id
      ) {
        planningDirectFallback = resolvePlanningDirectFallbackReason(context);
      }

      if (planningDirectFallback) {
        setPlanningDelegateDirectFallback(
          context,
          targetModel.id,
          planningDirectFallback,
        );
      }

      return {
        decided: true,
        stage: 'turn_envelope',
        decision: withEstimatedCost(
          request,
          targetModel,
          {
            request_id: request.request_id,
            selected_model_id: targetModel.id,
            tier: targetTier,
            stage: 'turn_envelope',
            reason_code: planningDirectFallback
              ? PLANNING_DIRECT_FRONTIER
              : directReasonCode,
            routing_latency_ms: 0,
            pin_reason: null,
          },
          context.options.priceCatalog ?? null,
          context.options.costEstimator,
        ),
      };
    },
  };
}
