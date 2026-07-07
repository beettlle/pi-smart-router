import { afterEach, describe, expect, it } from 'vitest';

import {
  CONTEXT_FIT_EXCEEDED,
  CONTEXT_FIT_SAFETY_MARGIN_ENV,
  DEFAULT_CONTEXT_FIT_SAFETY_MARGIN,
  filterFleetByContextFit,
} from '../../src/domain/routing/context-fit.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

function makeProfile(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'test',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-context-fit-1',
    session_id: 'sess-context-fit-1',
    prompt_text: 'hello',
    ...overrides,
  };
}

const fleet: ModelProfile[] = [
  makeProfile({
    id: 'small-window',
    tier: 'economical-cloud',
    limits: { max_input_tokens: 32_768 },
  }),
  makeProfile({
    id: 'large-window',
    tier: 'frontier-cloud',
    limits: { max_input_tokens: 200_000 },
  }),
  makeProfile({
    id: 'unknown-window',
    tier: 'economical-cloud',
  }),
];

describe('filterFleetByContextFit', () => {
  const originalMargin = process.env[CONTEXT_FIT_SAFETY_MARGIN_ENV];

  afterEach(() => {
    if (originalMargin === undefined) {
      delete process.env[CONTEXT_FIT_SAFETY_MARGIN_ENV];
    } else {
      process.env[CONTEXT_FIT_SAFETY_MARGIN_ENV] = originalMargin;
    }
  });

  it('keeps all models when estimated tokens fit every declared window', () => {
    const result = filterFleetByContextFit(
      fleet,
      makeRequest({ estimated_input_tokens: 1_000 }),
    );

    expect(result.effectiveFleet.map((m) => m.id)).toEqual([
      'small-window',
      'large-window',
      'unknown-window',
    ]);
    expect(result.rejected).toEqual([]);
  });

  it('excludes models with a 32K window when request is 34K tokens', () => {
    const result = filterFleetByContextFit(
      fleet,
      makeRequest({ estimated_input_tokens: 34_000 }),
    );

    expect(result.effectiveFleet.map((m) => m.id)).toEqual([
      'large-window',
      'unknown-window',
    ]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      model_id: 'small-window',
      rejected_reason: CONTEXT_FIT_EXCEEDED,
    });
    expect(result.rejected[0]?.shortfall).toBeGreaterThan(0);
  });

  it('applies default safety margin of 0.90 to the declared window', () => {
    const margin = DEFAULT_CONTEXT_FIT_SAFETY_MARGIN;
    const maxInput = 32_768;
    const effectiveLimit = Math.floor(maxInput * margin);

    const fits = filterFleetByContextFit(
      [makeProfile({ id: 'edge', tier: 'economical-cloud', limits: { max_input_tokens: maxInput } })],
      makeRequest({ estimated_input_tokens: effectiveLimit }),
    );
    const rejects = filterFleetByContextFit(
      [makeProfile({ id: 'edge', tier: 'economical-cloud', limits: { max_input_tokens: maxInput } })],
      makeRequest({ estimated_input_tokens: effectiveLimit + 1 }),
    );

    expect(fits.effectiveFleet).toHaveLength(1);
    expect(rejects.rejected).toHaveLength(1);
  });

  it('reads safety margin from CONTEXT_FIT_SAFETY_MARGIN env', () => {
    process.env[CONTEXT_FIT_SAFETY_MARGIN_ENV] = '0.5';

    const narrowFleet = [
      makeProfile({
        id: 'mid-window',
        tier: 'economical-cloud',
        limits: { max_input_tokens: 20_000 },
      }),
    ];

    const fits = filterFleetByContextFit(
      narrowFleet,
      makeRequest({ estimated_input_tokens: 10_000 }),
    );
    const rejects = filterFleetByContextFit(
      narrowFleet,
      makeRequest({ estimated_input_tokens: 10_001 }),
    );

    expect(fits.effectiveFleet).toHaveLength(1);
    expect(rejects.rejected).toHaveLength(1);
  });

  it('ignores invalid CONTEXT_FIT_SAFETY_MARGIN values and uses default', () => {
    process.env[CONTEXT_FIT_SAFETY_MARGIN_ENV] = 'not-a-number';

    const result = filterFleetByContextFit(
      fleet,
      makeRequest({ estimated_input_tokens: 34_000 }),
    );

    expect(result.rejected.some((c) => c.model_id === 'small-window')).toBe(true);
  });

  it('honors explicit config safety margin over env', () => {
    process.env[CONTEXT_FIT_SAFETY_MARGIN_ENV] = '0.5';

    const result = filterFleetByContextFit(
      [
        makeProfile({
          id: 'mid-window',
          tier: 'economical-cloud',
          limits: { max_input_tokens: 20_000 },
        }),
      ],
      makeRequest({ estimated_input_tokens: 18_000 }),
      { safetyMargin: 0.95 },
    );

    expect(result.effectiveFleet).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('retains models without declared max_input_tokens', () => {
    const result = filterFleetByContextFit(
      [makeProfile({ id: 'unknown-window', tier: 'economical-cloud' })],
      makeRequest({ estimated_input_tokens: 1_000_000 }),
    );

    expect(result.effectiveFleet).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it('uses prompt_text length when estimated_input_tokens is absent', () => {
    const prompt = 'x'.repeat(40_000);
    const result = filterFleetByContextFit(
      fleet,
      makeRequest({ prompt_text: prompt }),
    );

    expect(result.rejected.some((c) => c.model_id === 'small-window')).toBe(true);
  });

  it('does not filter when force_model_id is set', () => {
    const result = filterFleetByContextFit(
      fleet,
      makeRequest({
        estimated_input_tokens: 1_000_000,
        force_model_id: 'small-window',
      }),
    );

    expect(result.effectiveFleet).toEqual(fleet);
    expect(result.rejected).toEqual([]);
  });
});
