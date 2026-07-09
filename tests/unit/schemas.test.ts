// @ts-nocheck
import assert from 'node:assert/strict';
import * as nodeTest from 'node:test';

const vitest = process.env.VITEST ? await import('vitest') : null;
const describe = vitest?.describe ?? nodeTest.describe;
const it = vitest?.it ?? nodeTest.it;

const {
  OperatorConfigSchema,
  SaarConfigSchema,
  SaarSessionStateSchema,
} = await import('../../src/domain/types/schemas.ts');

const validSaarConfig = {
  planning_turn_buffer: 2,
  prefix_cache_weight: 0.2,
  idle_timeout_seconds: 300,
  switch_threshold: 0.5,
};

function expectEqual(actual, expected) {
  if (vitest) {
    vitest.expect(actual).toBe(expected);
  } else {
    assert.equal(actual, expected);
  }
}

describe('SaarConfigSchema', () => {
  it('accepts valid SAAR config', () => {
    expectEqual(SaarConfigSchema.safeParse(validSaarConfig).success, true);
  });

  it('rejects non-positive planning_turn_buffer', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      planning_turn_buffer: 0,
    });
    expectEqual(result.success, false);
  });

  it('rejects prefix_cache_weight above 1', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      prefix_cache_weight: 1.01,
    });
    expectEqual(result.success, false);
  });

  it('rejects negative prefix_cache_weight', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      prefix_cache_weight: -0.1,
    });
    expectEqual(result.success, false);
  });

  it('rejects non-positive idle_timeout_seconds', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      idle_timeout_seconds: 0,
    });
    expectEqual(result.success, false);
  });

  it('rejects switch_threshold above 1', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      switch_threshold: 2,
    });
    expectEqual(result.success, false);
  });
});

describe('SaarSessionStateSchema', () => {
  it('accepts valid SAAR session state', () => {
    const result = SaarSessionStateSchema.safeParse({
      turn_index: 0,
      hard_lock: false,
      last_activity_at: '2026-07-08T12:00:00.000Z',
    });
    expectEqual(result.success, true);
  });

  it('rejects negative turn_index', () => {
    const result = SaarSessionStateSchema.safeParse({
      turn_index: -1,
      hard_lock: false,
      last_activity_at: '2026-07-08T12:00:00.000Z',
    });
    expectEqual(result.success, false);
  });
});

describe('OperatorConfigSchema SAAR section', () => {
  it('requires saar on operator config', () => {
    const result = OperatorConfigSchema.safeParse({
      frugality: {
        lambda_cost: 0.5,
        lambda_latency: 0.1,
        lambda_verbosity: 0.15,
      },
      loop_escalation: { threshold: 3 },
      pricing: { staleness_days: 14 },
      local: {
        min_memory_gb_full: 16,
        min_memory_gb_classification: 8,
        battery_threshold_pct: 20,
      },
      hydra: { artifact_cache_path: '.pi-smart-router/models/' },
      low_intensity: {
        weights: {
          prompt_shortness: 0.1,
          token_shortness: 0.1,
          cyclomatic_low: 0.1,
          trivial_signal: 0.1,
          complex_inverse: 0.1,
          triage_verdict: 0.1,
          turn_type: 0.1,
          no_tool_context: 0.1,
          message_shallow: 0.1,
          prose_ratio: 0.1,
          requirement_low: 0.1,
          cluster_signal: 0.1,
        },
        high_threshold: 0.65,
        low_threshold: 0.35,
        p_success_alpha: 0.5,
      },
    });
    expectEqual(result.success, false);
  });
});
