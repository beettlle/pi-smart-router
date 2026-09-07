/**
 * HyDRA match stage cluster (SP-273, #143 partial): `hydra_match` +
 * degraded-sandwich failover + learned-route recording.
 *
 * Behavior-preserving extraction from `RouterPipeline` behind the
 * `PipelineStage` / `RoutingContext` contract (SP-272).
 *
 * SP-212 / #119: encoder/neural errors and budget overruns with no selection
 * fail open through the degraded sandwich (learned → pattern → safe default)
 * instead of throwing to the host.
 */

import {
  MissingWeightsFailClosedError,
  type MatchResult,
} from '../matching/hydra-matcher.js';
import type { Tier } from '../types/index.js';
import { DEFAULT_DEGRADED_ROUTE_CONFIG } from '../types/schemas.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../config/defaults.js';
import {
  requirementFingerprint,
  resolveDegradedRoute,
  type NeuralFailureKind,
} from '../routing/degraded-route-sandwich.js';
import { safeCloudDefault } from './safe-default.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';
import {
  constrainFleetToTierHint,
  estimateCheapToolUseRequirement,
  redactPromptFromError,
  withEstimatedCost,
} from './stage-helpers.js';

/**
 * Step 5: HyDRA embedding matcher for ambiguous prompts (T050).
 * Scores fleet candidates via embedding cosine similarity with shortfall gate.
 * Pass-through when no matcher is configured.
 */
export function createHydraMatchStage(): PipelineStage {
  return {
    name: 'hydra_match',
    async run(context: RoutingContext): Promise<StageResult> {
      const request = context.request;
      const matcher = context.options.hydraMatcher;
      if (!matcher) {
        return { decided: false, stage: 'hydra_match' };
      }

      const fleetForMatch = context.tierHint
        ? constrainFleetToTierHint(context.fleet, context.tierHint)
        : context.fleet;

      let result: MatchResult;
      try {
        result = await matcher.match(request, fleetForMatch);
      } catch (error: unknown) {
        // SP-252 / #148: operator fail-closed — placeholder requirement heads are
        // not treated as learned production heads; the decision drops into the
        // degraded sandwich as neural_misconfigured with SP-251 codes visible.
        if (error instanceof MissingWeightsFailClosedError) {
          console.warn(
            'HyDRA fail-closed on missing weight artifacts; routing via degraded sandwich',
            {
              request_id: request.request_id,
              session_id: request.session_id,
              reason_codes: [...error.reasonCodes],
            },
          );
          return degradedRouteStage(context, 'neural_misconfigured', error.reasonCodes);
        }
        console.warn('HyDRA neural match failed; routing via degraded sandwich', {
          request_id: request.request_id,
          session_id: request.session_id,
          error: redactPromptFromError(error, request.prompt_text),
        });
        return degradedRouteStage(context, 'neural_error');
      }

      // SP-252 / #148: pipeline-side fail-closed — honors the operator flag even
      // when the matcher was constructed without it. Placeholder-scored
      // requirements are discarded (not recorded as a neural success).
      const degradedConfig =
        context.options.degradedRouteConfig ??
        DEFAULT_OPERATOR_CONFIG.degraded_route ??
        DEFAULT_DEGRADED_ROUTE_CONFIG;
      const missingWeightsCodes = result.requirement_reason_codes ?? [];
      if (
        degradedConfig.fail_closed_on_missing_weights &&
        missingWeightsCodes.length > 0
      ) {
        console.warn(
          'HyDRA fail-closed on missing weight artifacts; routing via degraded sandwich',
          {
            request_id: request.request_id,
            session_id: request.session_id,
            reason_codes: [...missingWeightsCodes],
          },
        );
        return degradedRouteStage(context, 'neural_misconfigured', missingWeightsCodes);
      }

      context.hydraResult = result;

      if (result.budgetExceeded && !result.selected) {
        return degradedRouteStage(context, 'neural_budget_exceeded');
      }

      if (!result.selected) {
        return { decided: false, stage: 'hydra_match' };
      }

      const selectedModel = context.fleet.find(
        (m) => m.id === result.selected!.model_id,
      );
      if (!selectedModel) {
        return { decided: false, stage: 'hydra_match' };
      }

      context.routePath = 'neural';
      context.routePathConfidence = Math.min(1, Math.max(0, result.selected.score));
      recordLearnedRoute(context, selectedModel.tier);

      return {
        decided: true,
        stage: 'hydra_match',
        decision: withEstimatedCost(
          request,
          selectedModel,
          {
            request_id: request.request_id,
            selected_model_id: selectedModel.id,
            tier: selectedModel.tier,
            stage: 'hydra_match',
            reason_code: 'hydra_embedding_match',
            candidates: result.candidates,
            routing_latency_ms: result.elapsedMs,
            pin_reason: null,
          },
          context.options.priceCatalog ?? null,
          context.options.costEstimator,
        ),
      };
    },
  };
}

