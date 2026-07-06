import type { Api, AssistantMessageEventStream, Context, Model, SimpleStreamOptions } from '@earendil-works/pi-ai/compat';

import { safeCloudDefault } from '../../../src/domain/pipeline/safe-default.js';
import {
  assertRoutableFleetAfterGeminiToolHistoryGuard,
  GEMINI_TOOL_HISTORY_EXCLUDED,
  resolveEffectiveFleet,
} from '../../../src/domain/routing/tool-history-guard.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../../src/domain/types/index.js';
import type { GeminiToolHistoryGuardResult } from '../../../src/domain/routing/tool-history-guard.js';
import {
  isGeminiThoughtSignatureAssistantError,
  isInfraAssistantError,
  parseAssistantMessageError,
} from '../../../src/infrastructure/delegation/provider-error.js';
import { delegateWithOutcome } from './delegate-stream.js';
import {
  findFleetProfile,
  flushDelegatedEvents,
  injectFailoverNotice,
  resolveRegistryModel,
} from './delegation-runtime.js';
import { buildRoutingRequest } from './routing-context.js';
import { capturePreRouteOutcomes, updateSessionRoutingSnapshot } from './routing-outcomes.js';
import type { StreamDelegationDeps } from './types.js';

function isRoutingLogEnabled(): boolean {
  return process.env.SMART_ROUTER_LOG_ROUTING === '1';
}

function logRoutingDecision(
  decision: RoutingDecision,
  delegate?: { provider: string; modelId: string; api: Api },
): void {
  if (!isRoutingLogEnabled()) {
    return;
  }

  console.warn(
    '[smart-router] routing decision',
    JSON.stringify({
      request_id: decision.request_id,
      selected_model_id: decision.selected_model_id,
      tier: decision.tier,
      stage: decision.stage,
      reason_code: decision.reason_code,
      routing_latency_ms: decision.routing_latency_ms,
      features: decision.features ?? null,
      delegate,
    }),
  );
}

export function resolveTargetModel(
  deps: StreamDelegationDeps,
  decision: RoutingDecision,
): Model<Api> | undefined {
  const profile = findFleetProfile(deps.fleet, decision.selected_model_id);
  if (!profile) {
    return undefined;
  }
  return resolveRegistryModel(deps.modelRegistry, profile);
}

function resolveFallbackModel(
  deps: StreamDelegationDeps,
  effectiveFleet?: readonly ModelProfile[],
): Model<Api> | undefined {
  const fallbackProfile = safeCloudDefault(effectiveFleet ?? deps.fleet);
  if (!fallbackProfile) {
    return undefined;
  }
  return resolveRegistryModel(deps.modelRegistry, fallbackProfile);
}

/**
 * Route a request and delegate to the selected provider with failover.
 * Kept as one module to preserve the atomic failover state machine (#33).
 */
