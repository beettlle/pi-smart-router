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

/**
 * Gemini returns 400 INVALID_ARGUMENT when tool-call replay omits thought_signature.
 * This is a client/protocol validation error, not provider unavailability (FR-018).
 */
export function isGeminiThoughtSignatureError(parsed: ParsedProviderError): boolean {
  return (
    parsed.statusCode === 400 &&
    parsed.message?.includes('thought_signature') === true
  );
}

export function isGeminiThoughtSignatureAssistantError(message: AssistantMessage): boolean {
  const parsed = parseAssistantMessageError(message);
  return parsed ? isGeminiThoughtSignatureError(parsed) : false;
}

const FORMATTED_ERROR_MAX_LENGTH = 200;

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

const GEMINI_THOUGHT_SIGNATURE_DOCS =
  'https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures';
const PI_THOUGHT_SIGNATURE_ISSUE = 'https://github.com/earendil-works/pi/issues/6342';

/**
 * Format a Gemini thought_signature validation error with operator workarounds.
 */
export function formatGeminiThoughtSignatureErrorMessage(errorMessage: string): string {
  const summary = formatProviderErrorMessage(errorMessage);
  return [
    summary,
    '',
    'Gemini rejected this request because a prior tool call is missing its thought_signature (protocol validation, not provider outage).',
    'Workarounds: start a fresh session with /new, or route to a non-Google model until pi preserves thought signatures in replay.',
    `Docs: ${GEMINI_THOUGHT_SIGNATURE_DOCS}`,
    `Upstream: ${PI_THOUGHT_SIGNATURE_ISSUE}`,
  ].join('\n');
}

