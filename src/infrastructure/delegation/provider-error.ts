/**
 * Parse provider error payloads from pi-ai assistant errorMessage strings.
 */

import type { AssistantMessage } from '@earendil-works/pi-ai/compat';
import { isContextOverflow } from '@earendil-works/pi-ai';

import {
  formatGeminiThoughtSignatureErrorMessage,
  isGeminiThoughtSignatureAssistantError,
  isGeminiThoughtSignatureError,
} from '../../infra/gemini-provider.js';
import { isInfraError } from '../gateway/circuit-breaker.js';

export {
  formatGeminiThoughtSignatureErrorMessage,
  isGeminiThoughtSignatureAssistantError,
  isGeminiThoughtSignatureError,
};

export interface ParsedProviderError {
  readonly statusCode?: number;
  readonly code?: string;
  readonly message?: string;
}

function parseNumericCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

/**
 * Extract HTTP status / error code from JSON provider error blobs.
 */
export function parseProviderError(errorMessage: string): ParsedProviderError | undefined {
  const trimmed = errorMessage.trim();
  if (!trimmed.startsWith('{')) {
    const statusMatch = trimmed.match(/\b(429|5\d{2})\b/);
    if (statusMatch) {
      return { statusCode: Number.parseInt(statusMatch[1]!, 10) };
    }
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { code?: unknown; status?: unknown; message?: unknown };
      code?: unknown;
      status?: unknown;
      message?: unknown;
    };

    const nested = parsed.error;
    const statusCode =
      parseNumericCode(nested?.code) ??
      parseNumericCode(nested?.status) ??
      parseNumericCode(parsed.code) ??
      parseNumericCode(parsed.status);

    const code =
      typeof nested?.status === 'string'
        ? nested.status
        : typeof parsed.status === 'string'
          ? parsed.status
          : undefined;

    let message =
      typeof nested?.message === 'string'
        ? nested.message
        : typeof parsed.message === 'string'
          ? parsed.message
          : undefined;

    if (message && message.trim().startsWith('{')) {
      try {
        const inner = JSON.parse(message) as { error?: { message?: unknown }; message?: unknown };
        if (typeof inner.error?.message === 'string') {
          message = inner.error.message;
        } else if (typeof inner.message === 'string') {
          message = inner.message;
        }
      } catch {
        // Nested provider error payloads may be malformed JSON — keep outer message.
      }
    }

    if (statusCode === undefined && code === undefined && message === undefined) {
      return undefined;
    }

    return {
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(code ? { code } : {}),
      ...(message ? { message } : {}),
    };
  } catch {
    return undefined;
  }
}

export function parseAssistantMessageError(
  message: AssistantMessage,
): ParsedProviderError | undefined {
  if (message.stopReason !== 'error' || !message.errorMessage) {
    return undefined;
  }
  return parseProviderError(message.errorMessage);
}

export function isInfraAssistantError(message: AssistantMessage): boolean {
  const parsed = parseAssistantMessageError(message);
  if (!parsed) {
    return false;
  }
  return isInfraError(parsed);
}

const FORMATTED_ERROR_MAX_LENGTH = 200;

/** Output tokens at or below this count are treated as no usable generation. */
export const NEGLIGIBLE_OUTPUT_TOKEN_MAX = 4;

/** Input ratio of context window that signals context pressure on length stops. */
export const LENGTH_STOP_CONTEXT_PRESSURE_RATIO = 0.99;

export type LengthStopKind = 'context_pressure' | 'output_truncation';

export interface LengthStopHints {
  readonly contextWindow?: number;
}

export function isNegligibleOutputTokens(outputTokens: number): boolean {
  return outputTokens <= NEGLIGIBLE_OUTPUT_TOKEN_MAX;
}

function inputTokensUsed(message: AssistantMessage): number {
  return message.usage.input + message.usage.cacheRead;
}

/**
 * Classify a `stopReason: length` assistant message as context pressure vs output truncation.
 */
export function classifyLengthStop(
  message: AssistantMessage,
  hints?: LengthStopHints,
): LengthStopKind | undefined {
  if (message.stopReason !== 'length') {
    return undefined;
  }

  if (!isNegligibleOutputTokens(message.usage.output)) {
    return 'output_truncation';
  }

  const contextWindow = hints?.contextWindow;
  if (contextWindow !== undefined) {
    if (isContextOverflow(message, contextWindow)) {
      return 'context_pressure';
    }

    const inputTokens = inputTokensUsed(message);
    if (inputTokens >= contextWindow * LENGTH_STOP_CONTEXT_PRESSURE_RATIO) {
      return 'context_pressure';
    }
  }

  return 'output_truncation';
}

/**
 * User-facing text for length stops — distinct wording for context pressure vs truncation.
 */
export function formatLengthStopMessage(
  message: AssistantMessage,
  hints?: LengthStopHints,
): string {
  const kind = classifyLengthStop(message, hints);
  if (kind === 'context_pressure') {
    const inputTokens = inputTokensUsed(message);
    const limitSuffix =
      hints?.contextWindow !== undefined
        ? ` (context limit: ${hints.contextWindow.toLocaleString()} tokens)`
        : '';
    return (
      `Context window exceeded: ${inputTokens.toLocaleString()} input tokens used${limitSuffix}, ` +
      'leaving no room for output. Try compacting history or switching to a larger-context model.'
    );
  }

  return (
    'Model stopped because it reached the maximum output token limit. ' +
    'The response may be incomplete.'
  );
}

/**
 * Rewrite context-pressure length stops as errors so pi surfaces the overflow message.
 */
export function sanitizeLengthStopMessage(
  message: AssistantMessage,
  hints?: LengthStopHints,
): AssistantMessage {
  if (classifyLengthStop(message, hints) !== 'context_pressure') {
    return message;
  }

  return {
    ...message,
    stopReason: 'error',
    errorMessage: formatLengthStopMessage(message, hints),
  };
}

/**
 * Format a provider error blob for user-facing display (terminal/session).
 * Never returns raw nested JSON.
 */
export function formatProviderErrorMessage(errorMessage: string): string {
  const parsed = parseProviderError(errorMessage);
  if (parsed) {
    const prefixParts: string[] = [];
    if (parsed.statusCode !== undefined) {
      prefixParts.push(String(parsed.statusCode));
    }
    if (parsed.code) {
      prefixParts.push(parsed.code);
    }
    const prefix = prefixParts.length > 0 ? `${prefixParts.join(' ')}: ` : '';
    if (parsed.message) {
      return `${prefix}${parsed.message}`;
    }
    if (prefixParts.length > 0) {
      return `Provider error (${prefixParts.join(' ')})`;
    }
  }

  const trimmed = errorMessage.trim();
  if (trimmed.startsWith('{')) {
    return 'Provider error (unparseable response)';
  }
  if (trimmed.length > FORMATTED_ERROR_MAX_LENGTH) {
    return `${trimmed.slice(0, FORMATTED_ERROR_MAX_LENGTH)}…`;
  }
  return trimmed;
}

