/**
 * Post-stream degenerate output detection (SP-325 / #181).
 *
 * A delegated response is degenerate only when it stopped for length, contains
 * no tool calls, and its trailing text is highly repetitive. The default
 * repetition metric is the repeated 5-gram ratio over whitespace-delimited
 * tokens in the last 8,192 characters. Numeric fragments are normalized so
 * runaway sequences with changing counters still match. At least 24 windows
 * are required and the default repeated-window threshold is 0.65.
 */

import type { AssistantMessage } from '@earendil-works/pi-ai/compat';

export const DEGENERATE_OUTPUT = 'degenerate_output' as const;
export const DEGENERATE_OUTPUT_ERROR_CODE = 'DEGENERATE_OUTPUT' as const;

export const DEFAULT_DEGENERATE_OUTPUT_CONFIG = {
  trailingCharacters: 8_192,
  ngramSize: 5,
  minNgramWindows: 24,
  minRepeatedNgramRatio: 0.65,
} as const;

export interface DegenerateOutputConfig {
  readonly trailingCharacters?: number;
  readonly ngramSize?: number;
  readonly minNgramWindows?: number;
  readonly minRepeatedNgramRatio?: number;
}

export type DegenerateOutputMessage = Pick<AssistantMessage, 'stopReason' | 'content'>;

export interface DegenerateOutputClassification {
  readonly degenerate: boolean;
  readonly reasonCode: typeof DEGENERATE_OUTPUT | null;
  readonly repeatedNgramRatio: number;
  readonly sampledNgrams: number;
}

function nonDegenerate(
  repeatedNgramRatio = 0,
  sampledNgrams = 0,
): DegenerateOutputClassification {
  return {
    degenerate: false,
    reasonCode: null,
    repeatedNgramRatio,
    sampledNgrams,
  };
}

/** Normalize changing numeric counters without hiding the surrounding loop. */
function normalizeToken(token: string): string {
  return token.replace(/\d+(?:\.\d+)?/g, '#');
}

export function repeatedNgramRatio(
  text: string,
  config: DegenerateOutputConfig = {},
): Pick<DegenerateOutputClassification, 'repeatedNgramRatio' | 'sampledNgrams'> {
  const trailingCharacters =
    config.trailingCharacters ?? DEFAULT_DEGENERATE_OUTPUT_CONFIG.trailingCharacters;
  const ngramSize = config.ngramSize ?? DEFAULT_DEGENERATE_OUTPUT_CONFIG.ngramSize;
  const tail = trailingCharacters >= 0 ? text.slice(-trailingCharacters) : text;
  const tokens = (tail.match(/\S+/gu) ?? []).map(normalizeToken);
  const sampledNgrams = Math.max(0, tokens.length - ngramSize + 1);

  if (sampledNgrams === 0 || ngramSize <= 0) {
    return { repeatedNgramRatio: 0, sampledNgrams: 0 };
  }

  const unique = new Set<string>();
  for (let index = 0; index < sampledNgrams; index += 1) {
    unique.add(tokens.slice(index, index + ngramSize).join('\u0000'));
  }

  return {
    repeatedNgramRatio: 1 - unique.size / sampledNgrams,
    sampledNgrams,
  };
}

export function classifyDegenerateOutput(
  message: DegenerateOutputMessage,
  config: DegenerateOutputConfig = {},
): DegenerateOutputClassification {
  if (
    message.stopReason !== 'length' ||
    message.content.some((block) => block.type === 'toolCall')
  ) {
    return nonDegenerate();
  }

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  const repetition = repeatedNgramRatio(text, config);
  const minNgramWindows =
    config.minNgramWindows ?? DEFAULT_DEGENERATE_OUTPUT_CONFIG.minNgramWindows;
  const minRepeatedNgramRatio =
    config.minRepeatedNgramRatio ??
    DEFAULT_DEGENERATE_OUTPUT_CONFIG.minRepeatedNgramRatio;

  if (
    repetition.sampledNgrams < minNgramWindows ||
    repetition.repeatedNgramRatio < minRepeatedNgramRatio
  ) {
    return nonDegenerate(repetition.repeatedNgramRatio, repetition.sampledNgrams);
  }

  return {
    degenerate: true,
    reasonCode: DEGENERATE_OUTPUT,
    ...repetition,
  };
}

export function isDegenerateOutput(
  message: DegenerateOutputMessage,
  config: DegenerateOutputConfig = {},
): boolean {
  return classifyDegenerateOutput(message, config).degenerate;
}
