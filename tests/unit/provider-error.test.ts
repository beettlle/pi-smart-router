import type { AssistantMessage } from '@earendil-works/pi-ai/compat';
import { describe, expect, it } from 'vitest';

import {
  isInfraAssistantError,
  parseAssistantMessageError,
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

  it('parses 400 INVALID_ARGUMENT missing thought_signature as infra', () => {
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
    expect(isInfraAssistantError(makeErrorAssistant(
      JSON.stringify({
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'Function call is missing a thought_signature',
        },
      }),
    ))).toBe(true);
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
