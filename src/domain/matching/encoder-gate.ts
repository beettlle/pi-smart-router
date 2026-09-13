/**
 * Encoder cascade gate (SP-291, #173 part 1) — pure domain, unit-testable.
 *
 * Opt-in per-prompt encoder selection: when `hydra.encoder_cascade.enabled`
 * is true, prompts whose estimated token count reaches `token_threshold` are
 * routed to the long-context encoder (Granite 97M, SP-156) instead of the
 * primary `hydra.encoder` (MiniLM, 512-token window). Default off: existing
 * single-encoder installs are unaffected and pay zero added cost — the gate
 * is pre-embedding arithmetic only.
 *
 * Token estimate parity: this module reuses the same estimator as the
 * turn-envelope stage (`src/domain/pipeline/turn-envelope-stage.ts`):
 * `estimated_input_tokens ?? prompt_text.length`. Callers pass
 * `RoutingRequest.estimated_input_tokens` via options when present; the
 * fallback is the prompt's character length.
 *
 * Hard constraint (#173): encoders embed into different vector spaces — the
 * gate only SELECTS an encoder; per-encoder artifacts (centroids, learned
 * projection) and the cascading embedder land in SP-292. Never mix spaces.
 */

import type { Encoder, EncoderCascadeConfig } from '../types/schemas.js';
import { DEFAULT_ENCODER } from '../types/schemas.js';

/** Gate outcomes per #173; attached to decision telemetry. */
export type EncoderGateReasonCode =
  /** Cascade disabled — every prompt uses the primary encoder. */
  | 'cascade_disabled'
  /** Estimate below the configured threshold — primary encoder. */
  | 'under_threshold'
  /** Estimate at/over the threshold — long-context encoder selected. */
  | 'over_threshold'
  /**
   * Over threshold but the long-context encoder is unavailable — degrade to
   * the primary encoder (continuity of routing wins; never mix vector spaces).
   */
  | 'granite_fallback';

export interface EncoderGateDecision {
  readonly encoder: Encoder;
  readonly reason_code: EncoderGateReasonCode;
  readonly token_estimate: number;
}

export interface EncoderGateOptions {
  /**
   * Precomputed token estimate — pass `RoutingRequest.estimated_input_tokens`
   * when set. Falls back to `prompt.length`, exactly mirroring the
   * turn-envelope stage estimator (`estimated_input_tokens ?? prompt_text.length`).
   */
  readonly estimatedTokens?: number | undefined;
  /**
   * Primary encoder used when the cascade is disabled or does not fire.
   * Default: DEFAULT_ENCODER ('minilm'), matching `hydra.encoder` defaults.
   */
  readonly primaryEncoder?: Encoder | undefined;
  /**
   * Long-context encoder availability signal (SP-292 embedder layer owns
   * session/artifact health). When explicitly false, an over-threshold prompt
   * degrades to the primary encoder with reason `granite_fallback`.
   * Default: assumed available.
   */
  readonly longContextAvailable?: boolean;
}

/**
 * Turn-envelope-parity token estimator: a caller-supplied estimate wins;
 * otherwise the prompt's character length is the proxy (same formula as
 * `turn-envelope-stage.ts` step 2b breakeven arithmetic).
 */
export function estimatePromptTokens(
  prompt: string,
  estimatedTokens?: number,
): number {
  return estimatedTokens ?? prompt.length;
}

/**
 * Select the encoder for a prompt. Pure: no I/O, no ONNX sessions.
 *
 * Boundary semantics (per #173 eval table): `token_estimate >= token_threshold`
 * routes to the long-context encoder; strictly below stays on the primary.
 */
export function selectEncoderForPrompt(
  prompt: string,
  config: EncoderCascadeConfig,
  options?: EncoderGateOptions,
): EncoderGateDecision {
  const primary = options?.primaryEncoder ?? DEFAULT_ENCODER;
  const tokenEstimate = estimatePromptTokens(prompt, options?.estimatedTokens);

  if (!config.enabled) {
    return {
      encoder: primary,
      reason_code: 'cascade_disabled',
      token_estimate: tokenEstimate,
    };
  }

  if (tokenEstimate < config.token_threshold) {
    return {
      encoder: primary,
      reason_code: 'under_threshold',
      token_estimate: tokenEstimate,
    };
  }

  if (options?.longContextAvailable === false) {
    return {
      encoder: primary,
      reason_code: 'granite_fallback',
      token_estimate: tokenEstimate,
    };
  }

  return {
    encoder: config.long_context_encoder,
    reason_code: 'over_threshold',
    token_estimate: tokenEstimate,
  };
}
