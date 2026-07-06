/**
 * Gemini provider error classification and failover policy.
 *
 * thought_signature 400s are client/protocol validation errors (FR-018),
 * not infrastructure outages — they must return terminal errors, not trigger
 * stream delegation failover.
 */

import type { AssistantMessage } from '@earendil-works/pi-ai/compat';

export interface GeminiProviderError {
  readonly statusCode?: number;
  readonly code?: string;
  readonly message?: string;
}

/**
 * Gemini returns 400 INVALID_ARGUMENT when tool-call replay omits thought_signature.
 */
export function isGeminiThoughtSignatureError(parsed: GeminiProviderError): boolean {
  return (
    parsed.statusCode === 400 &&
    parsed.message?.includes('thought_signature') === true
  );
}

export function isGeminiThoughtSignatureAssistantError(message: AssistantMessage): boolean {
  if (message.stopReason !== 'error' || !message.errorMessage) {
    return false;
  }
  return isGeminiThoughtSignatureError(parseGeminiErrorBlob(message.errorMessage));
}

/**
 * Returns true when a Gemini provider error should trigger failover.
 * thought_signature validation failures are terminal — never failover.
 */
export function shouldFailoverOnGeminiError(parsed: GeminiProviderError): boolean {
  if (isGeminiThoughtSignatureError(parsed)) {
    return false;
  }
  return parsed.statusCode !== undefined && (parsed.statusCode >= 500 || parsed.statusCode === 429);
}

const GEMINI_THOUGHT_SIGNATURE_DOCS =
  'https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures';
const PI_THOUGHT_SIGNATURE_ISSUE = 'https://github.com/earendil-works/pi/issues/6342';

/**
 * Format a Gemini thought_signature validation error with operator workarounds.
 */
export function formatGeminiThoughtSignatureErrorMessage(errorMessage: string): string {
  const parsed = parseGeminiErrorBlob(errorMessage);
  const prefixParts: string[] = [];
  if (parsed.statusCode !== undefined) {
    prefixParts.push(String(parsed.statusCode));
  }
  if (parsed.code) {
    prefixParts.push(parsed.code);
  }
  const summary =
    parsed.message && prefixParts.length > 0
      ? `${prefixParts.join(' ')}: ${parsed.message}`
      : parsed.message ?? 'Provider error (thought_signature validation)';

  return [
    summary,
    '',
    'Gemini rejected this request because a prior tool call is missing its thought_signature (protocol validation, not provider outage).',
    'Workarounds: start a fresh session with /new, or route to a non-Google model until pi preserves thought signatures in replay.',
    `Docs: ${GEMINI_THOUGHT_SIGNATURE_DOCS}`,
    `Upstream: ${PI_THOUGHT_SIGNATURE_ISSUE}`,
  ].join('\n');
}

function parseGeminiErrorBlob(errorMessage: string): GeminiProviderError {
  const trimmed = errorMessage.trim();
  if (!trimmed.startsWith('{')) {
    return trimmed.includes('thought_signature') ? { statusCode: 400, message: trimmed } : {};
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

    if (message?.trim().startsWith('{')) {
      try {
        const inner = JSON.parse(message) as { error?: { message?: unknown }; message?: unknown };
        if (typeof inner.error?.message === 'string') {
          message = inner.error.message;
        } else if (typeof inner.message === 'string') {
          message = inner.message;
        }
      } catch {
        // keep outer message
      }
    }

    return {
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(code ? { code } : {}),
      ...(message ? { message } : {}),
    };
  } catch {
    return {};
  }
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
