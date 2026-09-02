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
import { resolvePeakPricingAdjustment } from '../../../src/domain/pricing/peak-pricing.js';
import {
  CONTEXT_OVERFLOW_NO_FIT,
  resolveContextOverflowFallback,
} from '../../../src/domain/routing/context-fit.js';
import {
  assertRoutableFleetAfterGeminiToolHistoryGuard,
  GEMINI_TOOL_HISTORY_EXCLUDED,
  isGoogleGeminiProfile,
  resolveEffectiveFleet,
} from '../../../src/domain/routing/tool-history-guard.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../../src/domain/types/index.js';
import type { GeminiToolHistoryGuardResult } from '../../../src/domain/routing/tool-history-guard.js';
import {
  isGeminiThoughtSignatureAssistantError,
  parseAssistantMessageError,
} from '../../../src/infrastructure/delegation/provider-error.js';
import { GEMINI_REPLAY_INCOMPATIBLE } from '../../../src/infra/gemini-provider.js';
import { shouldFailoverOnProviderError } from '../../../src/infrastructure/gateway/gateway-dispatch.js';
import {
  commitPipedTerminal,
  delegateWithOutcome,
  type PipedDelegatedStreamResult,
} from './delegate-stream.js';
import {
  createErrorMessage,
  findFleetProfile,
  flushDelegatedEvents,
  type FailoverNoticeInfo,
  resolveRegistryModel,
} from './delegation-runtime.js';
import { buildRoutingRequest } from './routing-context.js';
import { capturePreRouteOutcomes, updateSessionRoutingSnapshot } from './routing-outcomes.js';
import {
  isPlanningDelegateActive,
  resolvePlanningDelegatePath,
} from './planning-delegate.js';
import type { StreamDelegationDeps } from './types.js';
import { isAbortError, throwIfAborted } from './utils.js';

function isPipedResult(
  result: Awaited<ReturnType<typeof delegateWithOutcome>>,
): result is PipedDelegatedStreamResult {
  return 'heldTerminal' in result;
}

