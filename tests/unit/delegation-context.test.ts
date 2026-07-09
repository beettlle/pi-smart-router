import type { Context, Message } from '@earendil-works/pi-ai/compat';
import { describe, expect, it } from 'vitest';

import {
  GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL,
  VIRTUAL_ROUTER_MODEL_ID,
  VIRTUAL_ROUTER_PROVIDER,
  hasReplaySensitiveState,
  isGoogleDelegationTarget,
  isGoogleOriginAssistantMessage,
  isVirtualRouterIdentity,
  normalizeDelegationContext,
  repairGeminiReplayContext,
} from '../../src/domain/delegation/delegation-context.js';

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

const alternateGeminiTarget = {
  ...targetModel,
  id: 'gemini-2.5-pro',
  name: 'Gemini Pro',
};

function makeGeminiToolAssistant(
  thoughtSignature: string | undefined,
  overrides?: Partial<Extract<Message, { role: 'assistant' }>>,
): Message {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'call-1',
        name: 'web_search',
        arguments: { query: 'scuba oxygen' },
        ...(thoughtSignature !== undefined ? { thoughtSignature } : {}),
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
    ...overrides,
  };
}

function makeOpenAiToolAssistant(): Message {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'call-openai',
        name: 'grep',
        arguments: { pattern: 'foo' },
      },
    ],
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
    stopReason: 'toolUse',
    timestamp: 1,
  };
}

function makeAnthropicToolAssistant(): Message {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'call-anthropic',
        name: 'read',
        arguments: { path: '/tmp/x' },
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
    stopReason: 'toolUse',
    timestamp: 1,
  };
}

describe('delegation-context', () => {
  it('detects virtual router identity', () => {
    expect(isVirtualRouterIdentity('smart-router', 'auto')).toBe(true);
    expect(isVirtualRouterIdentity('google', 'gemini-2.5-flash')).toBe(false);
  });

  it('detects Google delegation targets', () => {
    expect(isGoogleDelegationTarget(targetModel)).toBe(true);
    expect(
      isGoogleDelegationTarget({
        ...targetModel,
        provider: 'cursor',
        id: 'gemini-2.5-flash',
      }),
    ).toBe(true);
    expect(
      isGoogleDelegationTarget({
        ...targetModel,
        provider: 'openai',
        api: 'openai-responses',
        id: 'gpt-4o-mini',
      }),
    ).toBe(false);
  });

  it('detects Google-origin assistant messages', () => {
    const virtual = makeGeminiToolAssistant('sig');
    expect(virtual.role).toBe('assistant');
    if (virtual.role === 'assistant') {
      expect(isGoogleOriginAssistantMessage(virtual)).toBe(true);
    }

    const googleDirect = makeGeminiToolAssistant('sig', {
      provider: 'google',
      model: 'gemini-2.5-pro',
    });
    if (googleDirect.role === 'assistant') {
      expect(isGoogleOriginAssistantMessage(googleDirect)).toBe(true);
    }

    const openAi = makeOpenAiToolAssistant();
    if (openAi.role === 'assistant') {
      expect(isGoogleOriginAssistantMessage(openAi)).toBe(false);
    }
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

describe('repairGeminiReplayContext', () => {
  it('preserves existing thoughtSignature on toolCall', () => {
    const signature = 'dGhvdWdodC1zaWduYXR1cmU=';
    const context: Context = {
      messages: [
        makeGeminiToolAssistant(signature, {
          provider: 'google',
          model: 'gemini-2.5-pro',
        }),
      ],
    };

    const repaired = repairGeminiReplayContext(context, alternateGeminiTarget);
    const assistant = repaired.messages[0];
    if (assistant?.role === 'assistant') {
      const toolCall = assistant.content[0];
      if (toolCall?.type === 'toolCall') {
        expect(toolCall.thoughtSignature).toBe(signature);
      }
    }
  });

  it('injects sentinel when thoughtSignature is absent', () => {
    const context: Context = {
      messages: [
        makeGeminiToolAssistant(undefined, {
          provider: 'google',
          model: 'gemini-2.5-pro',
        }),
      ],
    };

    const repaired = repairGeminiReplayContext(context, alternateGeminiTarget);
    const assistant = repaired.messages[0];
    if (assistant?.role === 'assistant') {
      const toolCall = assistant.content[0];
      if (toolCall?.type === 'toolCall') {
        expect(toolCall.thoughtSignature).toBe(GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL);
      }
    }
  });

  it('aligns cross-model Google assistant identity to target model', () => {
    const context: Context = {
      messages: [
        makeGeminiToolAssistant('abc123=', {
          provider: 'google',
          model: 'gemini-2.5-pro',
        }),
      ],
    };

    const normalized = normalizeDelegationContext(context, targetModel);
    const repaired = repairGeminiReplayContext(normalized, targetModel);

    const assistant = repaired.messages[0];
    if (assistant?.role === 'assistant') {
      expect(assistant.provider).toBe('google');
      expect(assistant.model).toBe('gemini-2.5-flash');
      expect(assistant.api).toBe('google-generative-ai');
    }
  });

  it('leaves OpenAI and Anthropic assistant messages unchanged', () => {
    const context: Context = {
      messages: [makeOpenAiToolAssistant(), makeAnthropicToolAssistant()],
    };

    const repaired = repairGeminiReplayContext(context, targetModel);
    expect(repaired.messages).toEqual(context.messages);
  });

  it('repairs virtual-router tagged messages without prior normalizeDelegationContext', () => {
    const context: Context = {
      messages: [makeGeminiToolAssistant(undefined)],
    };

    const repaired = repairGeminiReplayContext(context, targetModel);
    const assistant = repaired.messages[0];
    if (assistant?.role === 'assistant') {
      expect(assistant.provider).toBe('google');
      expect(assistant.model).toBe('gemini-2.5-flash');
      expect(assistant.api).toBe('google-generative-ai');

      const toolCall = assistant.content[0];
      if (toolCall?.type === 'toolCall') {
        expect(toolCall.thoughtSignature).toBe(GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL);
      }
    }
  });

  it('no-ops for non-Google delegation targets', () => {
    const context: Context = {
      messages: [makeGeminiToolAssistant(undefined)],
    };

    const openAiTarget = {
      provider: 'openai',
      id: 'gpt-4o-mini',
      api: 'openai-responses' as const,
      name: 'GPT-4o mini',
      baseUrl: 'https://example.com',
      reasoning: false,
      input: ['text'] as ('text' | 'image')[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 8192,
    };

    const repaired = repairGeminiReplayContext(context, openAiTarget);
    expect(repaired).toEqual(context);
  });
});
