/**
 * Delegation context normalization — provider-agnostic replay identity fix.
 *
 * pi-ai transformMessages compares assistant message provider/api/model to the
 * target model. Virtual smart-router tags break isSameModel and strip replay
 * state (thoughtSignature, thinkingSignature, etc.).
 */

import type {
  Api,
  AssistantMessage,
  Context,
  Message,
  Model,
} from '@earendil-works/pi-ai/compat';

import type { ExecutionModel } from './execution-ledger.js';

export const VIRTUAL_ROUTER_PROVIDER = 'smart-router' as const;
export const VIRTUAL_ROUTER_MODEL_ID = 'auto' as const;

export function isVirtualRouterIdentity(provider: string, modelId: string): boolean {
  return provider === VIRTUAL_ROUTER_PROVIDER && modelId === VIRTUAL_ROUTER_MODEL_ID;
}

export function hasReplaySensitiveState(messages: readonly Message[]): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }

    for (const block of message.content) {
      if (block.type === 'thinking') {
        if (block.redacted) {
          return true;
        }
        if (block.thinkingSignature && block.thinkingSignature.length > 0) {
          return true;
        }
      }

      if (block.type === 'text' && block.textSignature && block.textSignature.length > 0) {
        return true;
      }

      if (
        block.type === 'toolCall' &&
        block.thoughtSignature &&
        block.thoughtSignature.length > 0
      ) {
        return true;
      }
    }
  }

  return false;
}

function rewriteAssistantIdentity(
  message: AssistantMessage,
  executionModel: ExecutionModel,
): AssistantMessage {
  return {
    ...message,
    provider: executionModel.provider as AssistantMessage['provider'],
    api: executionModel.api,
    model: executionModel.id,
  };
}

export interface NormalizeDelegationContextOptions {
  readonly virtualProvider?: typeof VIRTUAL_ROUTER_PROVIDER;
  readonly sessionExecution?: ExecutionModel | null;
}

/**
 * Rewrite assistant messages tagged with the virtual router to the executing
 * model identity pi-ai expects for same-model replay.
 */
export function normalizeDelegationContext<TApi extends Api>(
  context: Context,
  targetModel: Model<TApi>,
  options?: NormalizeDelegationContextOptions,
): Context {
  const virtualProvider = options?.virtualProvider ?? VIRTUAL_ROUTER_PROVIDER;
  const fallbackExecution: ExecutionModel = {
    provider: targetModel.provider,
    api: targetModel.api,
    id: targetModel.id,
  };
  const sessionExecution = options?.sessionExecution ?? null;
  const executionForVirtual = sessionExecution ?? fallbackExecution;

  const messages = context.messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }

    const assistant = message;
    if (
      assistant.provider === virtualProvider &&
      assistant.model === VIRTUAL_ROUTER_MODEL_ID
    ) {
      return rewriteAssistantIdentity(assistant, executionForVirtual);
    }

    return message;
  });

  return { ...context, messages };
}
