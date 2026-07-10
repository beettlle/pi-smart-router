import { describe, it, expect } from 'vitest';

import { buildHydraInput } from '../../src/domain/matching/hydra-input.js';
import type { RoutingRequest } from '../../src/domain/types/index.js';

function makeRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    request_id: 'req-001',
    session_id: 'sess-001',
    prompt_text: 'Implement a binary search tree',
    ...overrides,
  };
}

const DEFAULT_FLAGS = 'turns:0|tools:0|tokens:0|type:unknown|compact:0|loop:0|attach:0';

describe('buildHydraInput', () => {
  it('prefixes prompt with default seven-flag metadata', () => {
    const input = buildHydraInput(makeRequest());

    expect(input).toBe(
      `[${DEFAULT_FLAGS}] Implement a binary search tree`,
    );
  });

  it('includes message count as turns', () => {
    const input = buildHydraInput(
      makeRequest({
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
          { role: 'user', content: 'again' },
        ],
      }),
    );

    expect(input).toMatch(/^\[turns:3\|/);
  });

  it('sets tools flag for tool_result turn type', () => {
    const input = buildHydraInput(
      makeRequest({ turn_type: 'tool_result' }),
    );

    expect(input).toMatch(/^\[turns:0\|tools:1\|/);
  });

  it('sets tools flag when messages include tool role', () => {
    const input = buildHydraInput(
      makeRequest({
        turn_type: 'main_loop',
        messages: [{ role: 'tool', content: '{"ok":true}' }],
      }),
    );

    expect(input).toMatch(/^\[turns:1\|tools:1\|/);
  });

  it('includes estimated_input_tokens in prefix', () => {
    const input = buildHydraInput(
      makeRequest({ estimated_input_tokens: 34_000 }),
    );

    expect(input).toMatch(/\|tokens:34000\|/);
  });

  it('includes turn_type in prefix', () => {
    const input = buildHydraInput(
      makeRequest({ turn_type: 'planning' }),
    );

    expect(input).toMatch(/\|type:planning\|compact:0\|loop:0\|attach:0\] /);
  });

  it('sets compact flag from compaction_flag', () => {
    const input = buildHydraInput(
      makeRequest({ compaction_flag: true }),
    );

    expect(input).toMatch(/\|compact:1\|loop:0\|attach:0\] /);
  });

  it('sets loop flag when latest tool message looks like failure', () => {
    const input = buildHydraInput(
      makeRequest({
        messages: [
          { role: 'user', content: 'run tests' },
          { role: 'tool', content: 'Error: command failed with exit code 1' },
        ],
      }),
    );

    expect(input).toMatch(/\|loop:1\|attach:0\] /);
  });

  it('clears loop flag when latest tool message is successful', () => {
    const input = buildHydraInput(
      makeRequest({
        messages: [
          { role: 'user', content: 'run tests' },
          { role: 'tool', content: '{"ok":true}' },
        ],
      }),
    );

    expect(input).toMatch(/\|loop:0\|attach:0\] /);
  });

  it('sets attach flag when user content includes image data URI', () => {
    const input = buildHydraInput(
      makeRequest({
        messages: [{ role: 'user', content: 'see data:image/png;base64,abc' }],
      }),
    );

    expect(input).toMatch(/\|attach:1\] /);
  });

  it('sets attach flag when message has tool_blocks', () => {
    const input = buildHydraInput(
      makeRequest({
        messages: [{ role: 'user', content: 'review file', tool_blocks: [{}] }],
      }),
    );

    expect(input).toMatch(/\|attach:1\] /);
  });

  it('produces different prefixes for different token counts on same prompt', () => {
    const prompt = 'what is 2+2 ?';
    const low = buildHydraInput(
      makeRequest({ prompt_text: prompt, estimated_input_tokens: 50 }),
    );
    const high = buildHydraInput(
      makeRequest({ prompt_text: prompt, estimated_input_tokens: 34_000 }),
    );

    expect(low).not.toBe(high);
    expect(low).toContain(prompt);
    expect(high).toContain(prompt);
  });

  it('produces different prefixes for different metadata on same prompt', () => {
    const prompt = 'fix the bug';
    const baseline = buildHydraInput(makeRequest({ prompt_text: prompt }));
    const compacted = buildHydraInput(
      makeRequest({ prompt_text: prompt, compaction_flag: true }),
    );

    expect(baseline).not.toBe(compacted);
  });

  it('uses latest user message and excludes prior assistant text', () => {
    const input = buildHydraInput(
      makeRequest({
        prompt_text: 'stale prompt text',
        messages: [
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'long assistant answer should not embed' },
          { role: 'user', content: 'follow-up question' },
        ],
      }),
    );

    expect(input).toBe(
      `[turns:3|tools:0|tokens:0|type:unknown|compact:0|loop:0|attach:0] follow-up question`,
    );
    expect(input).not.toContain('assistant answer');
    expect(input).not.toContain('stale prompt text');
  });

  it('accepts optional triage without changing output', () => {
    const request = makeRequest({ turn_type: 'main_loop' });
    const withoutTriage = buildHydraInput(request);
    const withTriage = buildHydraInput(request, {
      verdict: 'ambiguous',
      reason_code: 'cyclomatic_mid',
      trivial_hits: 0,
      complex_hits: 1,
      cyclomatic_score: 5,
      sanitized_length_delta: 0,
      entropy_score: 0,
      entropy_tail_delta: 0,
      entropy_tail_stripped_length: 0,
    });

    expect(withTriage).toBe(withoutTriage);
  });

  it('preserves empty prompt text', () => {
    const input = buildHydraInput(makeRequest({ prompt_text: '' }));

    expect(input).toBe(`[${DEFAULT_FLAGS}] `);
  });
});
