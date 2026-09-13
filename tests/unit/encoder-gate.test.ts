/**
 * Encoder cascade gate tests (SP-291, #173 part 1).
 *
 * Covers: config schema defaults (cascade default OFF; existing installs
 * unaffected), threshold boundaries, disabled behavior, estimator parity with
 * the turn-envelope stage, and the degrade-never-mix fallback path.
 */

import { describe, expect, it } from 'vitest';

import {
  estimatePromptTokens,
  selectEncoderForPrompt,
} from '../../src/domain/matching/encoder-gate.js';
import {
  DEFAULT_ENCODER,
  DEFAULT_ENCODER_CASCADE_CONFIG,
  EncoderCascadeConfigSchema,
  HydraConfigSchema,
  type EncoderCascadeConfig,
} from '../../src/domain/types/schemas.js';

function cascadeConfig(
  overrides?: Partial<EncoderCascadeConfig>,
): EncoderCascadeConfig {
  return { ...DEFAULT_ENCODER_CASCADE_CONFIG, ...overrides };
}

const ENABLED = cascadeConfig({ enabled: true });

describe('EncoderCascadeConfigSchema (default off)', () => {
  it('applies #173 defaults: disabled, granite long-context, 512 threshold', () => {
    expect(EncoderCascadeConfigSchema.parse({})).toEqual({
      enabled: false,
      long_context_encoder: 'granite',
      token_threshold: 512,
    });
  });

  it('DEFAULT_ENCODER_CASCADE_CONFIG is disabled (existing installs unaffected)', () => {
    expect(DEFAULT_ENCODER_CASCADE_CONFIG).toEqual({
      enabled: false,
      long_context_encoder: 'granite',
      token_threshold: 512,
    });
    expect(DEFAULT_ENCODER_CASCADE_CONFIG.enabled).toBe(false);
  });

  it('hydra config without encoder_cascade still parses and defaults off', () => {
    const parsed = HydraConfigSchema.parse({
      artifact_cache_path: '.pi-smart-router/models/',
    });
    expect(parsed.encoder).toBe(DEFAULT_ENCODER);
    expect(parsed.encoder_cascade).toEqual(DEFAULT_ENCODER_CASCADE_CONFIG);
  });

  it('rejects non-positive thresholds', () => {
    expect(EncoderCascadeConfigSchema.safeParse({ token_threshold: 0 }).success).toBe(false);
    expect(EncoderCascadeConfigSchema.safeParse({ token_threshold: -1 }).success).toBe(false);
  });

  it('rejects unknown long-context encoders', () => {
    expect(
      EncoderCascadeConfigSchema.safeParse({ long_context_encoder: 'nope' }).success,
    ).toBe(false);
  });
});

describe('selectEncoderForPrompt — disabled', () => {
  it('always selects the primary encoder with cascade_disabled, regardless of length', () => {
    const short = selectEncoderForPrompt('hi', DEFAULT_ENCODER_CASCADE_CONFIG);
    expect(short).toEqual({
      encoder: 'minilm',
      reason_code: 'cascade_disabled',
      token_estimate: 2,
    });

    const long = selectEncoderForPrompt(
      'x'.repeat(100_000),
      DEFAULT_ENCODER_CASCADE_CONFIG,
    );
    expect(long.encoder).toBe('minilm');
    expect(long.reason_code).toBe('cascade_disabled');
    expect(long.token_estimate).toBe(100_000);
  });

  it('honors a custom primary encoder when disabled', () => {
    const decision = selectEncoderForPrompt('x'.repeat(10_000), DEFAULT_ENCODER_CASCADE_CONFIG, {
      primaryEncoder: 'granite',
    });
    expect(decision.encoder).toBe('granite');
    expect(decision.reason_code).toBe('cascade_disabled');
  });
});

