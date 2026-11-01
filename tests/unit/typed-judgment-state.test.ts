/**
 * Judge state builder tests (SP-306, #185 / epic #183).
 *
 * Covers: state JSON shape and readability, the ~500 estimated-token cap
 * with the required trim order (activity first, then user-message tail),
 * the absence of cost/budget keys, `last_tool_failed` precedence via the
 * shared SP-303 `isToolFailure`, truncated `recent_activity`, the
 * acknowledgement detector's session-depth rule (#179), and the golden
 * incident fixtures under `tests/fixtures/typed-judgment/incidents/`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACK_DEEP_SESSION_MESSAGE_THRESHOLD,
  JUDGE_STATE_TOKEN_CAP,
  buildJudgeState,
  isAcknowledgement,
} from '../../src/domain/judgment/judge-state.js';
import { estimatePromptTokens } from '../../src/domain/matching/encoder-gate.js';
import type { RoutingRequest } from '../../src/domain/types/index.js';

// Own subdirectory: the parent dir also holds SP-305 Jev wire fixtures.
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'typed-judgment', 'incidents');

/** Keys that must never appear anywhere in the judge state (#185). */
const FORBIDDEN_KEYS = new Set([
  'spend',
  'spent',
  'budget',
  'price',
  'pricing',
  'cost',
  'usd',
  'daily_cap',
  'monthly_cap',
]);

function collectKeys(value: unknown, into: string[]): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      into.push(key);
      collectKeys(nested, into);
    }
  }
  return into;
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-test',
    session_id: 'sess-test',
    prompt_text: 'hello',
    ...overrides,
  };
}

describe('buildJudgeState — shape', () => {
  it('emits named JSON fields a judge can read', () => {
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'hi there' },
            { role: 'user', content: 'second' },
          ],
          turn_type: 'main_loop',
          estimated_input_tokens: 100,
        }),
      ),
    ) as Record<string, unknown>;

    expect(state['latest_user_message']).toBe('second');
    expect(state['session']).toEqual({
      messages: 3,
      tool_calls: 0,
      compactions: false,
      context_tokens: 100,
      turn_type: 'main_loop',
      last_tool_failed: false,
    });
    expect(state['recent_activity']).toEqual([
      'user: first',
      'assistant: hi there',
    ]);
    expect(state).not.toHaveProperty('workspace');
  });

  it('falls back to prompt_text when there are no messages', () => {
    const state = JSON.parse(buildJudgeState(makeRequest())) as Record<
      string,
      unknown
    >;
    expect(state['latest_user_message']).toBe('hello');
    expect(state['session']).toMatchObject({
      messages: 0,
      tool_calls: 0,
      turn_type: 'unknown',
    });
    expect(state['recent_activity']).toEqual([]);
  });

  it('includes the workspace one-liner only when supplied', () => {
    const withWorkspace = JSON.parse(
      buildJudgeState(makeRequest(), { workspace: 'repo: pi-smart-router' }),
    ) as Record<string, unknown>;
    expect(withWorkspace['workspace']).toBe('repo: pi-smart-router');

    const without = JSON.parse(buildJudgeState(makeRequest())) as Record<
      string,
      unknown
    >;
    expect(without).not.toHaveProperty('workspace');
  });

  it('contains no spend, budget, price, or cost keys anywhere', () => {
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [{ role: 'user', content: 'how much will this cost me?' }],
          estimated_input_tokens: 5000,
        }),
        { workspace: 'budget repo' },
      ),
    ) as unknown;
    for (const key of collectKeys(state, [])) {
      expect(FORBIDDEN_KEYS.has(key.toLowerCase())).toBe(false);
    }
  });
});

describe('buildJudgeState — recent_activity', () => {
  it('keeps at most 2 lines and truncates each line', () => {
    const longLine = 'x'.repeat(500);
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [
            { role: 'assistant', content: 'older line' },
            { role: 'tool', content: longLine },
            { role: 'assistant', content: 'newer line' },
            { role: 'user', content: 'latest' },
          ],
        }),
      ),
    ) as { recent_activity: string[] };

    expect(state.recent_activity.length).toBeLessThanOrEqual(2);
    expect(state.recent_activity[0]).toMatch(/^tool: x+…$/);
    expect(state.recent_activity[0]!.length).toBeLessThanOrEqual(
      'tool: '.length + 120,
    );
    expect(state.recent_activity[1]).toBe('assistant: newer line');
  });

  it('collapses multi-line tool output onto one truncated line', () => {
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [
            { role: 'tool', content: 'line one\nline two\nline three' },
            { role: 'user', content: 'what happened?' },
          ],
        }),
      ),
    ) as { recent_activity: string[] };

    expect(state.recent_activity).toEqual([
      'tool: line one line two line three',
    ]);
  });
});

describe('buildJudgeState — last_tool_failed (SP-303 precedence)', () => {
  it('honors the structured is_error flag over body text', () => {
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [
            {
              role: 'tool',
              content: 'error: something exploded',
              is_error: false,
            },
            { role: 'user', content: 'continue' },
          ],
        }),
      ),
    ) as { session: { last_tool_failed: boolean } };
    expect(state.session.last_tool_failed).toBe(false);
  });

  it('honors status >= 400 when is_error is absent', () => {
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [
            { role: 'tool', content: 'ok', status: 503 },
            { role: 'user', content: 'continue' },
          ],
        }),
      ),
    ) as { session: { last_tool_failed: boolean } };
    expect(state.session.last_tool_failed).toBe(true);
  });

  it('falls back to the shared body heuristic without structured signals', () => {
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [
            { role: 'tool', content: 'Error: connect ECONNREFUSED' },
            { role: 'user', content: 'continue' },
          ],
        }),
      ),
    ) as { session: { last_tool_failed: boolean } };
    expect(state.session.last_tool_failed).toBe(true);
  });

  it('uses the most recent tool message only', () => {
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [
            { role: 'tool', content: 'failed badly', is_error: true },
            { role: 'tool', content: 'all good', is_error: false },
            { role: 'user', content: 'continue' },
          ],
        }),
      ),
    ) as { session: { last_tool_failed: boolean } };
    expect(state.session.last_tool_failed).toBe(false);
  });
});

