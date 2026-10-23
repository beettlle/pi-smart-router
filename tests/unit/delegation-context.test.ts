import type { Context, Message } from '@earendil-works/pi-ai/compat';
import { describe, expect, it } from 'vitest';

import {
  GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL,
  VIRTUAL_ROUTER_MODEL_ID,
  VIRTUAL_ROUTER_PROVIDER,
  hasReplaySensitiveState,
  isCursorDelegationTarget,
  isCursorOriginAssistantMessage,
  isGoogleDelegationTarget,
  isGoogleOriginAssistantMessage,
  isVirtualRouterIdentity,
  normalizeDelegationContext,
  repairGeminiReplayContext,
  stripCursorLifecycleThinking,
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

function makeGlmToolAssistant(): Message {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'call-glm',
        name: 'bash',
        arguments: { command: 'ls' },
      },
    ],
    api: 'openai-completions',
    provider: 'zai',
    model: 'glm-4.6',
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

  it('repairs unsigned toolCalls from non-Google providers when targeting Google (SP-231)', () => {
    const context: Context = {
      messages: [
        makeOpenAiToolAssistant(),
        makeAnthropicToolAssistant(),
        makeGlmToolAssistant(),
      ],
    };

    const repaired = repairGeminiReplayContext(context, targetModel);
    expect(repaired.messages).toHaveLength(3);

    for (const message of repaired.messages) {
      expect(message.role).toBe('assistant');
      if (message.role !== 'assistant') {
        continue;
      }
      expect(message.provider).toBe('google');
      expect(message.model).toBe('gemini-2.5-flash');
      expect(message.api).toBe('google-generative-ai');

      const toolCall = message.content[0];
      expect(toolCall?.type).toBe('toolCall');
      if (toolCall?.type === 'toolCall') {
        expect(toolCall.thoughtSignature).toBe(GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL);
      }
    }
  });

  it('preserves captured signatures on non-Google-tagged toolCalls', () => {
    const signature = 'b3BlbmFpLXNpZw==';
    const openAiSigned = makeOpenAiToolAssistant();
    expect(openAiSigned.role).toBe('assistant');
    if (openAiSigned.role !== 'assistant') {
      return;
    }
    const context: Context = {
      messages: [
        {
          ...openAiSigned,
          content: [
            {
              type: 'toolCall' as const,
              id: 'call-openai-signed',
              name: 'grep',
              arguments: { pattern: 'foo' },
              thoughtSignature: signature,
            },
          ],
        },
      ],
    };

    const repaired = repairGeminiReplayContext(context, targetModel);
    const assistant = repaired.messages[0];
    if (assistant?.role === 'assistant') {
      const toolCall = assistant.content[0];
      if (toolCall?.type === 'toolCall') {
        expect(toolCall.thoughtSignature).toBe(signature);
      }
    }
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

type AssistantMessage = Extract<Message, { role: 'assistant' }>;

describe('stripCursorLifecycleThinking (SP-300, #180)', () => {
  const glmTarget = {
    provider: 'zai',
    id: 'glm-5.3-flash',
    api: 'openai-completions' as const,
    name: 'GLM 5.3 Flash',
    baseUrl: 'https://example.com',
    reasoning: true,
    input: ['text'] as ('text' | 'image')[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  };

  const cursorTarget = {
    ...glmTarget,
    provider: 'cursor',
    id: 'cursor/auto',
    name: 'Cursor Auto',
  };

  function makeCursorLifecycleAssistant(overrides?: {
    content?: AssistantMessage['content'];
    provider?: string;
    model?: string;
  }): Message {
    return {
      role: 'assistant',
      content: overrides?.content ?? [
        { type: 'thinking', thinking: 'Cursor shell: npm test' },
        { type: 'thinking', thinking: 'Cursor read stdout: src/index.ts' },
        { type: 'text', text: 'Running the test suite now.' },
        { type: 'toolCall', id: 'call-cursor-1', name: 'bash', arguments: { command: 'npm test' } },
      ],
      api: 'openai-completions',
      provider: overrides?.provider ?? 'cursor',
      model: overrides?.model ?? 'auto',
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'toolUse',
      timestamp: 1,
    };
  }

  function collectReplayableText(context: Context): string {
    return context.messages
      .flatMap((message) => (message.role === 'assistant' ? message.content : []))
      .map((block) => {
        if (block.type === 'thinking') return block.thinking;
        if (block.type === 'text') return block.text;
        return '';
      })
      .join('\n');
  }

  it('detects Cursor delegation targets and Cursor-origin messages', () => {
    expect(isCursorDelegationTarget(cursorTarget)).toBe(true);
    expect(isCursorDelegationTarget(glmTarget)).toBe(false);
    expect(isCursorDelegationTarget(targetModel)).toBe(false);

    expect(isCursorOriginAssistantMessage(makeCursorLifecycleAssistant() as AssistantMessage)).toBe(true);
    expect(isCursorOriginAssistantMessage(makeOpenAiToolAssistant() as AssistantMessage)).toBe(false);
  });

  it('strips Cursor lifecycle thinking when delegating to a GLM target', () => {
    const context: Context = {
      messages: [makeCursorLifecycleAssistant()],
    };

    const result = stripCursorLifecycleThinking(context, glmTarget, { env: {} });

    expect(result.strippedThinkingBlocks).toBe(2);
    expect(result.strippedThinkingChars).toBe(
      'Cursor shell: npm test'.length + 'Cursor read stdout: src/index.ts'.length,
    );
    expect(result.droppedMessages).toBe(0);
    expect(collectReplayableText(result.context)).not.toContain('Cursor shell:');
    expect(collectReplayableText(result.context)).not.toContain('Cursor read');

    const assistant = result.context.messages[0] as AssistantMessage;
    expect(assistant.content).toEqual([
      { type: 'text', text: 'Running the test suite now.' },
      { type: 'toolCall', id: 'call-cursor-1', name: 'bash', arguments: { command: 'npm test' } },
    ]);
  });

  it('strips Cursor lifecycle thinking when delegating to a Gemini target', () => {
    const context: Context = {
      messages: [makeCursorLifecycleAssistant()],
    };

    const result = stripCursorLifecycleThinking(context, targetModel, { env: {} });

    expect(result.strippedThinkingBlocks).toBe(2);
    expect(collectReplayableText(result.context)).not.toContain('Cursor shell:');
  });

  it('leaves the context unchanged for Cursor targets', () => {
    const context: Context = {
      messages: [makeCursorLifecycleAssistant()],
    };

    const result = stripCursorLifecycleThinking(context, cursorTarget, { env: {} });

    expect(result.context).toEqual(context);
    expect(result.strippedThinkingBlocks).toBe(0);
    expect(result.droppedMessages).toBe(0);
  });

  it('leaves non-Cursor thinking unchanged (Gemini origin → GLM target)', () => {
    const geminiAssistant = makeGeminiToolAssistant(undefined, {
      provider: 'google',
      model: 'gemini-2.5-pro',
      content: [
        { type: 'thinking', thinking: 'genuine gemini reasoning', thinkingSignature: 'sig-gemini' },
        { type: 'text', text: 'A Gemini answer.' },
      ],
    });
    const context: Context = { messages: [geminiAssistant] };

    const result = stripCursorLifecycleThinking(context, glmTarget, { env: {} });

    expect(result.context).toEqual(context);
    expect(result.strippedThinkingBlocks).toBe(0);
  });

  it('is disabled by SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0', () => {
    const context: Context = {
      messages: [makeCursorLifecycleAssistant()],
    };

    const disabled = stripCursorLifecycleThinking(context, glmTarget, {
      env: { SMART_ROUTER_STRIP_CURSOR_LIFECYCLE: '0' },
    });
    expect(disabled.context).toEqual(context);
    expect(disabled.strippedThinkingBlocks).toBe(0);

    const enabled = stripCursorLifecycleThinking(context, glmTarget, {
      env: { SMART_ROUTER_STRIP_CURSOR_LIFECYCLE: '1' },
    });
    expect(enabled.strippedThinkingBlocks).toBe(2);
  });

  it('preserves tool-call blocks while dropping lifecycle thinking', () => {
    const context: Context = {
      messages: [
        makeCursorLifecycleAssistant({
          content: [
            { type: 'thinking', thinking: 'Cursor shell: sleep 60' },
            { type: 'toolCall', id: 'call-keep-1', name: 'read', arguments: { path: 'README.md' } },
          ],
        }),
      ],
    };

    const result = stripCursorLifecycleThinking(context, glmTarget, { env: {} });

    const assistant = result.context.messages[0] as AssistantMessage;
    expect(assistant.content).toEqual([
      { type: 'toolCall', id: 'call-keep-1', name: 'read', arguments: { path: 'README.md' } },
    ]);
    expect(result.droppedMessages).toBe(0);
  });

  it('drops Cursor messages that held nothing but lifecycle thinking', () => {
    const context: Context = {
      messages: [
        makeCursorLifecycleAssistant({
          content: [
            { type: 'thinking', thinking: 'Cursor shell: npm test' },
            { type: 'thinking', thinking: 'Cursor MCP: status' },
          ],
        }),
        makeOpenAiToolAssistant(),
      ],
    };

    const result = stripCursorLifecycleThinking(context, glmTarget, { env: {} });

    expect(result.droppedMessages).toBe(1);
    expect(result.strippedThinkingBlocks).toBe(2);
    expect(result.context.messages).toHaveLength(1);
    expect((result.context.messages[0] as AssistantMessage).provider).toBe('openai');
  });

  it('catches virtual-tagged history resolved to a Cursor session execution', () => {
    const context: Context = {
      messages: [
        makeGeminiToolAssistant(undefined, {
          content: [
            { type: 'thinking', thinking: 'Cursor shell: spine batch retry' },
            { type: 'text', text: 'Retrying the failed batch lane.' },
          ],
        }),
      ],
    };

    const normalized = normalizeDelegationContext(context, glmTarget, {
      sessionExecution: { provider: 'cursor', api: 'openai-completions', id: 'auto' },
    });
    const result = stripCursorLifecycleThinking(normalized, glmTarget, { env: {} });

    expect(result.strippedThinkingBlocks).toBe(1);
    expect(collectReplayableText(result.context)).not.toContain('Cursor shell:');
    expect(collectReplayableText(result.context)).toContain('Retrying the failed batch lane.');
  });
});
