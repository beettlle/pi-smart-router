/**
 * Cache-preserving planning delegate (SP-144, #71).
 *
 * When the pipeline emits `planning_delegate`, run an ephemeral frontier sub-call
 * on compressed context, inject the result as an observation, and keep primary
 * inference on the pinned economical model. Falls back to direct frontier routing
 * when sub-agent spawn is unavailable (pi has no native sub-agent API yet).
 *
 * SP-213 / #120: sub-calls are bounded by a global stage timeout and a per-call
 * worker timeout (llm-use WORKER_GLOBAL_TIMEOUT / WORKER_CALL_TIMEOUT pattern).
 * On timeout the worker is cancelled/abandoned, `planning_delegate_timeout` is
 * recorded, and routing falls back to the direct frontier path — never a hang.
 */

import {
  type Api,
  type AssistantMessage,
  type Context,
  type Message,
  type Model,
  type SimpleStreamOptions,
  type TextContent,
} from '@earendil-works/pi-ai/compat';

import type {
  CompressedContextSpec,
  PlanningDelegateObservability,
  RoutingDecision,
} from '../../../src/domain/types/index.js';
import { DEFAULT_PLANNING_DELEGATE_CONFIG } from '../../../src/domain/types/schemas.js';
import {
  createPlanningDelegateObservability,
  enrichRoutingDecisionWithPlanningDelegate,
  PLANNING_DELEGATE,
  PLANNING_DELEGATE_TIMEOUT,
  PLANNING_DELEGATE_UNAVAILABLE,
  PLANNING_DIRECT_FRONTIER,
} from '../../../src/infrastructure/telemetry/routing-telemetry.js';
import { collectDelegatedStream } from './delegate-stream.js';
import { findFleetProfile, resolveRegistryModel } from './delegation-runtime.js';
import type { StreamDelegationDeps } from './types.js';
import { throwIfAborted } from './utils.js';

/** Prefix for injected planning observations visible to the primary model. */
export const PLANNING_DELEGATE_OBSERVATION_PREFIX =
  '[smart-router planning delegate]' as const;

export type PlanningDelegateSpawnResult =
  | { readonly ok: true; readonly observationText: string }
  | { readonly ok: false; readonly reason: string };

/** Injectable sub-agent spawn hook (mocked in unit tests). */
export type PlanningDelegateSpawnFn = (
  frontierModel: Model<Api>,
  compressedContext: Context,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
) => Promise<PlanningDelegateSpawnResult>;

export function isPlanningDelegateActive(
  decision: RoutingDecision,
): decision is RoutingDecision & {
  features: { planning_delegate: PlanningDelegateObservability };
} {
  const observability = decision.features?.planning_delegate;
  return (
    decision.reason_code === PLANNING_DELEGATE &&
    observability?.path === 'delegate' &&
    observability.delegate_model_id !== null
  );
}

function isConversationalMessage(message: Message): boolean {
  return message.role === 'user' || message.role === 'assistant';
}

function isExecutionTraceMessage(message: Message): boolean {
  if (message.role === 'toolResult') {
    return true;
  }
  if (message.role !== 'assistant') {
    return false;
  }
  const blocks = message.content;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return false;
  }
  return blocks.every(
    (block) => block.type === 'toolCall' || block.type === 'thinking',
  );
}

function estimateContextTokens(context: Context): number {
  let charCount = 0;
  if (context.systemPrompt) {
    charCount += context.systemPrompt.length;
  }
  for (const message of context.messages) {
    if (typeof message.content === 'string') {
      charCount += message.content.length;
      continue;
    }
    for (const block of message.content) {
      if (block.type === 'text') {
        charCount += block.text.length;
      } else if (block.type === 'thinking') {
        charCount += block.thinking.length;
      } else if (block.type === 'toolCall') {
        charCount += JSON.stringify(block.arguments).length;
      }
    }
  }
  return Math.max(0, Math.ceil(charCount / 4));
}

/**
 * Build compressed context for the ephemeral frontier sub-call (SP-142 limits).
 * Excludes tool execution history when configured; caps message count and tokens.
 */
export function buildCompressedDelegateContext(
  context: Context,
  spec: CompressedContextSpec | null | undefined,
): Context {
  if (!spec) {
    return context;
  }

  let messages = context.messages.filter(isConversationalMessage);
  if (spec.exclude_execution_history) {
    messages = messages.filter((message) => !isExecutionTraceMessage(message));
  }

  if (messages.length > spec.max_messages) {
    messages = messages.slice(-spec.max_messages);
  }

  while (messages.length > 1 && estimateContextTokens({ ...context, messages }) > spec.max_tokens) {
    messages = messages.slice(1);
  }

  return {
    ...context,
    messages,
  };
}

