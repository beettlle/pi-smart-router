// SP-302 (#178): estimateInputTokens must count serialized toolCall arguments,
// replayed thinking blocks (Cursor-origin excluded while SP-300's lifecycle
// strip is enabled), and floor at the last assistant message's reported
// usage.input. Routing content (mapContextMessages) stays unchanged.
import type { AssistantMessage, Context, Message, Usage } from '@earendil-works/pi-ai/compat';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildRoutingRequest,
  estimateInputTokens,
  mapContextMessages,
} from '../../.pi/extensions/smart-router/routing-context.js';
import { STRIP_CURSOR_LIFECYCLE_ENV } from '../../src/index.js';

const STRIP_ENV = STRIP_CURSOR_LIFECYCLE_ENV;

function makeUsage(
  input: number,
  output = 0,
  cacheRead = 0,
  cacheWrite = 0,
): Usage {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function userMessage(content: string, timestamp = 1): Message {
  return { role: 'user', content, timestamp };
}

function assistantMessage(
  overrides: Omit<Partial<AssistantMessage>, 'content'> & {
    content: AssistantMessage['content'];
  },
): AssistantMessage {
  return {
    role: 'assistant',
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-4o-mini',
    usage: makeUsage(0),
    stopReason: 'stop',
    timestamp: 2,
    ...overrides,
  };
}

function makeContext(messages: Message[] = [], systemPrompt?: string): Context {
  return { messages, ...(systemPrompt ? { systemPrompt } : {}) };
}

function ceilTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

describe('estimateInputTokens (SP-302, #178)', () => {
  const originalStripEnv = process.env[STRIP_ENV];

  afterEach(() => {
    if (originalStripEnv === undefined) {
      delete process.env[STRIP_ENV];
    } else {
      process.env[STRIP_ENV] = originalStripEnv;
    }
  });

  it('counts serialized toolCall arguments', () => {
    const args = { command: `bash -lc "${'x'.repeat(200)}"`, timeout: 30 };
    const context = makeContext([
      userMessage('run it'),
      assistantMessage({
        content: [
          { type: 'toolCall', id: 'call-1', name: 'bash', arguments: args },
        ],
      }),
    ]);

    const expectedChars =
      'run it'.length + 'bash'.length + JSON.stringify(args).length;
    expect(estimateInputTokens(context)).toBe(ceilTokens(expectedChars));
  });

  it('counts toolCall argumentsError text when arguments failed to parse', () => {
    const raw = 'x'.repeat(120);
    const context = makeContext([
      assistantMessage({
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'edit',
            arguments: {},
            argumentsError: `invalid json: ${raw}`,
          },
        ],
      }),
    ]);

    const expectedChars = 'edit'.length + '{}'.length + `invalid json: ${raw}`.length;
    expect(estimateInputTokens(context)).toBe(ceilTokens(expectedChars));
  });

  it('counts non-Cursor thinking blocks (replayed as text cross-provider)', () => {
    const thinking = 'k'.repeat(160);
    const context = makeContext([
      assistantMessage({
        provider: 'anthropic',
        model: 'claude-opus',
        api: 'anthropic-messages',
        content: [
          { type: 'thinking', thinking },
          { type: 'text', text: 'done' },
        ],
      }),
    ]);

    expect(estimateInputTokens(context)).toBe(
      ceilTokens(thinking.length + 'done'.length),
    );
  });

  it('excludes Cursor-origin thinking while the lifecycle strip is enabled (default)', () => {
    delete process.env[STRIP_ENV];
    const thinking = 'Cursor shell: ls -la\n'.repeat(20);
    const context = makeContext([
      assistantMessage({
        provider: 'cursor',
        model: 'auto',
        content: [
          { type: 'thinking', thinking },
          { type: 'text', text: 'done' },
        ],
      }),
    ]);

    expect(estimateInputTokens(context)).toBe(ceilTokens('done'.length));
  });

  it('counts Cursor-origin thinking when SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0', () => {
    process.env[STRIP_ENV] = '0';
    const thinking = 'Cursor shell: ls -la\n'.repeat(20);
    const context = makeContext([
      assistantMessage({
        provider: 'cursor',
        model: 'auto',
        content: [{ type: 'thinking', thinking }],
      }),
    ]);

    expect(estimateInputTokens(context)).toBe(ceilTokens(thinking.length));
  });

  it('floors the estimate at the last assistant usage.input', () => {
    const context = makeContext([
      userMessage('tiny'),
      assistantMessage({
        content: [{ type: 'text', text: 'ok' }],
        usage: makeUsage(148_508, 900),
      }),
    ]);

    expect(estimateInputTokens(context)).toBe(148_508);
  });

  it('includes usage.cacheRead and usage.cacheWrite in the last-usage floor', () => {
    const context = makeContext([
      userMessage('tiny'),
      assistantMessage({
        content: [{ type: 'text', text: 'ok' }],
        usage: makeUsage(60_000, 900, 80_000, 8_508),
      }),
    ]);

    expect(estimateInputTokens(context)).toBe(148_508);
  });

  it('floors on cache tokens even when usage.input is zero', () => {
    const context = makeContext([
      userMessage('tiny'),
      assistantMessage({
        content: [{ type: 'text', text: 'ok' }],
        usage: makeUsage(0, 0, 120_000),
      }),
    ]);

    expect(estimateInputTokens(context)).toBe(120_000);
  });

  it('keeps the chars/4 estimate when it exceeds reported usage', () => {
    const text = 'y'.repeat(400);
    const context = makeContext([
      userMessage(text),
      assistantMessage({
        content: [{ type: 'text', text: 'ok' }],
        usage: makeUsage(10),
      }),
    ]);

    expect(estimateInputTokens(context)).toBe(ceilTokens(text.length + 2));
  });

  it('uses the most recent assistant usage, not an earlier one', () => {
    const context = makeContext([
      assistantMessage({
        content: [{ type: 'text', text: 'first' }],
        usage: makeUsage(90_000),
        timestamp: 2,
      }),
      assistantMessage({
        content: [{ type: 'text', text: 'after compaction' }],
        usage: makeUsage(12_000),
        timestamp: 3,
      }),
    ]);

    expect(estimateInputTokens(context)).toBe(12_000);
  });

  it('applies the usage floor to explicit estimates from options', () => {
    const context = makeContext([
      userMessage('ignored'),
      assistantMessage({
        content: [{ type: 'text', text: 'ok' }],
        usage: makeUsage(50_000),
      }),
    ]);

    const estimate = estimateInputTokens(context, {
      estimatedInputTokens: 100,
    } as Parameters<typeof estimateInputTokens>[1]);

    expect(estimate).toBe(50_000);
  });

  it('still prefers explicit estimates when no usage is reported', () => {
    const context = makeContext([userMessage('ignored for count')]);

    const estimate = estimateInputTokens(context, {
      estimatedInputTokens: 12_345,
    } as Parameters<typeof estimateInputTokens>[1]);

    expect(estimate).toBe(12_345);
  });

  it('buildRoutingRequest includes toolCall args and non-Cursor thinking in estimated_input_tokens', () => {
    const args = { content: 'z'.repeat(2_000) };
    const thinking = 'plan: '.padEnd(2_000, 'w');
    const request = buildRoutingRequest(
      makeContext([
        userMessage('implement the feature'),
        assistantMessage({
          provider: 'anthropic',
          model: 'claude-opus',
          api: 'anthropic-messages',
          content: [
            { type: 'thinking', thinking },
            { type: 'toolCall', id: 'call-1', name: 'write', arguments: args },
          ],
        }),
      ]),
      undefined,
    );

    const expectedChars =
      'implement the feature'.length +
      thinking.length +
      'write'.length +
      JSON.stringify(args).length;
    expect(request.estimated_input_tokens).toBe(ceilTokens(expectedChars));
  });
});

describe('routing content unchanged (SP-302)', () => {
  it('mapContextMessages still drops thinking and toolCall arguments by default', () => {
    const args = { command: 'rm -rf /tmp/x' };
    const mapped = mapContextMessages([
      assistantMessage({
        provider: 'cursor',
        model: 'auto',
        content: [
          { type: 'thinking', thinking: 'Cursor shell: pwd' },
          { type: 'text', text: 'visible reply' },
          { type: 'toolCall', id: 'call-1', name: 'bash', arguments: args },
        ],
      }),
    ]);

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.content).toBe('visible reply');
    expect(mapped[0]?.content).not.toContain('Cursor shell');
    expect(mapped[0]?.content).not.toContain('rm -rf');
    expect(mapped[0]?.tool_blocks).toEqual([
      { type: 'tool_call', tool_call_id: 'call-1', tool_name: 'bash' },
    ]);
  });
});