/** Fail-open reason codes (SP-226) — emitted in telemetry and SMART_ROUTER_LOG_ROUTING=1. */
export const NO_REGISTRY_MODEL = 'no_registry_model';
export const FAILOVER_EXHAUSTED = 'failover_exhausted';
export const DELEGATION_ABORTED = 'delegation_aborted';

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

  // SP-244 / #165: surface peak vs off-peak pricing rationale for the selected
  // model (Z.ai GLM Coding Plan / DeepSeek API windows; multiplier 1 + window
  // 'none' for non-target providers — fail open).
  const peakPricing = resolvePeakPricingAdjustment({
    id: delegate?.modelId ?? decision.selected_model_id,
    ...(delegate?.provider !== undefined ? { provider: delegate.provider } : {}),
  });

  console.warn(
    '[smart-router] routing decision',
    JSON.stringify({
      request_id: decision.request_id,
      selected_model_id: decision.selected_model_id,
      tier: decision.tier,
      stage: decision.stage,
      reason_code: decision.reason_code,
      routing_latency_ms: decision.routing_latency_ms,
      pricing_window: peakPricing.window,
      peak_pricing: {
        window: peakPricing.window,
        cost_multiplier: peakPricing.cost_multiplier,
        adapter_id: peakPricing.adapter_id,
      },
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

/** Minimal model identity for degraded terminal messages when no Model resolved. */
interface DegradedModelRef {
  readonly api: Api;
  readonly provider: string;
  readonly id: string;
}

function createDegradedErrorMessage(
  model: DegradedModelRef,
  reasonCode: string,
  detail: string,
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
    errorMessage: `Smart router degraded response (${reasonCode}): ${detail}`,
    timestamp: Date.now(),
  };
}

/**
 * Fail-open terminal (SP-226): never throw to the host on exhaustion paths.
 * Emit a structured warning with the reason code and end the outer stream with
 * a degraded error message so the pi host receives an actionable response.
 */
function emitDegradedFailure(
  outer: AssistantMessageEventStream,
  model: DegradedModelRef | undefined,
  selectedModelId: string,
  reasonCode: string,
  detail: string,
): void {
  console.warn(
    '[smart-router] fail-open degraded response',
    JSON.stringify({
      reason_code: reasonCode,
      selected_model_id: selectedModelId,
      detail,
    }),
  );
  const ref: DegradedModelRef = model ?? {
    api: 'unknown',
    provider: 'unknown',
    id: selectedModelId,
  };
  const errorMessage = createDegradedErrorMessage(ref, reasonCode, detail);
  outer.push({ type: 'error', reason: 'error', error: errorMessage });
  outer.end(errorMessage);
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
 *
 * Abort checks run at phase boundaries (entry, fleet refresh, dispatch,
 * planning delegate, each failover iteration). HyDRA/ONNX embedding inference
 * cannot cancel mid-run — fail-fast only before/after that stage (SP-171).
 */
export async function routeAndDelegate(
  context: Context,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
  outer: AssistantMessageEventStream,
): Promise<void> {
  // Phase boundary: abort before any long work (fleet refresh, HyDRA dispatch, delegate).
  throwIfAborted(options);

  const sessionId = options?.sessionId;
  if (deps.ensureFleetFresh) {
    throwIfAborted(options);
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
    // Phase boundary: abort before HyDRA/dispatch (mid-ONNX cancel unsupported).
    throwIfAborted(options);
    decision = await deps.router.dispatch.dispatch(request, { effectiveFleet });
  } catch (error) {
    // Do not treat abort as a routing failure — never failover on cancel.
    if (isAbortError(error, options)) {
      throw error;
    }
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
      undefined,
      {
        outer,
        contextWindow: fallbackModel.contextWindow,
      },
    );
    if (isPipedResult(fallbackResult)) {
      commitPipedTerminal(fallbackResult);
    } else {
      flushDelegatedEvents(outer, fallbackResult.events, {
        contextWindow: fallbackModel.contextWindow,
      });
    }
    return;
  }

  deps.onRoutingDecision?.(decision);
  deps.datasetRecorder?.record(request, decision);
  updateSessionRoutingSnapshot(deps, sessionId, request, decision);

  let delegationContext: Context = context;

  if (isPlanningDelegateActive(decision)) {
    // Phase boundary: abort before planning-delegate sub-call.
    throwIfAborted(options);
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
    // SP-226 fail-open: no registry model resolved — degrade instead of throwing.
    deps.router.dispatch.recordOutcome(decision.selected_model_id, {
      code: 'NO_REGISTRY_MODEL',
    });
    emitDegradedFailure(
      outer,
      undefined,
      decision.selected_model_id,
      NO_REGISTRY_MODEL,
      `No registry model available for routing decision ${decision.selected_model_id}`,
    );
    return;
  }

  logRoutingDecision(decision, {
    provider: targetModel.provider,
    modelId: targetModel.id,
    api: targetModel.api,
  });

  const failedModelIds: string[] = [];
  const headroomExcludedModelIds: string[] = [];
  let geminiReplayFailoverAttempted = false;
  const estimatedInputTokens =
    request.estimated_input_tokens ?? request.prompt_text.length;
  let pendingFailoverInfo: FailoverNoticeInfo | undefined;

  while (true) {
    // Phase boundary: abort before each failover / delegation attempt.
    throwIfAborted(options);
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

      const failoverNotice = pendingFailoverInfo;
      pendingFailoverInfo = undefined;

      const result = await delegateWithOutcome(
        targetModel,
        delegationContext,
        deps,
        options,
        sessionId,
        headroomContext,
        {
          outer,
          ...(failoverNotice !== undefined ? { failoverNotice } : {}),
          contextWindow: targetModel.contextWindow,
        },
        decision.request_id,
        // SP-245 (#166): adaptive reasoning policy — effective thinking level
        // from this turn's envelope + routing decision (recomputed per
        // failover iteration so escalation targets re-evaluate).
        {
          turnType: request.turn_type,
          decision,
          ...(targetProfile !== undefined ? { profile: targetProfile } : {}),
        },
      );

      if (!isPipedResult(result)) {
        flushDelegatedEvents(outer, result.events, {
          sanitizeErrors: result.failed,
          contextWindow: targetModel.contextWindow,
        });
        return;
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
        // SP-233 residual safety net: a thought_signature 400 that survived
        // repair/guard means the session replay state is incompatible with
        // Gemini — fail over ONCE to a non-Google fleet member so the agent
        // loop continues. Never counted as provider infra failure; never
        // Gemini↔Gemini.
        if (!geminiReplayFailoverAttempted) {
          geminiReplayFailoverAttempted = true;
          if (!failedModelIds.includes(targetModel.id)) {
            failedModelIds.push(targetModel.id);
          }
          const nonGoogleFleet = effectiveFleet.filter(
            (profile) => !isGoogleGeminiProfile(profile),
          );
          const replayFailover =
            nonGoogleFleet.length > 0
              ? deps.router.dispatch.selectFailover(
                  decision,
                  failedModelIds,
                  nonGoogleFleet,
                )
              : undefined;
          const failover = replayFailover
            ? { ...replayFailover, reason_code: GEMINI_REPLAY_INCOMPATIBLE }
            : undefined;
          const alternateModel = failover ? resolveTargetModel(deps, failover) : undefined;

          if (failover && alternateModel && alternateModel.id !== targetModel.id) {
            console.warn(
              '[smart-router] gemini replay incompatible, failing over to non-Google model',
              alternateModel.id,
            );
            if (isRoutingLogEnabled()) {
              console.warn(
                '[smart-router] routing decision',
                JSON.stringify({
                  reason_code: GEMINI_REPLAY_INCOMPATIBLE,
                  failed_model_id: targetModel.id,
                  selected_model_id: alternateModel.id,
                }),
              );
            }
            pendingFailoverInfo = {
              failedModelId: targetModel.id,
              alternateModelId: alternateModel.id,
              errorObj: resolveFailoverProviderError(result.finalMessage),
            };
            decision = failover;
            deps.onRoutingDecision?.(decision);
            targetModel = alternateModel;
            continue;
          }
        }
        // No non-Google candidate (or one-shot already used): actionable
        // terminal guidance — never a silent loop.
        commitPipedTerminal(result, { sanitizeErrors: true });
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
            commitPipedTerminal(result, { sanitizeErrors: true });
            return;
          }

          const alternateModel = resolveTargetModel(deps, failover);
          if (!alternateModel || alternateModel.id === targetModel.id) {
            commitPipedTerminal(result, { sanitizeErrors: true });
            return;
          }

          console.warn(
            '[smart-router] infra error, failing over to alternate model',
            alternateModel.id,
          );
          // Discard held terminal from the failed attempt — do not forward to outer.
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

      commitPipedTerminal(result, {
        sanitizeErrors: result.failed,
        contextWindow: targetModel.contextWindow,
      });
      return;
    } catch (error) {
      if (isAbortError(error, options)) {
        // SP-226: telemetry for phase-boundary aborts (previously silent).
        if (isRoutingLogEnabled()) {
          console.warn(
            '[smart-router] delegation aborted',
            JSON.stringify({
              reason_code: DELEGATION_ABORTED,
              model_id: targetModel.id,
            }),
          );
        }
        const abortMessage = createErrorMessage(targetModel, options, error);
        outer.push({ type: 'error', reason: 'aborted', error: abortMessage });
        outer.end(abortMessage);
        return;
      }

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

      if (failover && alternateModel && alternateModel.id !== targetModel.id) {
        console.warn(
          '[smart-router] stream delegation failed, failing over',
          error instanceof Error ? error.message : String(error),
        );
        pendingFailoverInfo = {
          failedModelId: targetModel.id,
          alternateModelId: alternateModel.id,
          errorObj: { message: error instanceof Error ? error.message : String(error) },
        };
        decision = failover;
        targetModel = alternateModel;
        continue;
      }

      const fallbackModel = resolveFallbackModel(deps, effectiveFleet);
      if (!fallbackModel || fallbackModel.id === targetModel.id) {
        // SP-226 fail-open: fleet/failover exhausted and no distinct safe
        // default — degrade instead of throwing to the host.
        emitDegradedFailure(
          outer,
          targetModel,
          decision.selected_model_id,
          FAILOVER_EXHAUSTED,
          error instanceof Error ? error.message : String(error),
        );
        return;
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

      const failoverNotice = pendingFailoverInfo;
      pendingFailoverInfo = undefined;
      const fallbackResult = await delegateWithOutcome(
        fallbackModel,
        context,
        deps,
        options,
        sessionId,
        undefined,
        {
          outer,
          ...(failoverNotice !== undefined ? { failoverNotice } : {}),
          contextWindow: fallbackModel.contextWindow,
        },
        decision.request_id,
      );
      if (isPipedResult(fallbackResult)) {
        commitPipedTerminal(fallbackResult);
      } else {
        flushDelegatedEvents(outer, fallbackResult.events, {
          contextWindow: fallbackModel.contextWindow,
        });
      }
      return;
    }
  }
}
