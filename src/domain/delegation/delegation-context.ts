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

/**
 * Google Gemini bypass sentinel for tool-call replay when no signature was captured.
 *
 * Semantic value (Google API / pi#1829): `skip_thought_signature_validator`.
 * Wire format (@earendil-works/pi-ai@0.80.3 google-shared): TYPE_BYTES — base64
 * only. Plain string fails `isValidThoughtSignature`, so pi-ai strips it before
 * the request leaves the client. We store/send the base64 encoding of the literal
 * sentinel string so both Google validation and pi-ai serialization accept it.
 *
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures
 */
export const GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL =
  'c2tpcF90aG91Z2h0X3NpZ25hdHVyZV92YWxpZGF0b3I=' as const;

const GOOGLE_DELEGATION_APIS = new Set<Api>(['google-generative-ai', 'google-vertex']);

const GOOGLE_ORIGIN_PROVIDER_ALIASES = new Set([
  'google',
  'google-gemini',
  'google-generative-ai',
  'gemini',
]);

export function isVirtualRouterIdentity(provider: string, modelId: string): boolean {
  return provider === VIRTUAL_ROUTER_PROVIDER && modelId === VIRTUAL_ROUTER_MODEL_ID;
}

export function isGoogleDelegationTarget<TApi extends Api>(model: Model<TApi>): boolean {
  if (!GOOGLE_DELEGATION_APIS.has(model.api)) {
    return false;
  }

  const provider = model.provider.trim().toLowerCase();
  if (GOOGLE_ORIGIN_PROVIDER_ALIASES.has(provider)) {
    return true;
  }

  if (provider.includes('google') || provider.includes('gemini')) {
    return true;
  }

  return provider === 'cursor' && /gemini/i.test(model.id);
}

export function isGoogleOriginAssistantMessage(message: AssistantMessage): boolean {
  if (isVirtualRouterIdentity(message.provider, message.model)) {
    return true;
  }

  if (GOOGLE_DELEGATION_APIS.has(message.api)) {
    return true;
  }

  const provider = message.provider.trim().toLowerCase();
  if (GOOGLE_ORIGIN_PROVIDER_ALIASES.has(provider)) {
    return true;
  }

  if (provider.includes('google') || provider.includes('gemini')) {
    return true;
  }

  return provider === 'cursor' && /gemini/i.test(message.model);
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

function repairGoogleOriginAssistantMessage(
  message: AssistantMessage,
  targetExecution: ExecutionModel,
): AssistantMessage {
  const content = message.content.map((block) => {
    if (block.type !== 'toolCall') {
      return block;
    }

    if (block.thoughtSignature && block.thoughtSignature.length > 0) {
      return block;
    }

    return {
      ...block,
      thoughtSignature: GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL,
    };
  });

  return rewriteAssistantIdentity({ ...message, content }, targetExecution);
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

/**
 * Repair Gemini tool-call replay for cross-model Google delegation.
 *
 * Call after {@link normalizeDelegationContext}. Aligns Google-origin assistant
 * identity to the delegation target and injects the thought-signature sentinel
 * when tool calls lack a captured signature.
 */
export function repairGeminiReplayContext<TApi extends Api>(
  context: Context,
  targetModel: Model<TApi>,
  sessionExecution?: ExecutionModel | null,
): Context {
  // Accepted for SP-128 call-site symmetry with normalizeDelegationContext; identity
  // always aligns to the delegation target so pi-ai isSameModel matches targetModel.
  void sessionExecution;

  if (!isGoogleDelegationTarget(targetModel)) {
    return context;
  }

  const targetExecution: ExecutionModel = {
    provider: targetModel.provider,
    api: targetModel.api,
    id: targetModel.id,
  };

  const messages = context.messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }

    if (!isGoogleOriginAssistantMessage(message)) {
      return message;
    }

    return repairGoogleOriginAssistantMessage(message, targetExecution);
  });

  return { ...context, messages };
}
