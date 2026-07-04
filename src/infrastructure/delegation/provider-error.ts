/**
 * Parse provider error payloads from pi-ai assistant errorMessage strings.
 */

import type { AssistantMessage } from '@earendil-works/pi-ai/compat';

import { isInfraError } from '../gateway/circuit-breaker.js';

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
      } catch {}
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
