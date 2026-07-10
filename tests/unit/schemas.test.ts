import { describe, expect, it } from 'vitest';

import {
  OperatorConfigSchema,
  PlanningDelegateConfigSchema,
  CompressedContextSpecSchema,
  SaarConfigSchema,
  SaarSessionStateSchema,
} from '../../src/domain/types/schemas.js';

const validSaarConfig = {
  planning_turn_buffer: 2,
  prefix_cache_weight: 0.2,
  idle_timeout_seconds: 300,
  switch_threshold: 0.5,
};

const validPlanningDelegateConfig = {
  enabled: true,
  compressed_context: {
    max_messages: 12,
    max_tokens: 16_384,
    exclude_execution_history: true,
  },
};

describe('CompressedContextSpecSchema', () => {
  it('accepts valid compressed context spec', () => {
    expect(
      CompressedContextSpecSchema.safeParse(validPlanningDelegateConfig.compressed_context)
        .success,
    ).toBe(true);
  });

  it('rejects non-positive max_messages', () => {
    const result = CompressedContextSpecSchema.safeParse({
      ...validPlanningDelegateConfig.compressed_context,
      max_messages: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('PlanningDelegateConfigSchema', () => {
  it('accepts valid planning delegate config', () => {
    expect(PlanningDelegateConfigSchema.safeParse(validPlanningDelegateConfig).success).toBe(
      true,
    );
  });

  it('rejects non-positive max_tokens in compressed_context', () => {
    const result = PlanningDelegateConfigSchema.safeParse({
      ...validPlanningDelegateConfig,
      compressed_context: {
        ...validPlanningDelegateConfig.compressed_context,
        max_tokens: -1,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('SaarConfigSchema', () => {
  it('accepts valid SAAR config', () => {
    expect(SaarConfigSchema.safeParse(validSaarConfig).success).toBe(true);
  });

  it('rejects non-positive planning_turn_buffer', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      planning_turn_buffer: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects prefix_cache_weight above 1', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      prefix_cache_weight: 1.01,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative prefix_cache_weight', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      prefix_cache_weight: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive idle_timeout_seconds', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      idle_timeout_seconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects switch_threshold above 1', () => {
    const result = SaarConfigSchema.safeParse({
      ...validSaarConfig,
      switch_threshold: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe('SaarSessionStateSchema', () => {
  it('accepts valid SAAR session state', () => {
    const result = SaarSessionStateSchema.safeParse({
      turn_index: 0,
      hard_lock: false,
      last_activity_at: '2026-07-08T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative turn_index', () => {
    const result = SaarSessionStateSchema.safeParse({
      turn_index: -1,
      hard_lock: false,
      last_activity_at: '2026-07-08T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
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
      planning_delegate: validPlanningDelegateConfig,
    });
    expect(result.success).toBe(false);
  });

  it('requires planning_delegate on operator config', () => {
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
      saar: validSaarConfig,
    });
    expect(result.success).toBe(false);
  });
});

describe('OperatorConfigSchema pin_only_fallback (SP-161)', () => {
  it('defaults pin_only_fallback to false when omitted', () => {
    const result = OperatorConfigSchema.parse({
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
      saar: validSaarConfig,
      planning_delegate: validPlanningDelegateConfig,
    });

    expect(result.pin_only_fallback).toBe(false);
  });
});
