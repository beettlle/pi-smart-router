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

describe('buildHydraInput', () => {
  it('prefixes prompt with default metadata flags', () => {
    const input = buildHydraInput(makeRequest());

    expect(input).toBe(
      '[turns:0|tools:0|tokens:0|type:unknown] Implement a binary search tree',
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

    expect(input).toMatch(/\|type:planning\] /);
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
    });

    expect(withTriage).toBe(withoutTriage);
  });

  it('preserves empty prompt text', () => {
    const input = buildHydraInput(makeRequest({ prompt_text: '' }));

    expect(input).toBe('[turns:0|tools:0|tokens:0|type:unknown] ');
  });
});