describe('buildJudgeState — token cap', () => {
  it('never exceeds the cap, even with huge activity and a huge message', () => {
    const state = buildJudgeState(
      makeRequest({
        messages: [
          { role: 'assistant', content: 'y'.repeat(2000) },
          { role: 'tool', content: 'z'.repeat(2000) },
          { role: 'user', content: 'm'.repeat(5000) },
        ],
      }),
    );
    expect(estimatePromptTokens(state)).toBeLessThanOrEqual(
      JUDGE_STATE_TOKEN_CAP,
    );
  });

  it('trims activity lines before touching the user message', () => {
    const message = 'm'.repeat(300);
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [
            { role: 'assistant', content: 'a'.repeat(400) },
            { role: 'user', content: message },
          ],
        }),
      ),
    ) as { latest_user_message: string; recent_activity: string[] };

    expect(estimatePromptTokens(JSON.stringify(state))).toBeLessThanOrEqual(
      JUDGE_STATE_TOKEN_CAP,
    );
    expect(state.recent_activity).toEqual([]);
    expect(state.latest_user_message).toBe(message);
  });

  it('truncates the user message tail once activity is gone', () => {
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({
          messages: [{ role: 'user', content: 'm'.repeat(5000) }],
        }),
      ),
    ) as { latest_user_message: string };

    expect(estimatePromptTokens(JSON.stringify(state))).toBeLessThanOrEqual(
      JUDGE_STATE_TOKEN_CAP,
    );
    expect(state.latest_user_message.length).toBeLessThan(5000);
    expect(state.latest_user_message.endsWith('…')).toBe(true);
  });
});

describe('isAcknowledgement', () => {
  it.each(['ok', 'Okay', 'thanks', 'Thank you!', 'thx', 'got it', 'perfect'])(
    'treats "%s" as an acknowledgement at any depth',
    (text) => {
      expect(isAcknowledgement(text)).toBe(true);
      expect(isAcknowledgement(text, { sessionDepth: 5000 })).toBe(true);
    },
  );

  it.each(['continue', 'go ahead', 'keep going', 'yes', 'lgtm'])(
    'treats "%s" as an acknowledgement in a shallow session',
    (text) => {
      expect(isAcknowledgement(text)).toBe(true);
      expect(isAcknowledgement(text, { sessionDepth: 3 })).toBe(true);
    },
  );

  it('does not treat "continue" in a 1,000+ message session as an acknowledgement (#179)', () => {
    expect(isAcknowledgement('continue', { sessionDepth: 1000 })).toBe(false);
    expect(
      isAcknowledgement('keep going', {
        sessionDepth: ACK_DEEP_SESSION_MESSAGE_THRESHOLD,
      }),
    ).toBe(false);
  });

  it('does not treat real work requests as acknowledgements', () => {
    expect(isAcknowledgement('please fix the flaky test')).toBe(false);
    expect(isAcknowledgement('')).toBe(false);
    expect(isAcknowledgement('   ')).toBe(false);
  });

  it('pairs with buildJudgeState: a "continue" turn in a deep session is judged, not skipped (#179)', () => {
    const messages = [
      { role: 'user', content: 'port the importer to the new schema' },
      ...Array.from({ length: 1199 }, (_, i) => ({
        role: i % 2 === 0 ? 'assistant' : 'tool',
        content: `step ${i}`,
      })),
      { role: 'user', content: 'continue' },
    ];
    const state = JSON.parse(
      buildJudgeState(
        makeRequest({ prompt_text: 'continue', messages }),
      ),
    ) as { latest_user_message: string; session: { messages: number } };

    expect(state.session.messages).toBe(1201);
    expect(
      isAcknowledgement(state.latest_user_message, {
        sessionDepth: state.session.messages,
      }),
    ).toBe(false);
  });
});

describe('golden incident fixtures', () => {
  const fixtureFiles = readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();

  it('covers the six incident replays', () => {
    expect(fixtureFiles).toEqual([
      '179-deep-continuation.json',
      '23-planning.json',
      '97-cleanup.json',
      'subtle-debug.json',
      'thanks.json',
      'trivial-indent.json',
    ]);
  });

  for (const file of fixtureFiles) {
    it(`matches golden state for ${file}`, () => {
      const fixture = JSON.parse(
        readFileSync(join(FIXTURE_DIR, file), 'utf8'),
      ) as { request: RoutingRequest; expected: unknown };

      const state = buildJudgeState(fixture.request);
      expect(JSON.parse(state)).toEqual(fixture.expected);
      expect(estimatePromptTokens(state)).toBeLessThanOrEqual(
        JUDGE_STATE_TOKEN_CAP,
      );
      for (const key of collectKeys(JSON.parse(state), [])) {
        expect(FORBIDDEN_KEYS.has(key.toLowerCase())).toBe(false);
      }
    });
  }
});