export function extractAssistantText(message: AssistantMessage | undefined): string {
  if (!message) {
    return '';
  }
  return message.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/** Inject frontier sub-call output as a user observation for the primary model. */
export function injectPlanningDelegateObservation(
  context: Context,
  observationText: string,
): Context {
  const trimmed = observationText.trim();
  if (!trimmed) {
    return context;
  }

  const observationMessage: Message = {
    role: 'user',
    content: `${PLANNING_DELEGATE_OBSERVATION_PREFIX}\n${trimmed}`,
    timestamp: Date.now(),
  };

  return {
    ...context,
    messages: [...context.messages, observationMessage],
  };
}

/** Default frontier sub-call via provider stream (ephemeral one-shot delegate).
 *
 * SP-170: intentionally uses collectDelegatedStream (buffered), not live outer
 * piping. Only the final observation text is injected into the primary context;
 * intermediate frontier tokens must not reach the user-facing stream.
 */
export async function defaultSpawnPlanningDelegate(
  frontierModel: Model<Api>,
  compressedContext: Context,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
): Promise<PlanningDelegateSpawnResult> {
  try {
    const result = await collectDelegatedStream(
      frontierModel,
      compressedContext,
      deps,
      options,
    );
    if (result.failed || !result.finalMessage) {
      return {
        ok: false,
        reason:
          result.finalMessage?.errorMessage ??
          'planning delegate sub-call failed',
      };
    }

    const observationText = extractAssistantText(result.finalMessage);
    if (!observationText) {
      return {
        ok: false,
        reason: 'planning delegate sub-call returned empty response',
      };
    }

    return { ok: true, observationText };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface PlanningDelegateResolution {
  readonly context: Context;
  readonly decision: RoutingDecision;
  readonly targetModelId: string;
  readonly usedDelegatePath: boolean;
}

/** Worker telemetry analogs for one planning turn (SP-213, #120). */
interface DelegateWorkerTelemetry {
  readonly workers_spawned: number;
  readonly workers_succeeded: number;
  readonly worker_timeout_count: number;
}

/**
 * Race a delegate sub-call against a bounded timeout (SP-213, #120).
 *
 * On expiry the worker is signalled for cancellation (AbortSignal forwarded to
 * the sub-call options) and abandoned — the race resolves immediately so a
 * stalled worker can never hang TTFT. An outer caller abort is forwarded to
 * the worker as well. No retries and no queue: exactly one worker per call.
 */
async function spawnPlanningDelegateWithTimeout(
  spawnFn: PlanningDelegateSpawnFn,
  frontierModel: Model<Api>,
  compressedContext: Context,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
  timeoutMs: number,
): Promise<PlanningDelegateSpawnResult> {
  const controller = new AbortController();
  const outerSignal = options?.signal;
  const forwardOuterAbort = (): void => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) {
      controller.abort();
    } else {
      outerSignal.addEventListener('abort', forwardOuterAbort, { once: true });
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const spawnOptions: SimpleStreamOptions = {
      ...(options ?? {}),
      signal: controller.signal,
    };
    const spawnPromise = spawnFn(frontierModel, compressedContext, spawnOptions, deps);
    // Swallow late rejections from an abandoned worker so a timeout never
    // surfaces as an unhandled rejection after the fallback already routed.
    spawnPromise.catch(() => {});
    const timeoutPromise = new Promise<PlanningDelegateSpawnResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, reason: PLANNING_DELEGATE_TIMEOUT });
      }, timeoutMs);
    });
    return await Promise.race([spawnPromise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    outerSignal?.removeEventListener('abort', forwardOuterAbort);
  }
}

/**
 * Resolve planning delegate path: sub-call + observation injection, or direct frontier fallback.
 */
