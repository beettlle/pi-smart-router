/**
 * Delegation context normalization — provider-agnostic replay identity fix.
 *
 * pi-ai transformMessages compares assistant message provider/api/model to the
 * target model. Foreign identities (virtual smart-router tags or any prior
 * provider such as OpenAI/Anthropic/GLM) break isSameModel and strip replay
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

const CURSOR_PROVIDER = 'cursor' as const;

/**
 * Env gate for the Cursor lifecycle strip (SP-300, #180). Default on;
 * `SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0` disables the sanitizer.
 */
export const STRIP_CURSOR_LIFECYCLE_ENV = 'SMART_ROUTER_STRIP_CURSOR_LIFECYCLE' as const;

/** Whether the delegation target is a Cursor model (cursor/auto, composer-*). */
export function isCursorDelegationTarget<TApi extends Api>(model: Model<TApi>): boolean {
  return model.provider.trim().toLowerCase() === CURSOR_PROVIDER;
}

/**
 * Whether an assistant message was produced by the Cursor provider (e.g.
 * `cursor/auto`). Cursor-origin thinking blocks carry pi-cursor-sdk lifecycle
 * progress lines (`Cursor shell: …`, `Cursor MCP: …`) rather than model
 * reasoning — replaying them cross-provider teaches the target to imitate
 * shell commands as prose (issue #180).
 */
export function isCursorOriginAssistantMessage(message: AssistantMessage): boolean {
  return message.provider.trim().toLowerCase() === CURSOR_PROVIDER;
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

function repairAssistantForGoogleReplay(
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
 * Repair Gemini tool-call replay for Google delegation targets.
 *
 * Call after {@link normalizeDelegationContext}. Aligns assistant identity to
 * the delegation target and injects the thought-signature sentinel on every
 * unsigned tool call, regardless of which provider produced the prior turn
 * (Google, OpenAI, Anthropic, GLM, …). Captured signatures are preserved.
 *
 * Cross-provider repair (SP-231, #158): pi-ai strips replay state from any
 * assistant message whose identity fails isSameModel, so a Gemini target
 * would receive unsigned tool calls from non-Google turns and the Google API
 * would reject the replay with a thought_signature error.
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

    return repairAssistantForGoogleReplay(message, targetExecution);
  });

  return { ...context, messages };
}

export interface StripCursorLifecycleOptions {
  /** Env override for tests; defaults to `process.env`. */
  readonly env?: Record<string, string | undefined>;
}

export interface CursorLifecycleStripResult {
  readonly context: Context;
  /** Thinking blocks removed from Cursor-origin assistant messages. */
  readonly strippedThinkingBlocks: number;
  /** Total characters of removed thinking text (observability for #180). */
  readonly strippedThinkingChars: number;
  /** Assistant messages dropped because they held only lifecycle thinking. */
  readonly droppedMessages: number;
}

/**
 * SP-300 (#180): drop Cursor lifecycle thinking from Cursor-origin assistant
 * messages before delegating to a non-Cursor target.
 *
 * The third-party pi-cursor-sdk provider emits tool progress as thinking lines
 * (`Cursor shell: …`). pi-ai's transformMessages converts foreign thinking
 * blocks to plain text when the provider/model differs, so a Cursor-origin
 * history handed to GLM/Gemini replays those progress lines as assistant
 * prose — the target then imitates shell commands as text instead of emitting
 * real toolCalls (2026-10-01 glm-5.3-flash runaway).
 *
 * Scope guardrails:
 * - Cursor targets are returned unchanged (Cursor→Cursor replay is native).
 * - Non-Cursor thinking (Gemini, Anthropic, …) is never touched.
 * - Text, toolCall, and other blocks are preserved; a message is only dropped
 *   when it held nothing but lifecycle thinking.
 * - Disabled via `SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0`.
 *
 * Call after {@link normalizeDelegationContext} so virtual-tagged messages
 * already resolved to a Cursor session execution are caught as Cursor-origin.
 */
export function stripCursorLifecycleThinking<TApi extends Api>(
  context: Context,
  targetModel: Model<TApi>,
  options?: StripCursorLifecycleOptions,
): CursorLifecycleStripResult {
  const unchanged: CursorLifecycleStripResult = {
    context,
    strippedThinkingBlocks: 0,
    strippedThinkingChars: 0,
    droppedMessages: 0,
  };

  const env = options?.env ?? process.env;
  if (env[STRIP_CURSOR_LIFECYCLE_ENV] === '0') {
    return unchanged;
  }

  if (isCursorDelegationTarget(targetModel)) {
    return unchanged;
  }

  let strippedThinkingBlocks = 0;
  let strippedThinkingChars = 0;
  let droppedMessages = 0;
  let changed = false;

  const messages: Message[] = [];
  for (const message of context.messages) {
    if (message.role !== 'assistant' || !isCursorOriginAssistantMessage(message)) {
      messages.push(message);
      continue;
    }

    const kept: typeof message.content = [];
    for (const block of message.content) {
      if (block.type === 'thinking') {
        strippedThinkingBlocks += 1;
        strippedThinkingChars += block.thinking.length;
        changed = true;
        continue;
      }
      kept.push(block);
    }

    if (kept.length === message.content.length) {
      messages.push(message);
      continue;
    }

    if (kept.length === 0) {
      droppedMessages += 1;
      continue;
    }

    messages.push({ ...message, content: kept });
  }

  if (!changed) {
    return unchanged;
  }

  return {
    context: { ...context, messages },
    strippedThinkingBlocks,
    strippedThinkingChars,
    droppedMessages,
  };
}
