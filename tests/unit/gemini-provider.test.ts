import type { AssistantMessage } from '@earendil-works/pi-ai/compat';
import { describe, expect, it } from 'vitest';

import {
  formatGeminiThoughtSignatureErrorMessage,
  isGeminiThoughtSignatureAssistantError,
  isGeminiThoughtSignatureError,
  shouldFailoverOnGeminiError,
} from '../../src/infra/gemini-provider.js';

describe('gemini-provider', () => {
  it('classifies 400 thought_signature as terminal client error', () => {
    const parsed = {
      statusCode: 400,
      code: 'INVALID_ARGUMENT',
      message: 'Function call is missing a thought_signature',
    };

    expect(isGeminiThoughtSignatureError(parsed)).toBe(true);
    expect(shouldFailoverOnGeminiError(parsed)).toBe(false);
  });

  it('does not classify other 400 errors as thought_signature', () => {
    const parsed = {
      statusCode: 400,
      code: 'INVALID_ARGUMENT',
      message: 'Request payload too large',
    };

    expect(isGeminiThoughtSignatureError(parsed)).toBe(false);
    expect(shouldFailoverOnGeminiError(parsed)).toBe(false);
  });

  it('allows failover on Gemini 503 infra errors', () => {
    const parsed = {
      statusCode: 503,
      code: 'UNAVAILABLE',
      message: 'Model overloaded',
    };

    expect(isGeminiThoughtSignatureError(parsed)).toBe(false);
    expect(shouldFailoverOnGeminiError(parsed)).toBe(true);
  });

  it('detects thought_signature errors on assistant messages', () => {
    const message = makeErrorAssistant(
      JSON.stringify({
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'Function call is missing a thought_signature',
        },
      }),
    );

    expect(isGeminiThoughtSignatureAssistantError(message)).toBe(true);
  });

  it('formats thought_signature errors with operator guidance', () => {
    const raw = JSON.stringify({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'Function call is missing a thought_signature',
      },
    });

    const formatted = formatGeminiThoughtSignatureErrorMessage(raw);
    expect(formatted).toContain('400 INVALID_ARGUMENT: Function call is missing a thought_signature');
    expect(formatted).toContain('repairs replay state');
    expect(formatted).toContain('/new');
    expect(formatted).toContain('ai.google.dev/gemini-api/docs/generate-content/thought-signatures');
    expect(formatted).toContain('github.com/earendil-works/pi/issues/6342');
  });
});

function makeErrorAssistant(errorMessage: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'google-generative-ai',
    provider: 'google',
    model: 'gemini-2.5-flash',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'error',
    errorMessage,
    timestamp: Date.now(),
  };
}
