import type { AssistantMessage } from '@earendil-works/pi-ai/compat';
import { describe, expect, it } from 'vitest';

import {
  classifyDegenerateOutput,
  DEGENERATE_OUTPUT,
  isDegenerateOutput,
  repeatedNgramRatio,
  type DegenerateOutputMessage,
} from '../../src/domain/delegation/degenerate-output.js';

function makeMessage(
  text: string,
  stopReason: AssistantMessage['stopReason'] = 'length',
): DegenerateOutputMessage {
  return { stopReason, content: [{ type: 'text', text }] };
}

const repetitiveTail = Array.from(
  { length: 160 },
  (_, index) => `sleep ${300 + index}; echo "${index}-END";`,
).join('\n');

const longNonRepetitiveText = Array.from(
  { length: 800 },
  (_, index) => {
    const token = index.toString(36);
    return `analysis-${token}-continuation-${token.split('').reverse().join('')}`;
  },
).join(' ');

describe('degenerate output classifier (SP-325 / #181)', () => {
  it('classifies a repetitive length stop with no toolCall as degenerate', () => {
    const result = classifyDegenerateOutput(makeMessage(repetitiveTail));

    expect(result).toMatchObject({
      degenerate: true,
      reasonCode: DEGENERATE_OUTPUT,
    });
    expect(result.repeatedNgramRatio).toBeGreaterThanOrEqual(0.65);
    expect(result.sampledNgrams).toBeGreaterThanOrEqual(24);
    expect(isDegenerateOutput(makeMessage(repetitiveTail))).toBe(true);
  });

  it('does not classify a long non-repetitive length stop', () => {
    const message = makeMessage(longNonRepetitiveText);
    const result = classifyDegenerateOutput(message);

    expect(result.degenerate).toBe(false);
    expect(result.reasonCode).toBeNull();
    expect(result.repeatedNgramRatio).toBeLessThan(0.65);
    expect(isDegenerateOutput(message)).toBe(false);
  });

  it('requires a length stop even when the text is repetitive', () => {
    expect(isDegenerateOutput(makeMessage(repetitiveTail, 'stop'))).toBe(false);
    expect(isDegenerateOutput(makeMessage(repetitiveTail, 'error'))).toBe(false);
  });

  it('does not classify repetitive text when a toolCall block is present', () => {
    const message: DegenerateOutputMessage = {
      stopReason: 'length',
      content: [
        { type: 'text', text: repetitiveTail },
        {
          type: 'toolCall',
          id: 'call-1',
          name: 'bash',
          arguments: { command: 'echo done' },
        },
      ],
    };

    expect(isDegenerateOutput(message)).toBe(false);
  });

  it('requires enough trailing n-grams to avoid classifying short responses', () => {
    expect(isDegenerateOutput(makeMessage('same same same same same same'))).toBe(false);
  });

  it('detects repetition in the trailing text rather than diluting it with a unique prefix', () => {
    const uniquePrefix = Array.from(
      { length: 2_000 },
      (_, index) => `prefix-${index.toString(36)}`,
    ).join(' ');

    expect(isDegenerateOutput(makeMessage(`${uniquePrefix}\n${repetitiveTail}`))).toBe(true);
  });

  it('exposes the repetition metric for diagnostics', () => {
    const result = repeatedNgramRatio('a b c d e '.repeat(40));

    expect(result.sampledNgrams).toBeGreaterThan(0);
    expect(result.repeatedNgramRatio).toBeGreaterThan(0.95);
  });
});
