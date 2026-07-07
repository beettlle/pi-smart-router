import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OUTPUT_HEADROOM_BUFFER,
  MIN_OUTPUT_TOKEN_FLOOR,
  computeOutputHeadroom,
} from '../../src/domain/delegation/output-headroom.js';
import type { ModelProfile } from '../../src/domain/types/index.js';

function makeProfile(
  overrides: Partial<ModelProfile> & { id: string },
): ModelProfile {
  return {
    tier: 'economical-cloud',
    provider: 'google',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

describe('output headroom (SP-108)', () => {
  it('exports MIN_OUTPUT_TOKEN_FLOOR default 256 and buffer constant', () => {
    expect(MIN_OUTPUT_TOKEN_FLOOR).toBe(256);
    expect(DEFAULT_OUTPUT_HEADROOM_BUFFER).toBe(64);
  });

  it('returns no_fit when 34K input exceeds a 32K context window', () => {
    const profile = makeProfile({
      id: 'gemini-flash-lite',
      limits: { max_input_tokens: 32_768, max_output_tokens: 8_192 },
    });

    const result = computeOutputHeadroom(profile, 34_000);

    expect(result.kind).toBe('no_fit');
    if (result.kind === 'no_fit') {
      expect(result.contextWindow).toBe(32_768);
      expect(result.availableOutputTokens).toBe(0);
    }
  });

  it('returns positive maxTokens when input leaves healthy output margin', () => {
    const profile = makeProfile({
      id: 'gemini-flash-lite',
      limits: { max_input_tokens: 32_768, max_output_tokens: 8_192 },
    });

    const result = computeOutputHeadroom(profile, 10_000);

    expect(result).toEqual({
      kind: 'fit',
      maxTokens: 8_192,
      contextWindow: 32_768,
    });
  });

  it('caps maxTokens by remaining window minus buffer when output cap is larger', () => {
    const profile = makeProfile({
      id: 'large-output',
      limits: { max_input_tokens: 32_768, max_output_tokens: 16_384 },
    });

    const result = computeOutputHeadroom(profile, 30_000);

    expect(result).toEqual({
      kind: 'fit',
      maxTokens: 32_768 - 30_000 - DEFAULT_OUTPUT_HEADROOM_BUFFER,
      contextWindow: 32_768,
    });
  });

  it('returns no_fit when remaining window is below the output floor', () => {
    const profile = makeProfile({
      id: 'tight-window',
      limits: { max_input_tokens: 32_768, max_output_tokens: 16_384 },
    });

    const result = computeOutputHeadroom(profile, 32_500, { minOutputFloor: 256 });

    expect(result.kind).toBe('no_fit');
  });
});
