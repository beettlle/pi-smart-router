import { describe, expect, it } from 'vitest';

import {
  GEMINI_TOOL_HISTORY_EXCLUDED,
  hasToolCallHistory,
  hasToolCallHistoryFromContext,
  isGoogleGeminiProfile,
  resolveEffectiveFleet,
} from '../../src/domain/routing/tool-history-guard.js';
import type { Message, ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

function makeProfile(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: overrides.provider ?? 'openai',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-guard-1',
    session_id: 'sess-guard-1',
    prompt_text: 'hello',
    ...overrides,
  };
}

const fleet: ModelProfile[] = [
  makeProfile({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
  makeProfile({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
  makeProfile({ id: 'cursor-gemini', tier: 'economical-cloud', provider: 'cursor' }),
  makeProfile({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
];

describe('hasToolCallHistoryFromContext', () => {
  it('returns false for user-only history', () => {
    expect(
      hasToolCallHistoryFromContext([
        { role: 'user', content: 'hello', timestamp: 1 },
      ]),
    ).toBe(false);
  });

  it('returns true when assistant emitted toolCall blocks', () => {
    expect(
      hasToolCallHistoryFromContext([
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'read',
              arguments: {},
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
          timestamp: 2,
        },
      ]),
    ).toBe(true);
  });

  it('returns true when history includes toolResult turns', () => {
    expect(
      hasToolCallHistoryFromContext([
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'read',
          content: [{ type: 'text', text: 'ok' }],
          isError: false,
          timestamp: 3,
        },
      ]),
    ).toBe(true);
  });
});

describe('hasToolCallHistory', () => {
  it('returns true for mapped tool turns', () => {
    const messages: Message[] = [
      { role: 'tool', content: '{"ok":true}', tool_blocks: [] },
    ];
    expect(hasToolCallHistory(messages)).toBe(true);
  });

  it('returns true for assistant tool_blocks', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: '',
        tool_blocks: [{ id: 'call-1' }],
      },
    ];
    expect(hasToolCallHistory(messages)).toBe(true);
  });

  it('returns false for plain assistant text', () => {
    const messages: Message[] = [{ role: 'assistant', content: 'hello' }];
    expect(hasToolCallHistory(messages)).toBe(false);
  });
});

describe('isGoogleGeminiProfile', () => {
  it('matches google provider profiles', () => {
    expect(
      isGoogleGeminiProfile(
        makeProfile({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
      ),
    ).toBe(true);
  });

  it('matches cursor gemini aliases', () => {
    expect(
      isGoogleGeminiProfile(
        makeProfile({ id: 'gemini-2.5-flash', tier: 'economical-cloud', provider: 'cursor' }),
      ),
    ).toBe(true);
  });

  it('does not match unrelated providers', () => {
    expect(
      isGoogleGeminiProfile(
        makeProfile({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
      ),
    ).toBe(false);
  });
});

describe('resolveEffectiveFleet', () => {
  it('leaves fleet unchanged without tool history', () => {
    const request = makeRequest({
      messages: [{ role: 'user', content: 'hello' }],
    });

    const result = resolveEffectiveFleet(fleet, request);
    expect(result.excluded).toBe(false);
    expect(result.effectiveFleet).toEqual(fleet);
  });

  it('excludes google/gemini profiles when tool history is present', () => {
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(fleet, request);
    expect(result.excluded).toBe(true);
    expect(result.reasonCode).toBe(GEMINI_TOOL_HISTORY_EXCLUDED);
    expect(result.effectiveFleet.map((profile) => profile.id)).toEqual([
      'gpt-4o-mini',
      'claude-opus',
    ]);
  });

  it('honors force_model_id and keeps google models available', () => {
    const request = makeRequest({
      force_model_id: 'gemini-flash',
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(fleet, request);
    expect(result.excluded).toBe(false);
    expect(result.effectiveFleet).toEqual(fleet);
  });

  it('prefers raw context messages when provided', () => {
    const request = makeRequest({
      messages: [{ role: 'user', content: 'hello' }],
    });

    const result = resolveEffectiveFleet(fleet, request, [
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'read',
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
        timestamp: 1,
      },
    ]);

    expect(result.excluded).toBe(true);
    expect(result.effectiveFleet.map((profile) => profile.id)).toEqual([
      'gpt-4o-mini',
      'claude-opus',
    ]);
  });
});
