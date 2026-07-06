/**
 * Delegation helpers: auth merge, event flush/sanitize, failover notice injection, registry lookups.
 */

import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai/compat';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';

import { normalizeDelegationContext } from '../../../src/domain/delegation/delegation-context.js';
import type { ModelProfile } from '../../../src/domain/types/index.js';
import {
  formatGeminiThoughtSignatureErrorMessage,
  formatProviderErrorMessage,
  isGeminiThoughtSignatureAssistantError,
  parseAssistantMessageError,
} from '../../../src/infrastructure/delegation/provider-error.js';
import type { StreamDelegationDeps } from './types.js';

/** Stream options safe to forward to a delegated provider call. */
const DELEGATION_CALLER_OPTION_KEYS = [
  'signal',
  'sessionId',
  'reasoning',
  'thinkingBudgets',
  'temperature',
  'maxTokens',
  'transport',
  'cacheRetention',
  'timeoutMs',
  'maxRetries',
  'maxRetryDelayMs',
  'metadata',
  'websocketConnectTimeoutMs',
] as const satisfies readonly (keyof SimpleStreamOptions)[];

function pickDelegationCallerOptions(
  callerOptions?: SimpleStreamOptions,
): SimpleStreamOptions {
  if (!callerOptions) {
    return {};
  }

  const picked: SimpleStreamOptions = {};
  const source = callerOptions as SimpleStreamOptions & Record<string, unknown>;
  for (const key of DELEGATION_CALLER_OPTION_KEYS) {
    if (source[key] !== undefined) {
      (picked as Record<string, unknown>)[key] = source[key];
    }
  }
  return picked;
}

export async function resolveDelegationOptions(
  modelRegistry: ModelRegistry,
  targetModel: Model<Api>,
  callerOptions?: SimpleStreamOptions,
): Promise<SimpleStreamOptions> {
  const auth = await modelRegistry.getApiKeyAndHeaders(targetModel);
  if (!auth.ok) {
    throw new Error(auth.error);
  }

  const callerEnv = callerOptions?.env;
  const mergedEnv =
    auth.env || callerEnv
      ? { ...(auth.env ?? {}), ...(callerEnv ?? {}) }
      : undefined;

  return {
    ...pickDelegationCallerOptions(callerOptions),
    ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
    ...(auth.headers !== undefined ? { headers: auth.headers } : {}),
    ...(mergedEnv !== undefined ? { env: mergedEnv } : {}),
  };
}

export interface DelegatedStreamResult {
  readonly finalMessage: AssistantMessage | undefined;
  readonly failed: boolean;
  readonly events: AssistantMessageEvent[];
}

export function modelToExecutionModel(model: Model<Api>) {
  return {
    provider: model.provider,
    api: model.api,
    id: model.id,
  };
}

export function buildDelegationContext(
  context: Context,
  targetModel: Model<Api>,
  deps: StreamDelegationDeps,
  sessionId: string | undefined,
): Context {
  const sessionExecution = sessionId
    ? deps.executionLedger.getLastExecution(sessionId)
    : null;

  return normalizeDelegationContext(context, targetModel, {
    sessionExecution,
  });
}

export function createErrorMessage(
  model: Model<Api>,
  options: SimpleStreamOptions | undefined,
  error: unknown,
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
    stopReason: options?.signal?.aborted ? 'aborted' : 'error',
    errorMessage: formatProviderErrorMessage(
      error instanceof Error ? error.message : String(error),
    ),
    timestamp: Date.now(),
  };
}

function sanitizeAssistantErrorMessage(message: AssistantMessage): AssistantMessage {
  if (message.stopReason !== 'error' || !message.errorMessage) {
    return message;
  }
  const formatted = isGeminiThoughtSignatureAssistantError(message)
    ? formatGeminiThoughtSignatureErrorMessage(message.errorMessage)
    : formatProviderErrorMessage(message.errorMessage);
  if (formatted === message.errorMessage) {
    return message;
  }
  return { ...message, errorMessage: formatted };
}

function sanitizeDelegatedErrorEvents(events: AssistantMessageEvent[]): void {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) {
      continue;
    }
    if (event.type === 'error') {
      events[i] = { ...event, error: sanitizeAssistantErrorMessage(event.error) };
    } else if (event.type === 'done' && event.message.stopReason === 'error') {
      events[i] = {
        ...event,
        message: sanitizeAssistantErrorMessage(event.message),
      };
    }
  }
}

export function flushDelegatedEvents(
  outer: AssistantMessageEventStream,
  events: readonly AssistantMessageEvent[],
  options?: { sanitizeErrors?: boolean },
): void {
  const mutableEvents = options?.sanitizeErrors ? [...events] : events;
  if (options?.sanitizeErrors) {
    sanitizeDelegatedErrorEvents(mutableEvents as AssistantMessageEvent[]);
  }
  for (const event of mutableEvents) {
    outer.push(event);
  }
  outer.end();
}

export function injectFailoverNotice(
  events: AssistantMessageEvent[],
  failedModelId: string,
  alternateModelId: string,
  errorObj?: ReturnType<typeof parseAssistantMessageError>,
): void {
  const reason = errorObj?.message || errorObj?.code || 'Unavailable';
  const notice = `> ⚠️ **pi-smart-router failover:** \`${failedModelId}\` failed (${reason}). Retrying with \`${alternateModelId}\`...`;

  let noticeInjected = false;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) {
      continue;
    }

    if (event.type === 'start') {
      const newPartial = { ...event.partial, content: [...event.partial.content] };
      const firstBlock = newPartial.content[0];
      if (firstBlock && firstBlock.type === 'text') {
        newPartial.content[0] = { ...firstBlock, text: notice + '\n\n' + firstBlock.text };
      } else {
        newPartial.content.unshift({ type: 'text', text: notice + '\n\n' });
      }
      events[i] = { ...event, partial: newPartial };
    }

    if (!noticeInjected && event.type === 'text_delta') {
      events[i] = { ...event, delta: notice + '\n\n' + event.delta };
      noticeInjected = true;
    }

    if (event.type === 'done' && event.message) {
      const newMsg = { ...event.message, content: [...event.message.content] };
      const firstBlock = newMsg.content[0];
      if (firstBlock && firstBlock.type === 'text') {
        newMsg.content[0] = { ...firstBlock, text: notice + '\n\n' + firstBlock.text };
      } else {
        newMsg.content.unshift({ type: 'text', text: notice + '\n\n' });
      }
      events[i] = { ...event, message: newMsg };
    }
  }

  if (!noticeInjected) {
    const startIdx = events.findIndex((e) => e.type === 'start');
    const startEvent = startIdx === -1 ? undefined : events[startIdx];
    if (startEvent?.type === 'start') {
      events.splice(startIdx + 1, 0, {
        type: 'text_delta',
        contentIndex: 0,
        delta: notice + '\n\n',
        partial: startEvent.partial,
      });
    }
  }
}

export function findFleetProfile(
  fleet: readonly ModelProfile[],
  modelId: string,
): ModelProfile | undefined {
  return fleet.find((profile) => profile.id === modelId);
}

export function resolveRegistryModel(
  modelRegistry: ModelRegistry,
  profile: ModelProfile,
): Model<Api> | undefined {
  return modelRegistry.find(profile.provider, profile.id);
}
