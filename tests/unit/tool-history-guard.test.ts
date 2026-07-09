import { describe, expect, it } from 'vitest';

import {
  assertRoutableFleetAfterGeminiToolHistoryGuard,
  GEMINI_TOOL_HISTORY_EXCLUDED,
  GEMINI_TOOL_HISTORY_EMPTY_FLEET,
  GeminiToolHistoryEmptyFleetError,
  hasGoogleReplayRisk,
  hasGoogleReplayRiskFromContext,
  hasToolCallHistory,
  hasToolCallHistoryFromContext,
  hasUnrepairableGoogleReplayRiskFromContext,
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

const openAiToolCallAssistant = {
  role: 'assistant' as const,
  content: [
    {
      type: 'toolCall' as const,
      id: 'call-1',
      name: 'read',
      arguments: {},
    },
  ],
  api: 'openai-responses' as const,
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: 'toolUse' as const,
  timestamp: 2,
};

const googleToolCallAssistant = {
  role: 'assistant' as const,
  content: [
    {
      type: 'toolCall' as const,
      id: 'call-1',
      name: 'read',
      arguments: {},
    },
  ],
  api: 'google-generative-ai' as const,
  provider: 'google' as const,
  model: 'gemini-flash',
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: 'toolUse' as const,
  timestamp: 2,
};

const googleUnrepairableAssistant = {
  ...googleToolCallAssistant,
  content: [
    {
      type: 'thinking' as const,
      thinking: '',
      redacted: true,
    },
    googleToolCallAssistant.content[0]!,
  ],
};

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
      hasToolCallHistoryFromContext([openAiToolCallAssistant]),
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

describe('hasGoogleReplayRiskFromContext', () => {
  it('returns false for OpenAI-origin assistant tool calls', () => {
    expect(hasGoogleReplayRiskFromContext([openAiToolCallAssistant])).toBe(false);
  });

  it('returns true for Google-origin assistant tool calls', () => {
    expect(hasGoogleReplayRiskFromContext([googleToolCallAssistant])).toBe(true);
  });

  it('returns false for toolResult-only history', () => {
    expect(
      hasGoogleReplayRiskFromContext([
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'read',
          content: [{ type: 'text', text: 'ok' }],
          isError: false,
          timestamp: 3,
        },
      ]),
    ).toBe(false);
  });
});

describe('hasUnrepairableGoogleReplayRiskFromContext', () => {
  it('returns false for repairable Google tool calls without signatures', () => {
    expect(hasUnrepairableGoogleReplayRiskFromContext([googleToolCallAssistant])).toBe(
      false,
    );
  });

  it('returns true when Google-origin history has redacted thinking', () => {
    expect(
      hasUnrepairableGoogleReplayRiskFromContext([googleUnrepairableAssistant]),
    ).toBe(true);
  });
});

describe('hasGoogleReplayRisk', () => {
  it('returns false for mapped routing messages without provider metadata', () => {
    const messages: Message[] = [
      { role: 'tool', content: 'ok', tool_blocks: [] },
      {
        role: 'assistant',
        content: '',
        tool_blocks: [{ id: 'call-1' }],
      },
    ];
    expect(hasGoogleReplayRisk(messages)).toBe(false);
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

  it('does not exclude gemini for OpenAI tool history', () => {
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(fleet, request, [
      openAiToolCallAssistant,
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'read',
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
        timestamp: 3,
      },
    ]);
    expect(result.excluded).toBe(false);
    expect(result.effectiveFleet).toEqual(fleet);
  });

  it('does not exclude gemini for repairable Google-origin tool history', () => {
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(fleet, request, [
      googleToolCallAssistant,
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'read',
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
        timestamp: 3,
      },
    ]);
    expect(result.excluded).toBe(false);
    expect(result.effectiveFleet).toEqual(fleet);
  });

  it('excludes google/gemini profiles for unrepairable Google replay risk', () => {
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(fleet, request, [googleUnrepairableAssistant]);
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

    const result = resolveEffectiveFleet(fleet, request, [googleUnrepairableAssistant]);
    expect(result.excluded).toBe(false);
    expect(result.effectiveFleet).toEqual(fleet);
  });
});

const googleOnlyFleet: ModelProfile[] = [
  makeProfile({ id: 'gemini-flash', tier: 'economical-cloud', provider: 'google' }),
  makeProfile({
    id: 'gemini-2.5-flash',
    tier: 'economical-cloud',
    provider: 'cursor',
  }),
];

describe('empty fleet after gemini exclusion (SP-084)', () => {
  it('flags fleetEmptyAfterFilter for google-only fleet with unrepairable replay risk', () => {
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(googleOnlyFleet, request, [
      googleUnrepairableAssistant,
    ]);
    expect(result.fleetEmptyAfterFilter).toBe(true);
    expect(result.excluded).toBe(true);
    expect(result.reasonCode).toBe(GEMINI_TOOL_HISTORY_EXCLUDED);
    expect(result.effectiveFleet).toEqual([]);
  });

  it('does not empty fleet for repairable Google tool history alone', () => {
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(googleOnlyFleet, request, [googleToolCallAssistant]);
    expect(result.fleetEmptyAfterFilter).toBeUndefined();
    expect(result.excluded).toBe(false);
    expect(result.effectiveFleet).toEqual(googleOnlyFleet);
  });

  it('throws actionable error when no routable model remains', () => {
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });
    const result = resolveEffectiveFleet(googleOnlyFleet, request, [
      googleUnrepairableAssistant,
    ]);

    expect(() => assertRoutableFleetAfterGeminiToolHistoryGuard(result)).toThrow(
      GeminiToolHistoryEmptyFleetError,
    );
    expect(() => assertRoutableFleetAfterGeminiToolHistoryGuard(result)).toThrow(
      'non-Google model',
    );

    try {
      assertRoutableFleetAfterGeminiToolHistoryGuard(result);
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiToolHistoryEmptyFleetError);
      expect((error as GeminiToolHistoryEmptyFleetError).reasonCode).toBe(
        GEMINI_TOOL_HISTORY_EMPTY_FLEET,
      );
    }
  });

  it('honors force_model_id for google-only fleet with unrepairable replay risk', () => {
    const request = makeRequest({
      force_model_id: 'gemini-flash',
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(googleOnlyFleet, request, [
      googleUnrepairableAssistant,
    ]);
    expect(result.fleetEmptyAfterFilter).toBeUndefined();
    expect(result.excluded).toBe(false);
    expect(result.effectiveFleet).toEqual(googleOnlyFleet);
  });

  it('keeps cursor/auto when present alongside google models for unrepairable risk', () => {
    const fleetWithCursor = [
      ...googleOnlyFleet,
      makeProfile({ id: 'cursor/auto', tier: 'economical-cloud', provider: 'cursor' }),
    ];
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ok', tool_blocks: [] }],
    });

    const result = resolveEffectiveFleet(fleetWithCursor, request, [
      googleUnrepairableAssistant,
    ]);
    expect(result.fleetEmptyAfterFilter).toBeUndefined();
    expect(result.effectiveFleet.map((profile) => profile.id)).toEqual(['cursor/auto']);
  });
});