export async function routeAndDelegate(
  context: Context,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
  outer: AssistantMessageEventStream,
): Promise<void> {
  const sessionId = options?.sessionId;
  if (deps.ensureFleetFresh) {
    await deps.ensureFleetFresh();
  }
  let decision: RoutingDecision;
  let request: RoutingRequest;
  let effectiveFleet: readonly ModelProfile[] = deps.fleet;
  let guardResult: GeminiToolHistoryGuardResult | undefined;
  const priorSnapshot =
    sessionId !== undefined ? deps.sessionRouting?.get(sessionId) : undefined;
  const hadPin =
    sessionId !== undefined && deps.sessionPinner
      ? deps.sessionPinner.getPin(sessionId) !== null
      : false;

  try {
    request = buildRoutingRequest(
      context,
      options,
      deps.lifecycleHookState,
    );
    guardResult = resolveEffectiveFleet(deps.fleet, request, context.messages);
    effectiveFleet = guardResult.effectiveFleet;
    assertRoutableFleetAfterGeminiToolHistoryGuard(guardResult);
    if (guardResult.excluded) {
      console.warn(
        '[smart-router] gemini tool history guard applied',
        JSON.stringify({
          reason_code: GEMINI_TOOL_HISTORY_EXCLUDED,
          session_id: request.session_id,
          excluded_providers: ['google', 'gemini'],
        }),
      );
    }
    capturePreRouteOutcomes(request, deps, priorSnapshot, hadPin);
    decision = await deps.router.dispatch.dispatch(request, { effectiveFleet });
  } catch (error) {
    const fallbackModel = resolveFallbackModel(deps, effectiveFleet);
    if (!fallbackModel) {
      throw error;
    }
    console.warn(
      '[smart-router] routing failed, using safe cloud default',
      error instanceof Error ? error.message : String(error),
    );
    const fallbackResult = await delegateWithOutcome(
      fallbackModel,
      context,
      deps,
      options,
      sessionId,
    );
    flushDelegatedEvents(outer, fallbackResult.events);
    return;
  }

  deps.onRoutingDecision?.(decision);
  deps.datasetRecorder?.record(request, decision);
  updateSessionRoutingSnapshot(deps, sessionId, request, decision);

  let targetModel = resolveTargetModel(deps, decision);
  if (!targetModel) {
    console.warn(
      '[smart-router] routed model not found in registry',
      decision.selected_model_id,
    );
    targetModel = resolveFallbackModel(deps, effectiveFleet);
  }

  if (!targetModel) {
    if (decision.selected_model_id === 'unknown' && guardResult) {
      assertRoutableFleetAfterGeminiToolHistoryGuard(guardResult);
    }
    throw new Error(
      `No registry model available for routing decision ${decision.selected_model_id}`,
    );
  }

  logRoutingDecision(decision, {
    provider: targetModel.provider,
    modelId: targetModel.id,
    api: targetModel.api,
  });

  const failedModelIds: string[] = [];
  let pendingFailoverInfo: {
    failedModelId: string;
    alternateModelId: string;
    errorObj?: ReturnType<typeof parseAssistantMessageError>;
  } | undefined;

  while (true) {
    try {
      const result = await delegateWithOutcome(
        targetModel,
        context,
        deps,
        options,
        sessionId,
      );

      if (pendingFailoverInfo) {
        injectFailoverNotice(
          result.events,
          pendingFailoverInfo.failedModelId,
          pendingFailoverInfo.alternateModelId,
          pendingFailoverInfo.errorObj,
        );
        pendingFailoverInfo = undefined;
      }

      if (
        result.failed &&
        result.finalMessage &&
        isGeminiThoughtSignatureAssistantError(result.finalMessage)
      ) {
        flushDelegatedEvents(outer, result.events, { sanitizeErrors: true });
        return;
      }

      if (
        result.failed &&
        result.finalMessage &&
        isInfraAssistantError(result.finalMessage)
      ) {
        failedModelIds.push(targetModel.id);
        const failover = deps.router.dispatch.selectFailover(
          decision,
          failedModelIds,
          effectiveFleet,
        );
        if (!failover) {
          flushDelegatedEvents(outer, result.events, { sanitizeErrors: true });
          return;
        }

        const alternateModel = resolveTargetModel(deps, failover);
        if (!alternateModel || alternateModel.id === targetModel.id) {
          flushDelegatedEvents(outer, result.events, { sanitizeErrors: true });
          return;
        }

        console.warn(
          '[smart-router] infra error, failing over to alternate model',
          alternateModel.id,
        );
        pendingFailoverInfo = {
          failedModelId: targetModel.id,
          alternateModelId: alternateModel.id,
          errorObj: parseAssistantMessageError(result.finalMessage),
        };
        decision = failover;
        targetModel = alternateModel;
        continue;
      }

      flushDelegatedEvents(outer, result.events, {
        sanitizeErrors: result.failed,
      });
      return;
    } catch (error) {
      deps.router.dispatch.recordOutcome(targetModel.id, { code: 'STREAM_DELEGATION_ERROR' });

      if (!failedModelIds.includes(targetModel.id)) {
        failedModelIds.push(targetModel.id);
      }

      const failover = deps.router.dispatch.selectFailover(
        decision,
        failedModelIds,
        effectiveFleet,
      );
      const alternateModel = failover ? resolveTargetModel(deps, failover) : undefined;

      if (alternateModel && alternateModel.id !== targetModel.id) {
        console.warn(
          '[smart-router] stream delegation failed, failing over',
          error instanceof Error ? error.message : String(error),
        );
        pendingFailoverInfo = {
          failedModelId: targetModel.id,
          alternateModelId: alternateModel.id,
          errorObj: { message: error instanceof Error ? error.message : String(error) },
        };
        if (!failover) {
          throw error;
        }
        decision = failover;
        targetModel = alternateModel;
        continue;
      }

      const fallbackModel = resolveFallbackModel(deps, effectiveFleet);
      if (!fallbackModel || fallbackModel.id === targetModel.id) {
        throw error;
      }

      console.warn(
        '[smart-router] stream delegation failed, using safe cloud default',
        error instanceof Error ? error.message : String(error),
      );
      pendingFailoverInfo = {
        failedModelId: targetModel.id,
        alternateModelId: fallbackModel.id,
        errorObj: { message: error instanceof Error ? error.message : String(error) },
      };

      const fallbackResult = await delegateWithOutcome(
        fallbackModel,
        context,
        deps,
        options,
        sessionId,
      );
      if (pendingFailoverInfo) {
        injectFailoverNotice(
          fallbackResult.events,
          pendingFailoverInfo.failedModelId,
          pendingFailoverInfo.alternateModelId,
          pendingFailoverInfo.errorObj,
        );
      }
      flushDelegatedEvents(outer, fallbackResult.events);
      return;
    }
  }
}
