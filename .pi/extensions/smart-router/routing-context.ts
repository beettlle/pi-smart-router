import { randomUUID } from 'node:crypto';

import {
  type Context,
  type Message,
  type SimpleStreamOptions,
  type TextContent,
} from '@earendil-works/pi-ai/compat';

import {
  LifecycleHookState,
} from '../../../src/index.js';
import type {
  Message as RoutingMessage,
  RoutingRequest,
  TurnType,
} from '../../../src/index.js';

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

/**
 * SP-225 / #137: read an HTTP-ish status a host may attach to a tool result
 * (either directly on the message or inside `details`). Returns undefined
 * when no finite numeric status is present.
 */
function readOptionalStatus(source: unknown): number | undefined {
  if (source === null || typeof source !== 'object') {
    return undefined;
  }
  const record = source as Record<string, unknown>;
  const direct = record.status;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct >= 0) {
    return Math.floor(direct);
  }
  return readOptionalStatus(record.details);
}

export interface MapContextMessagesOptions {
  /**
   * Opt-in: include assistant `thinking` blocks in routing `content`.
   * Default false — thinking is model-internal reasoning, not a routing
   * signal, and leaking it inflates token estimates (#137).
   */
  includeThinking?: boolean;
}

/** Operator env gate restoring the pre-SP-225 thinking-in-content behavior. */
const INCLUDE_THINKING_ENV = 'SMART_ROUTER_INCLUDE_THINKING';

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

export function mapContextMessages(
  messages: readonly Message[],
  options?: MapContextMessagesOptions,
): RoutingMessage[] {
  const includeThinking = options?.includeThinking === true;
  return messages.map((message) => {
    if (message.role === 'user') {
      return {
        role: message.role,
        content: messageContentToString(message.content),
      };
    }

    if (message.role === 'assistant') {
      const contentParts: string[] = [];
      const toolBlocks: Record<string, unknown>[] = [];
      for (const block of message.content) {
        if (block.type === 'text') {
          contentParts.push(block.text);
        } else if (block.type === 'thinking') {
          if (includeThinking) {
            contentParts.push(block.thinking);
          }
        } else if (block.type === 'toolCall') {
          toolBlocks.push({
            type: 'tool_call',
            tool_call_id: block.id,
            tool_name: block.name,
          });
        }
      }

      const mapped: RoutingMessage = {
        role: message.role,
        content: contentParts.filter(Boolean).join('\n'),
      };
      if (toolBlocks.length > 0) {
        return { ...mapped, tool_blocks: toolBlocks };
      }
      return mapped;
    }

    const status = readOptionalStatus(message);
    // When a host attaches an HTTP-ish status, let the domain status>=400 rule
    // arbitrate (#137): a bare isError=false would otherwise mask the
    // structured signal. Without a status, preserve the host isError verbatim.
    const isError = message.isError === true || status === undefined
      ? message.isError
      : undefined;
    return {
      role: 'tool',
      content: messageContentToString(message.content),
      tool_blocks: [
        {
          type: 'tool_result',
          tool_call_id: message.toolCallId,
          tool_name: message.toolName,
        },
      ],
      ...(isError !== undefined ? { is_error: isError } : {}),
      ...(status !== undefined ? { status } : {}),
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
    messages: mapContextMessages(context.messages, {
      includeThinking: process.env[INCLUDE_THINKING_ENV] === '1',
    }),
    turn_type: deriveTurnType(context.messages),
    estimated_input_tokens: estimateInputTokens(context, options),
    ...lifecycleFlags,
  };
}