describe('selectEncoderForPrompt — threshold boundaries', () => {
  it('threshold - 1 stays on the primary encoder (under_threshold)', () => {
    const decision = selectEncoderForPrompt(
      'x'.repeat(511),
      ENABLED,
    );
    expect(decision).toEqual({
      encoder: 'minilm',
      reason_code: 'under_threshold',
      token_estimate: 511,
    });
  });

  it('exactly threshold routes to the long-context encoder (over_threshold)', () => {
    const decision = selectEncoderForPrompt('x'.repeat(512), ENABLED);
    expect(decision).toEqual({
      encoder: 'granite',
      reason_code: 'over_threshold',
      token_estimate: 512,
    });
  });

  it('threshold + 1 routes to the long-context encoder (over_threshold)', () => {
    const decision = selectEncoderForPrompt('x'.repeat(513), ENABLED);
    expect(decision.encoder).toBe('granite');
    expect(decision.reason_code).toBe('over_threshold');
  });

  it('respects a custom token_threshold', () => {
    const config = cascadeConfig({ enabled: true, token_threshold: 100 });
    expect(selectEncoderForPrompt('x'.repeat(99), config).reason_code).toBe('under_threshold');
    expect(selectEncoderForPrompt('x'.repeat(100), config).reason_code).toBe('over_threshold');
  });
});

describe('selectEncoderForPrompt — estimator parity with turn-envelope stage', () => {
  // turn-envelope-stage.ts:240 — request.estimated_input_tokens ?? request.prompt_text.length
  it('falls back to prompt character length when no estimate is supplied', () => {
    expect(estimatePromptTokens('abcd')).toBe(4);
    expect(selectEncoderForPrompt('abcd', ENABLED).token_estimate).toBe(4);
  });

  it('a caller-supplied estimate wins over character length', () => {
    expect(estimatePromptTokens('abcd', 600)).toBe(600);

    const prompt = 'x'.repeat(10); // length well under 512
    const decision = selectEncoderForPrompt(prompt, ENABLED, { estimatedTokens: 600 });
    expect(decision.token_estimate).toBe(600);
    expect(decision.reason_code).toBe('over_threshold');
    expect(decision.encoder).toBe('granite');
  });

  it('a low supplied estimate keeps a long prompt on the primary encoder', () => {
    const prompt = 'x'.repeat(10_000); // length well over 512
    const decision = selectEncoderForPrompt(prompt, ENABLED, { estimatedTokens: 100 });
    expect(decision.token_estimate).toBe(100);
    expect(decision.reason_code).toBe('under_threshold');
    expect(decision.encoder).toBe('minilm');
  });

  it('matches the turn-envelope formula estimated_input_tokens ?? prompt_text.length', () => {
    // Simulated RoutingRequest shapes mirroring the stage's arithmetic.
    const withEstimate = { estimated_input_tokens: 700, prompt_text: 'short' };
    const withoutEstimate = { estimated_input_tokens: undefined, prompt_text: 'y'.repeat(600) };

    for (const request of [withEstimate, withoutEstimate]) {
      const stageEstimate = request.estimated_input_tokens ?? request.prompt_text.length;
      const gate = selectEncoderForPrompt(request.prompt_text, ENABLED, {
        estimatedTokens: request.estimated_input_tokens,
      });
      expect(gate.token_estimate).toBe(stageEstimate);
      expect(gate.encoder).toBe('granite'); // both estimates >= 512
    }
  });
});

describe('selectEncoderForPrompt — degrade, never mix', () => {
  it('over-threshold + long-context unavailable → primary with granite_fallback', () => {
    const decision = selectEncoderForPrompt('x'.repeat(600), ENABLED, {
      longContextAvailable: false,
    });
    expect(decision).toEqual({
      encoder: 'minilm',
      reason_code: 'granite_fallback',
      token_estimate: 600,
    });
  });

  it('availability flag does not affect under-threshold or disabled decisions', () => {
    expect(
      selectEncoderForPrompt('x'.repeat(10), ENABLED, { longContextAvailable: false })
        .reason_code,
    ).toBe('under_threshold');
    expect(
      selectEncoderForPrompt('x'.repeat(10_000), DEFAULT_ENCODER_CASCADE_CONFIG, {
        longContextAvailable: false,
      }).reason_code,
    ).toBe('cascade_disabled');
  });
});
