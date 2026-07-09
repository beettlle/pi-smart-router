import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai/compat';

import { safeCloudDefault } from '../../../src/domain/pipeline/safe-default.js';
import { computeOutputHeadroom } from '../../../src/domain/delegation/output-headroom.js';
import {
  CONTEXT_OVERFLOW_NO_FIT,
  resolveContextOverflowFallback,
} from '../../../src/domain/routing/context-fit.js';
import {
  assertRoutableFleetAfterGeminiToolHistoryGuard,
  GEMINI_TOOL_HISTORY_EXCLUDED,
  resolveEffectiveFleet,
} from '../../../src/domain/routing/tool-history-guard.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../../src/domain/types/index.js';
import type { GeminiToolHistoryGuardResult } from '../../../src/domain/routing/tool-history-guard.js';
import {
  isGeminiThoughtSignatureAssistantError,
  parseAssistantMessageError,
} from '../../../src/infrastructure/delegation/provider-error.js';
import { shouldFailoverOnProviderError } from '../../../src/infrastructure/gateway/gateway-dispatch.js';
import { delegateWithOutcome } from './delegate-stream.js';
import {
  findFleetProfile,
  flushDelegatedEvents,
  injectFailoverNotice,
  resolveRegistryModel,
} from './delegation-runtime.js';
import { buildRoutingRequest } from './routing-context.js';
import { capturePreRouteOutcomes, updateSessionRoutingSnapshot } from './routing-outcomes.js';
import {
  isPlanningDelegateActive,
  resolvePlanningDelegatePath,
} from './planning-delegate.js';
import type { StreamDelegationDeps } from './types.js';

function isRoutingLogEnabled(): boolean {
  return process.env.SMART_ROUTER_LOG_ROUTING === '1';
}

function resolveFailoverProviderError(
  message: AssistantMessage,
): ReturnType<typeof parseAssistantMessageError> {
  const parsed = parseAssistantMessageError(message);
  if (parsed) {
    return parsed;
  }
  if (message.stopReason === 'error' && message.errorMessage) {
    return { message: message.errorMessage };
  }
  return undefined;
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

function createContextOverflowErrorMessage(
  model: Model<Api>,
  reasonCode: string,
): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'error',
    errorMessage: `Context overflow: no model can fit input with required output headroom (${reasonCode})`,
    timestamp: Date.now(),
  };
}

function emitContextOverflowNoFit(
  outer: AssistantMessageEventStream,
  model: Model<Api>,
  reasonCode: string,
): void {
  const errorMessage = createContextOverflowErrorMessage(model, reasonCode);
  outer.push({ type: 'error', reason: 'error', error: errorMessage });
  outer.end(errorMessage);
}

function isZeroOutputLengthStop(message: AssistantMessage): boolean {
  return message.stopReason === 'length' && message.usage.output === 0;
}

function buildOverflowRoutingDecision(
  base: RoutingDecision,
  fallback: ReturnType<typeof resolveContextOverflowFallback>,
): RoutingDecision {
  if (fallback.kind === 'no_fit' || !fallback.model) {
    return {
      ...base,
      selected_model_id: 'unknown',
      reason_code: fallback.reasonCode,
    };
  }

  return {
    ...base,
    selected_model_id: fallback.model.id,
    tier: fallback.model.tier,
    reason_code: fallback.reasonCode,
  };
}