export async function resolvePlanningDelegatePath(
  context: Context,
  decision: RoutingDecision,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
): Promise<PlanningDelegateResolution> {
  // Abort before planning sub-call work (SP-171 phase boundary).
  throwIfAborted(options);

  const observability = decision.features!.planning_delegate!;
  const delegateModelId = observability.delegate_model_id!;
  const primaryModelId = decision.selected_model_id;
  const delegateConfig =
    deps.planningDelegateConfig ?? DEFAULT_PLANNING_DELEGATE_CONFIG;
  // Global stage deadline: bounds compression + sub-call wall-clock (SP-213, #120).
  const globalDeadlineMs = Date.now() + delegateConfig.global_timeout_ms;

  const frontierProfile = findFleetProfile(deps.fleet, delegateModelId);
  const frontierModel = frontierProfile
    ? resolveRegistryModel(deps.modelRegistry, frontierProfile)
    : undefined;

  if (!frontierModel) {
    console.warn(
      '[smart-router] planning delegate unavailable: frontier model missing from registry',
      delegateModelId,
    );
    return applyPlanningDelegateDirectFallback(
      context,
      decision,
      delegateModelId,
      PLANNING_DELEGATE_UNAVAILABLE,
      deps,
      { workers_spawned: 0, workers_succeeded: 0, worker_timeout_count: 0 },
    );
  }

  const compressedContext = buildCompressedDelegateContext(
    context,
    observability.compressed_context,
  );
  throwIfAborted(options);

  const remainingGlobalMs = globalDeadlineMs - Date.now();
  if (remainingGlobalMs <= 0) {
    console.warn(
      '[smart-router] planning delegate global timeout exhausted before sub-call, falling back to direct frontier route',
      delegateModelId,
    );
    return applyPlanningDelegateDirectFallback(
      context,
      decision,
      delegateModelId,
      PLANNING_DELEGATE_TIMEOUT,
      deps,
      { workers_spawned: 0, workers_succeeded: 0, worker_timeout_count: 1 },
    );
  }

  const spawnFn = deps.spawnPlanningDelegate ?? defaultSpawnPlanningDelegate;
  // Per-call cap, further bounded by the remaining global budget.
  const subCallTimeoutMs = Math.min(
    delegateConfig.sub_call_timeout_ms,
    remainingGlobalMs,
  );
  const spawnResult = await spawnPlanningDelegateWithTimeout(
    spawnFn,
    frontierModel,
    compressedContext,
    options,
    deps,
    subCallTimeoutMs,
  );

  if (!spawnResult.ok) {
    const timedOut = spawnResult.reason === PLANNING_DELEGATE_TIMEOUT;
    const fallbackReason = timedOut
      ? PLANNING_DELEGATE_TIMEOUT
      : PLANNING_DELEGATE_UNAVAILABLE;
    console.warn(
      timedOut
        ? '[smart-router] planning delegate sub-call timed out, falling back to direct frontier route'
        : '[smart-router] planning delegate sub-call failed, falling back to direct frontier route',
      spawnResult.reason,
    );
    return applyPlanningDelegateDirectFallback(
      context,
      decision,
      delegateModelId,
      fallbackReason,
      deps,
      {
        workers_spawned: 1,
        workers_succeeded: 0,
        worker_timeout_count: timedOut ? 1 : 0,
      },
    );
  }

  console.warn(
    '[smart-router] planning delegate sub-call completed',
    JSON.stringify({
      primary_model_id: primaryModelId,
      delegate_model_id: delegateModelId,
      observation_chars: spawnResult.observationText.length,
    }),
  );

  return {
    context: injectPlanningDelegateObservation(context, spawnResult.observationText),
    decision: enrichRoutingDecisionWithPlanningDelegate(decision, {
      ...observability,
      workers_spawned: 1,
      workers_succeeded: 1,
      worker_timeout_count: 0,
    }),
    targetModelId: primaryModelId,
    usedDelegatePath: true,
  };
}

function applyPlanningDelegateDirectFallback(
  context: Context,
  decision: RoutingDecision,
  delegateModelId: string,
  fallbackReason: string,
  deps: StreamDelegationDeps,
  workerTelemetry?: DelegateWorkerTelemetry,
): PlanningDelegateResolution {
  const profile = findFleetProfile(deps.fleet, delegateModelId);
  const fallbackDecision = enrichRoutingDecisionWithPlanningDelegate(
    {
      ...decision,
      selected_model_id: delegateModelId,
      tier: profile?.tier ?? decision.tier,
      reason_code: PLANNING_DIRECT_FRONTIER,
    },
    createPlanningDelegateObservability({
      path: 'direct',
      delegate_model_id: delegateModelId,
      planning_delegate_reason_code: PLANNING_DIRECT_FRONTIER,
      fallback_reason: fallbackReason,
      workers_spawned: workerTelemetry?.workers_spawned ?? null,
      workers_succeeded: workerTelemetry?.workers_succeeded ?? null,
      worker_timeout_count: workerTelemetry?.worker_timeout_count ?? null,
    }),
  );

  return {
    context,
    decision: fallbackDecision,
    targetModelId: delegateModelId,
    usedDelegatePath: false,
  };
}
