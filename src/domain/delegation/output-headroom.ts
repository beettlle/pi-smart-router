/**
 * Delegation output headroom — SP-108.
 *
 * Reserves output budget from the model context window before provider dispatch.
 * Prevents stopReason "length" with zero output when input consumes the window.
 */

import type { Api, Model } from '@earendil-works/pi-ai/compat';

import type { ModelProfile } from '../types/index.js';

export const MIN_OUTPUT_TOKEN_FLOOR = 256;
export const DEFAULT_OUTPUT_HEADROOM_BUFFER = 64;

export const MIN_OUTPUT_TOKEN_FLOOR_ENV = 'MIN_OUTPUT_TOKEN_FLOOR';
export const OUTPUT_HEADROOM_BUFFER_ENV = 'OUTPUT_HEADROOM_BUFFER';

export interface OutputHeadroomConfig {
  readonly minOutputFloor?: number;
  readonly buffer?: number;
}

export interface OutputHeadroomFit {
  readonly kind: 'fit';
  readonly maxTokens: number;
  readonly contextWindow: number;
}

export interface OutputHeadroomNoFit {
  readonly kind: 'no_fit';
  readonly contextWindow: number;
  readonly availableOutputTokens: number;
}

export type OutputHeadroomResult = OutputHeadroomFit | OutputHeadroomNoFit;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function resolveMinOutputFloor(config?: OutputHeadroomConfig): number {
  if (config?.minOutputFloor !== undefined) {
    return config.minOutputFloor;
  }
  return readPositiveIntEnv(MIN_OUTPUT_TOKEN_FLOOR_ENV, MIN_OUTPUT_TOKEN_FLOOR);
}

export function resolveOutputHeadroomBuffer(config?: OutputHeadroomConfig): number {
  if (config?.buffer !== undefined) {
    return config.buffer;
  }
  return readPositiveIntEnv(OUTPUT_HEADROOM_BUFFER_ENV, DEFAULT_OUTPUT_HEADROOM_BUFFER);
}

export function resolveContextWindow(
  profile: ModelProfile,
  registryModel?: Model<Api>,
): number {
  return (
    profile.limits?.max_input_tokens ??
    registryModel?.contextWindow ??
    Number.MAX_SAFE_INTEGER
  );
}

export function resolveMaxOutputCap(
  profile: ModelProfile,
  registryModel?: Model<Api>,
): number {
  return (
    profile.limits?.max_output_tokens ??
    registryModel?.maxTokens ??
    Number.MAX_SAFE_INTEGER
  );
}

/**
 * Compute delegatable maxTokens and whether output headroom meets the floor.
 *
 * Validates `estimatedInputTokens + minOutputFloor <= contextWindow` and returns
 * `maxTokens = min(maxOutputCap, contextWindow - estimatedInput - buffer)`.
 */
export function computeOutputHeadroom(
  profile: ModelProfile,
  estimatedInputTokens: number,
  config?: OutputHeadroomConfig,
  registryModel?: Model<Api>,
): OutputHeadroomResult {
  const contextWindow = resolveContextWindow(profile, registryModel);
  const minFloor = resolveMinOutputFloor(config);
  const buffer = resolveOutputHeadroomBuffer(config);
  const maxOutputCap = resolveMaxOutputCap(profile, registryModel);

  if (contextWindow === Number.MAX_SAFE_INTEGER) {
    const maxTokens = Math.min(maxOutputCap, Number.MAX_SAFE_INTEGER);
    return { kind: 'fit', maxTokens, contextWindow };
  }

  const availableOutputTokens = contextWindow - estimatedInputTokens;

  if (estimatedInputTokens + minFloor > contextWindow) {
    return {
      kind: 'no_fit',
      contextWindow,
      availableOutputTokens: Math.max(0, availableOutputTokens),
    };
  }

  const rawMaxTokens = contextWindow - estimatedInputTokens - buffer;
  const maxTokens = Math.min(maxOutputCap, rawMaxTokens);

  if (maxTokens < minFloor) {
    return {
      kind: 'no_fit',
      contextWindow,
      availableOutputTokens: rawMaxTokens,
    };
  }

  return { kind: 'fit', maxTokens, contextWindow };
}