function resolveHeadroomFallbackTarget(
  deps: StreamDelegationDeps,
  request: RoutingRequest,
  effectiveFleet: readonly ModelProfile[],
  targetModel: Model<Api>,
  targetProfile: ModelProfile,
  estimatedInputTokens: number,
  excludeModelIds: readonly string[],
):
  | { kind: 'fit'; model: Model<Api>; profile: ModelProfile; decision: RoutingDecision }
  | { kind: 'no_fit'; reasonCode: typeof CONTEXT_OVERFLOW_NO_FIT } {
  const overflow = resolveContextOverflowFallback(
    effectiveFleet,
    request,
    targetProfile.provider,
  );

  if (overflow.kind === 'no_fit' || !overflow.model) {
    return { kind: 'no_fit', reasonCode: CONTEXT_OVERFLOW_NO_FIT };
  }

  if (excludeModelIds.includes(overflow.model.id)) {
    return { kind: 'no_fit', reasonCode: CONTEXT_OVERFLOW_NO_FIT };
  }

  const alternateModel = resolveRegistryModel(deps.modelRegistry, overflow.model);
  if (!alternateModel) {
    return { kind: 'no_fit', reasonCode: CONTEXT_OVERFLOW_NO_FIT };
  }

  const headroom = computeOutputHeadroom(
    overflow.model,
    estimatedInputTokens,
    undefined,
    alternateModel,
  );
  if (headroom.kind === 'no_fit') {
    return { kind: 'no_fit', reasonCode: CONTEXT_OVERFLOW_NO_FIT };
  }

  return {
    kind: 'fit',
    model: alternateModel,
    profile: overflow.model,
    decision: buildOverflowRoutingDecision(
      {
        request_id: request.request_id,
        selected_model_id: overflow.model.id,
        tier: overflow.model.tier,
        stage: 'fallback',
        reason_code: overflow.reasonCode,
        routing_latency_ms: 0,
        pin_reason: 'context_overflow',
      },
      overflow,
    ),
  };
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
    flushDelegatedEvents(outer, fallbackResult.events, {
      contextWindow: fallbackModel.contextWindow,
    });
    return;
  }

  deps.onRoutingDecision?.(decision);
  deps.datasetRecorder?.record(request, decision);
  updateSessionRoutingSnapshot(deps, sessionId, request, decision);

  let delegationContext: Context = context;

  if (isPlanningDelegateActive(decision)) {
    const planningResolution = await resolvePlanningDelegatePath(
      context,
      decision,
      options,
      deps,
    );
    delegationContext = planningResolution.context;
    decision = planningResolution.decision;
    if (!planningResolution.usedDelegatePath) {
      deps.onRoutingDecision?.(decision);
    }
  }

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
  const headroomExcludedModelIds: string[] = [];
  const estimatedInputTokens =
    request.estimated_input_tokens ?? request.prompt_text.length;
  let pendingFailoverInfo: {
    failedModelId: string;
    alternateModelId: string;
    errorObj?: ReturnType<typeof parseAssistantMessageError>;
  } | undefined;

  while (true) {
    try {
      const targetProfile =
        findFleetProfile(effectiveFleet, targetModel.id) ??
        findFleetProfile(deps.fleet, targetModel.id);

      if (targetProfile) {
        const headroom = computeOutputHeadroom(
          targetProfile,
          estimatedInputTokens,
          undefined,
          targetModel,
        );
        if (headroom.kind === 'no_fit') {
          if (!headroomExcludedModelIds.includes(targetModel.id)) {
            headroomExcludedModelIds.push(targetModel.id);
          }
          const fallbackTarget = resolveHeadroomFallbackTarget(
            deps,
            request,
            effectiveFleet,
            targetModel,
            targetProfile,
            estimatedInputTokens,
            headroomExcludedModelIds,
          );
          if (fallbackTarget.kind === 'no_fit') {
            emitContextOverflowNoFit(outer, targetModel, fallbackTarget.reasonCode);
            return;
          }

          console.warn(
            '[smart-router] output headroom exceeded, escalating to larger model',
            fallbackTarget.model.id,
          );
          pendingFailoverInfo = {
            failedModelId: targetModel.id,
            alternateModelId: fallbackTarget.model.id,
            errorObj: { message: 'insufficient output headroom' },
          };
          decision = fallbackTarget.decision;
          deps.onRoutingDecision?.(decision);
          targetModel = fallbackTarget.model;
          continue;
        }
      }

      const headroomContext = targetProfile
        ? { profile: targetProfile, estimatedInputTokens }
        : undefined;

      const result = await delegateWithOutcome(
        targetModel,
        delegationContext,
        deps,
        options,
        sessionId,
        headroomContext,
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

      if (result.finalMessage && isZeroOutputLengthStop(result.finalMessage)) {
        const lengthStopProfile =
          findFleetProfile(effectiveFleet, targetModel.id) ??
          findFleetProfile(deps.fleet, targetModel.id);
        if (lengthStopProfile) {
          if (!headroomExcludedModelIds.includes(targetModel.id)) {
            headroomExcludedModelIds.push(targetModel.id);
          }
          const fallbackTarget = resolveHeadroomFallbackTarget(
            deps,
            request,
            effectiveFleet,
            targetModel,
            lengthStopProfile,
            estimatedInputTokens,
            headroomExcludedModelIds,
          );
          if (fallbackTarget.kind === 'fit') {
            console.warn(
              '[smart-router] zero-output length stop, escalating to larger model',
              fallbackTarget.model.id,
            );
            pendingFailoverInfo = {
              failedModelId: targetModel.id,
              alternateModelId: fallbackTarget.model.id,
              errorObj: { message: 'zero-output length stop' },
            };
            decision = fallbackTarget.decision;
            deps.onRoutingDecision?.(decision);
            targetModel = fallbackTarget.model;
            continue;
          }
          emitContextOverflowNoFit(outer, targetModel, fallbackTarget.reasonCode);
          return;
        }
      }

      if (
        result.failed &&
        result.finalMessage &&
        isGeminiThoughtSignatureAssistantError(result.finalMessage)
      ) {
        flushDelegatedEvents(outer, result.events, {
          sanitizeErrors: true,
          contextWindow: targetModel.contextWindow,
        });
        return;
      }

      if (result.failed && result.finalMessage) {
        const providerError = resolveFailoverProviderError(result.finalMessage);
        const failedProfile = findFleetProfile(effectiveFleet, targetModel.id);
        if (
          providerError &&
          shouldFailoverOnProviderError(providerError, failedProfile)
        ) {
          deps.router.dispatch.recordOutcome(targetModel.id, providerError);
          failedModelIds.push(targetModel.id);
          const failover = deps.router.dispatch.selectFailover(
            decision,
            failedModelIds,
            effectiveFleet,
          );
          if (!failover) {
            flushDelegatedEvents(outer, result.events, {
          sanitizeErrors: true,
          contextWindow: targetModel.contextWindow,
        });
            return;
          }

          const alternateModel = resolveTargetModel(deps, failover);
          if (!alternateModel || alternateModel.id === targetModel.id) {
            flushDelegatedEvents(outer, result.events, {
          sanitizeErrors: true,
          contextWindow: targetModel.contextWindow,
        });
            return;
          }

          console.warn(
            '[smart-router] infra error, failing over to alternate model',
            alternateModel.id,
          );
          pendingFailoverInfo = {
            failedModelId: targetModel.id,
            alternateModelId: alternateModel.id,
            errorObj: providerError,
          };
          decision = failover;
          targetModel = alternateModel;
          continue;
        }
      }

      flushDelegatedEvents(outer, result.events, {
        sanitizeErrors: result.failed,
        contextWindow: targetModel.contextWindow,
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
      flushDelegatedEvents(outer, fallbackResult.events, {
      contextWindow: fallbackModel.contextWindow,
    });
      return;
    }
  }
}
