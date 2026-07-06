import type { AssistantMessage } from '@earendil-works/pi-ai/compat';
import { describe, expect, it } from 'vitest';

import {
  formatGeminiThoughtSignatureErrorMessage,
  isGeminiThoughtSignatureAssistantError,
  isGeminiThoughtSignatureError,
  isInfraAssistantError,
  parseAssistantMessageError,
  formatProviderErrorMessage,
  parseProviderError,
} from '../../src/infrastructure/delegation/provider-error.js';

describe('provider-error', () => {
  it('parses Gemini 503 JSON errors', () => {
    const parsed = parseProviderError(
      JSON.stringify({
        error: {
          code: 503,
          message: 'This model is currently experiencing high demand.',
          status: 'UNAVAILABLE',
        },
      }),
    );

    expect(parsed).toEqual({
      statusCode: 503,
      code: 'UNAVAILABLE',
      message: 'This model is currently experiencing high demand.',
    });
  });

  it('parses 400 INVALID_ARGUMENT missing thought_signature as client error', () => {
    const parsed = parseProviderError(
      JSON.stringify({
        error: {
          code: 400,
          message: 'Function call is missing a thought_signature',
          status: 'INVALID_ARGUMENT',
        },
      }),
    );

    expect(parsed).toEqual({
      statusCode: 400,
      code: 'INVALID_ARGUMENT',
      message: 'Function call is missing a thought_signature',
    });
    expect(isGeminiThoughtSignatureError(parsed!)).toBe(true);
    expect(isInfraAssistantError(makeErrorAssistant(
      JSON.stringify({
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'Function call is missing a thought_signature',
        },
      }),
    ))).toBe(false);
    expect(isGeminiThoughtSignatureAssistantError(makeErrorAssistant(
      JSON.stringify({
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'Function call is missing a thought_signature',
        },
      }),
    ))).toBe(true);
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
    expect(formatted).toContain('/new');
    expect(formatted).toContain('ai.google.dev/gemini-api/docs/generate-content/thought-signatures');
    expect(formatted).toContain('github.com/earendil-works/pi/issues/6342');
  });

  it('classifies 503 assistant errors as infra', () => {
    const message = makeErrorAssistant(
      JSON.stringify({
        error: { code: 503, status: 'UNAVAILABLE' },
      }),
    );

    expect(parseAssistantMessageError(message)).toEqual({
      statusCode: 503,
      code: 'UNAVAILABLE',
    });
    expect(isInfraAssistantError(message)).toBe(true);
  });


  it('formats double-wrapped LiteLLM 503 for user display', () => {
    const raw = JSON.stringify({
      error: {
        message: JSON.stringify({
          error: {
            code: 503,
            message:
              'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
            status: 'UNAVAILABLE',
          },
        }),
        code: 503,
        status: 'Service Unavailable',
      },
    });

    expect(formatProviderErrorMessage(raw)).toBe(
      '503 Service Unavailable: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
    );
  });

  it('returns generic message for unparseable JSON blobs', () => {
    expect(formatProviderErrorMessage('{not-json')).toBe(
      'Provider error (unparseable response)',
    );
  });

  it('handles non-JSON error strings with embedded status codes', () => {
    expect(parseProviderError('upstream HTTP 502 from gateway')).toEqual({ statusCode: 502 });
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
