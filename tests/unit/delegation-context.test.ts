import type { Context, Message } from '@earendil-works/pi-ai/compat';
import { describe, expect, it } from 'vitest';

import {
  VIRTUAL_ROUTER_MODEL_ID,
  VIRTUAL_ROUTER_PROVIDER,
  hasReplaySensitiveState,
  isVirtualRouterIdentity,
  normalizeDelegationContext,
} from '../../src/domain/delegation/delegation-context.js';

function makeGeminiToolAssistant(thoughtSignature: string): Message {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'call-1',
        name: 'web_search',
        arguments: { query: 'scuba oxygen' },
        thoughtSignature,
      },
    ],
    api: 'google-generative-ai',
    provider: VIRTUAL_ROUTER_PROVIDER,
    model: VIRTUAL_ROUTER_MODEL_ID,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'toolUse',
    timestamp: 1,
  };
}

describe('delegation-context', () => {
  const targetModel = {
    provider: 'google',
    id: 'gemini-2.5-flash',
    api: 'google-generative-ai' as const,
    name: 'Gemini Flash',
    baseUrl: 'https://example.com',
    reasoning: true,
    input: ['text'] as ('text' | 'image')[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  };

  it('detects virtual router identity', () => {
    expect(isVirtualRouterIdentity('smart-router', 'auto')).toBe(true);
    expect(isVirtualRouterIdentity('google', 'gemini-2.5-flash')).toBe(false);
  });

  it('rewrites virtual assistant identity to target model preserving signatures', () => {
    const signature = 'dGhvdWdodC1zaWduYXR1cmU=';
    const context: Context = {
      messages: [makeGeminiToolAssistant(signature)],
    };

    const normalized = normalizeDelegationContext(context, targetModel);

    const assistant = normalized.messages[0];
    expect(assistant?.role).toBe('assistant');
    if (assistant?.role !== 'assistant') {
      return;
    }

    expect(assistant.provider).toBe('google');
    expect(assistant.model).toBe('gemini-2.5-flash');
    expect(assistant.api).toBe('google-generative-ai');

    const toolCall = assistant.content[0];
    expect(toolCall?.type).toBe('toolCall');
    if (toolCall?.type === 'toolCall') {
      expect(toolCall.thoughtSignature).toBe(signature);
    }
  });

  it('uses session execution model for virtual-tagged history', () => {
    const context: Context = {
      messages: [makeGeminiToolAssistant('abc123')],
    };

    const normalized = normalizeDelegationContext(context, targetModel, {
      sessionExecution: {
        provider: 'google',
        api: 'google-generative-ai',
        id: 'gemini-2.5-pro',
      },
    });

    const assistant = normalized.messages[0];
    if (assistant?.role === 'assistant') {
      expect(assistant.model).toBe('gemini-2.5-pro');
    }
  });

  it('does not mutate user or toolResult messages', () => {
    const context: Context = {
      messages: [
        { role: 'user', content: 'hello', timestamp: 1 },
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'web_search',
          content: [{ type: 'text', text: 'result' }],
          isError: false,
          timestamp: 2,
        },
      ],
    };

    const normalized = normalizeDelegationContext(context, targetModel);
    expect(normalized.messages).toEqual(context.messages);
  });

  it('detects replay-sensitive assistant state across providers', () => {
    expect(
      hasReplaySensitiveState([makeGeminiToolAssistant('sig')]),
    ).toBe(true);

    expect(
      hasReplaySensitiveState([
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'plain' }],
          api: 'openai-responses',
          provider: 'openai',
          model: 'gpt-4o-mini',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: 1,
        },
      ]),
    ).toBe(false);

    expect(
      hasReplaySensitiveState([
        {
          role: 'assistant',
          content: [
            {
              type: 'thinking',
              thinking: 'reasoning',
              thinkingSignature: 'anthropic-sig',
            },
          ],
          api: 'anthropic-messages',
          provider: 'anthropic',
          model: 'claude-opus',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: 1,
        },
      ]),
    ).toBe(true);
  });
});
