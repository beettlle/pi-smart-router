/**
 * Cache-preserving planning delegate (SP-144, #71).
 *
 * When the pipeline emits `planning_delegate`, run an ephemeral frontier sub-call
 * on compressed context, inject the result as an observation, and keep primary
 * inference on the pinned economical model. Falls back to direct frontier routing
 * when sub-agent spawn is unavailable (pi has no native sub-agent API yet).
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
import {
  createPlanningDelegateObservability,
  enrichRoutingDecisionWithPlanningDelegate,
  PLANNING_DELEGATE,
  PLANNING_DELEGATE_UNAVAILABLE,
  PLANNING_DIRECT_FRONTIER,
} from '../../../src/infrastructure/telemetry/routing-telemetry.js';
import { collectDelegatedStream } from './delegate-stream.js';
import { findFleetProfile, resolveRegistryModel } from './delegation-runtime.js';
import type { StreamDelegationDeps } from './types.js';

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

/** Default frontier sub-call via provider stream (ephemeral one-shot delegate). */
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

/**
 * Resolve planning delegate path: sub-call + observation injection, or direct frontier fallback.
 */
export async function resolvePlanningDelegatePath(
  context: Context,
  decision: RoutingDecision,
  options: SimpleStreamOptions | undefined,
  deps: StreamDelegationDeps,
): Promise<PlanningDelegateResolution> {
  const observability = decision.features!.planning_delegate!;
  const delegateModelId = observability.delegate_model_id!;
  const primaryModelId = decision.selected_model_id;

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
    );
  }

  const compressedContext = buildCompressedDelegateContext(
    context,
    observability.compressed_context,
  );
  const spawnFn = deps.spawnPlanningDelegate ?? defaultSpawnPlanningDelegate;
  const spawnResult = await spawnFn(frontierModel, compressedContext, options, deps);

  if (!spawnResult.ok) {
    console.warn(
      '[smart-router] planning delegate sub-call failed, falling back to direct frontier route',
      spawnResult.reason,
    );
    return applyPlanningDelegateDirectFallback(
      context,
      decision,
      delegateModelId,
      PLANNING_DELEGATE_UNAVAILABLE,
      deps,
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
    decision,
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
    }),
  );

  return {
    context,
    decision: fallbackDecision,
    targetModelId: delegateModelId,
    usedDelegatePath: false,
  };
}