/**
 * SP-212 / #119 degraded sandwich stage: learned map → operator pattern pack
 * → safe default. Never throws; falls through to the legacy safe_default
 * stage when disabled or when no degraded path can select a model.
 */
function degradedRouteStage(
  context: RoutingContext,
  failure: NeuralFailureKind,
  failureReasonCodes?: readonly string[],
): StageResult {
  const request = context.request;
  const config =
    context.options.degradedRouteConfig ??
    DEFAULT_OPERATOR_CONFIG.degraded_route ??
    DEFAULT_DEGRADED_ROUTE_CONFIG;

  if (!config.enabled) {
    return { decided: false, stage: 'hydra_match' };
  }

  const safeDefaultModel = safeCloudDefault(context.fleet, {
    request,
    ...(context.options.contextFitConfig !== undefined
      ? { contextFitConfig: context.options.contextFitConfig }
      : {}),
  });

  const resolution = resolveDegradedRoute({
    failure,
    fleet: context.fleet,
    toolUseEstimate: estimateCheapToolUseRequirement(request.prompt_text),
    clusterId: context.clusterMatch?.clusterId ?? null,
    learnedStore: context.options.learnedRouteStore ?? null,
    patternPack: context.options.patternPack ?? null,
    safeDefaultModel,
    config,
    promptText: request.prompt_text,
  });

  context.routePath = resolution.routePath;
  context.routePathConfidence = resolution.confidence;

  if (!resolution.model) {
    return { decided: false, stage: 'hydra_match' };
  }

  // SP-252 / #148: when a fail-closed trigger carried SP-251 missing-weights
  // codes, surface them as the decision reason_code so the degraded state is
  // visible on the decision path (route_path still records the sandwich
  // branch that resolved: learned / heuristic / safe_default).
  const reasonCode =
    failureReasonCodes && failureReasonCodes.length > 0
      ? failureReasonCodes.join(',')
      : resolution.reasonCode;

  return {
    decided: true,
    stage: 'hydra_match',
    decision: withEstimatedCost(
      request,
      resolution.model,
      {
        request_id: request.request_id,
        selected_model_id: resolution.model.id,
        tier: resolution.model.tier,
        stage: resolution.routePath === 'safe_default' ? 'fallback' : 'hydra_match',
        reason_code: reasonCode,
        routing_latency_ms: 0,
        pin_reason: null,
      },
      context.options.priceCatalog ?? null,
      context.options.costEstimator,
    ),
  };
}

/**
 * Record the neural decision into the learned map (SP-212). Keys are the
 * requirement fingerprint and/or cluster id — never raw prompt text.
 */
function recordLearnedRoute(context: RoutingContext, tier: Tier): void {
  const store = context.options.learnedRouteStore;
  if (!store) {
    return;
  }

  const requirements = context.hydraResult?.requirements;
  const fingerprint = requirements ? requirementFingerprint(requirements) : null;
  const clusterId = context.clusterMatch?.clusterId ?? null;
  if (fingerprint === null && clusterId === null) {
    return;
  }

  store.record({ requirementFingerprint: fingerprint, clusterId }, tier);
}
