import { randomUUID } from 'node:crypto';

import {
  type Context,
  type Message,
  type SimpleStreamOptions,
  type TextContent,
} from '@earendil-works/pi-ai/compat';

import type {
  Message as RoutingMessage,
  RoutingRequest,
  TurnType,
} from '../../../src/domain/types/index.js';
import { LifecycleHookState } from '../../../src/index.js';

const TOKEN_ESTIMATE_KEYS = [
  'estimatedInputTokens',
  'estimated_input_tokens',
  'contextTokens',
  'tokenCount',
  'tokens',
] as const;

function readOptionalTokenEstimate(source: unknown): number | undefined {
  if (source === null || typeof source !== 'object') {
    return undefined;
  }

  const record = source as Record<string, unknown>;
  for (const key of TOKEN_ESTIMATE_KEYS) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }

  return undefined;
}

function estimateInputTokens(
  context: Context,
  options?: SimpleStreamOptions,
): number {
  const fromOptions = readOptionalTokenEstimate(options);
  if (fromOptions !== undefined) {
    return fromOptions;
  }

  const fromContext = readOptionalTokenEstimate(context);
  if (fromContext !== undefined) {
    return fromContext;
  }

  const mapped = mapContextMessages(context.messages);
  let charCount = mapped.reduce((sum, message) => sum + message.content.length, 0);
  if (context.systemPrompt) {
    charCount += context.systemPrompt.length;
  }

  if (context.messages.length === 0 && !context.systemPrompt) {
    return 0;
  }

  return Math.max(1, Math.ceil(charCount / 4));
}

function messageContentToString(content: string | readonly (TextContent | { type: string })[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export function extractPromptText(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === 'user') {
      const text = messageContentToString(message.content);
      if (text.trim()) {
        return text;
      }
    }
  }
  return '';
}

export function deriveTurnType(messages: readonly Message[]): TurnType {
  if (messages.length === 0) {
    return 'unknown';
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return 'unknown';
  }

  if (lastMessage.role === 'toolResult') {
    return 'tool_result';
  }

  if (lastMessage.role === 'user') {
    const text = messageContentToString(lastMessage.content).toLowerCase();
    if (
      text.includes('plan') ||
      text.includes('architect') ||
      text.includes('design')
    ) {
      return 'planning';
    }
  }

  return 'main_loop';
}

export function mapContextMessages(messages: readonly Message[]): RoutingMessage[] {
  return messages.map((message) => {
    if (message.role === 'user') {
      return {
        role: message.role,
        content: messageContentToString(message.content),
      };
    }

    if (message.role === 'assistant') {
      const content = message.content
        .map((block) => {
          if (block.type === 'text') {
            return block.text;
          }
          if (block.type === 'thinking') {
            return block.thinking;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');

      return { role: message.role, content };
    }

    return {
      role: 'tool',
      content: messageContentToString(message.content),
      tool_blocks: [],
    };
  });
}

export function buildRoutingRequest(
  context: Context,
  options: SimpleStreamOptions | undefined,
  lifecycleHookState?: LifecycleHookState,
): RoutingRequest {
  const sessionId = options?.sessionId ?? randomUUID();
  const lifecycleFlags = lifecycleHookState?.consume(sessionId) ?? {};

  return {
    request_id: randomUUID(),
    session_id: sessionId,
    prompt_text: extractPromptText(context.messages),
    messages: mapContextMessages(context.messages),
    turn_type: deriveTurnType(context.messages),
    estimated_input_tokens: estimateInputTokens(context, options),
    ...lifecycleFlags,
  };
}
