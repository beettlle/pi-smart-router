/**
 * SP-243 (#165): peak/off-peak pricing adapters for Z.ai and DeepSeek.
 * Frozen-clock tests — `now` is injected everywhere; no wall-clock dependence.
 */
import { describe, expect, it } from 'vitest';

import type {
  ModelProfile,
  RoutingDecision,
  RoutingRequest,
} from '../../src/domain/types/index.js';
import type { CostCalibrationPrior } from '../../src/domain/routing/expected-cost.js';
import {
  DEFAULT_PEAK_PRICING_TELEMETRY_FIELDS,
  RoutingTelemetryEmitter,
  estimateRoutingCost,
} from '../../src/infrastructure/telemetry/routing-telemetry.js';
import {
  DEEPSEEK_OFF_PEAK_MULTIPLIER,
  ZAI_CREDITS_OFF_PEAK_MULTIPLIER,
  matchesDeepSeekAdapter,
  matchesZaiAdapter,
  resolveDeepSeekWindow,
  resolvePeakPricingAdjustment,
  resolveZaiWindow,
} from '../../src/domain/pricing/peak-pricing.js';

// ─── Frozen instants ─────────────────────────────────────────────────────────
// 2026-08-31 is a Monday; 2026-09-05 a Saturday; 2026-09-06 a Sunday (UTC).

/** Monday 15:00 Asia/Singapore = Monday 07:00 UTC (Z.ai peak). */
const ZAI_PEAK_MONDAY = new Date('2026-08-31T07:00:00.000Z');
/** Monday 10:00 Asia/Singapore = Monday 02:00 UTC (Z.ai off-peak). */
const ZAI_OFF_PEAK_MONDAY = new Date('2026-08-31T02:00:00.000Z');
/** Z.ai peak window opens 14:00 SGT (inclusive) = 06:00 UTC. */
const ZAI_PEAK_START = new Date('2026-08-31T06:00:00.000Z');
/** Z.ai peak window closes 18:00 SGT (exclusive) = 10:00 UTC. */
const ZAI_PEAK_END = new Date('2026-08-31T10:00:00.000Z');
/** Saturday 15:00 SGT = Saturday 07:00 UTC — weekend is off-peak all day. */
const ZAI_SATURDAY = new Date('2026-09-05T07:00:00.000Z');

/** Tuesday 02:00 UTC — inside DeepSeek peak window 01:00–04:00. */
const DS_PEAK_EARLY = new Date('2026-09-01T02:00:00.000Z');
/** Tuesday 08:00 UTC — inside DeepSeek peak window 06:00–10:00. */
const DS_PEAK_LATE = new Date('2026-09-01T08:00:00.000Z');
/** Tuesday 05:00 UTC — between the two peak windows. */
const DS_OFF_PEAK_GAP = new Date('2026-09-01T05:00:00.000Z');
/** Tuesday 10:00 UTC — peak window end is exclusive. */
const DS_PEAK_END = new Date('2026-09-01T10:00:00.000Z');
/** Saturday 02:00 UTC — weekend is off-peak even inside weekday peak hours. */
const DS_SATURDAY = new Date('2026-09-05T02:00:00.000Z');

const zaiModel = { id: 'glm-4.6', provider: 'zai' } as const;
const deepseekModel = { id: 'deepseek-chat', provider: 'deepseek' } as const;

// ─── Adapter matching ─────────────────────────────────────────────────────────

describe('peak-pricing adapter matching (SP-243)', () => {
  it('matches Z.ai providers and GLM model ids', () => {
    expect(matchesZaiAdapter({ id: 'glm-4.6', provider: 'zai' })).toBe(true);
    expect(matchesZaiAdapter({ id: 'glm-4.6', provider: 'z.ai' })).toBe(true);
    expect(matchesZaiAdapter({ id: 'glm-5.3', provider: 'zhipu' })).toBe(true);
    expect(matchesZaiAdapter({ id: 'glm-4.5-air', provider: 'openrouter' })).toBe(true);
    expect(matchesZaiAdapter({ id: 'GLM-4.6' })).toBe(true);
  });

  it('matches DeepSeek providers and model ids', () => {
    expect(matchesDeepSeekAdapter({ id: 'deepseek-chat', provider: 'deepseek' })).toBe(true);
    expect(matchesDeepSeekAdapter({ id: 'deepseek-reasoner', provider: 'openrouter' })).toBe(true);
  });

  it('does not match non-target providers (no invented clocks)', () => {
    for (const model of [
      { id: 'gpt-5.1', provider: 'openai' },
      { id: 'claude-sonnet-4.5', provider: 'anthropic' },
      { id: 'gemini-2.5-pro', provider: 'google' },
      { id: 'llama-3.3', provider: 'ollama' },
    ]) {
      expect(matchesZaiAdapter(model)).toBe(false);
      expect(matchesDeepSeekAdapter(model)).toBe(false);
    }
  });
});

// ─── Z.ai schedule (Asia/Singapore, UTC+8) ────────────────────────────────────

describe('resolveZaiWindow (SP-243)', () => {
  it('is peak Mon–Fri 14:00–18:00 SGT', () => {
    expect(resolveZaiWindow(ZAI_PEAK_MONDAY)).toBe('peak');
    expect(resolveZaiWindow(ZAI_PEAK_START)).toBe('peak');
  });

  it('is off-peak outside the window and treats 18:00 SGT as exclusive', () => {
    expect(resolveZaiWindow(ZAI_OFF_PEAK_MONDAY)).toBe('off_peak');
    expect(resolveZaiWindow(ZAI_PEAK_END)).toBe('off_peak');
  });

  it('is off-peak all day on weekends', () => {
    expect(resolveZaiWindow(ZAI_SATURDAY)).toBe('off_peak');
    expect(resolveZaiWindow(new Date('2026-09-06T07:00:00.000Z'))).toBe('off_peak');
  });
});

// ─── DeepSeek schedule (UTC) ──────────────────────────────────────────────────

describe('resolveDeepSeekWindow (SP-243)', () => {
  it('is peak Mon–Fri 01:00–04:00 and 06:00–10:00 UTC', () => {
    expect(resolveDeepSeekWindow(DS_PEAK_EARLY)).toBe('peak');
    expect(resolveDeepSeekWindow(DS_PEAK_LATE)).toBe('peak');
  });

  it('is off-peak between windows and treats 10:00 UTC as exclusive', () => {
    expect(resolveDeepSeekWindow(DS_OFF_PEAK_GAP)).toBe('off_peak');
    expect(resolveDeepSeekWindow(DS_PEAK_END)).toBe('off_peak');
  });

  it('is off-peak on weekends even inside weekday peak hours', () => {
    expect(resolveDeepSeekWindow(DS_SATURDAY)).toBe('off_peak');
  });
});

// ─── Adjustment resolution ────────────────────────────────────────────────────

describe('resolvePeakPricingAdjustment (SP-243)', () => {
  it('defaults Z.ai to the credits plan profile: off-peak 0.5× peak', () => {
    const peak = resolvePeakPricingAdjustment(zaiModel, { now: ZAI_PEAK_MONDAY });
    expect(peak.window).toBe('peak');
    expect(peak.cost_multiplier).toBe(1);
    expect(peak.adapter_id).toBe('zai');

    const offPeak = resolvePeakPricingAdjustment(zaiModel, { now: ZAI_OFF_PEAK_MONDAY });
    expect(offPeak.window).toBe('off_peak');
    expect(offPeak.cost_multiplier).toBe(ZAI_CREDITS_OFF_PEAK_MULTIPLIER);
    expect(offPeak.cost_multiplier).toBeCloseTo(0.5 * peak.cost_multiplier, 9);
  });

  it('halves DeepSeek cost off-peak (documented 0.5× on all token kinds)', () => {
    const peak = resolvePeakPricingAdjustment(deepseekModel, { now: DS_PEAK_EARLY });
    expect(peak.window).toBe('peak');
    expect(peak.cost_multiplier).toBe(1);
    expect(peak.adapter_id).toBe('deepseek');

    const offPeak = resolvePeakPricingAdjustment(deepseekModel, { now: DS_OFF_PEAK_GAP });
    expect(offPeak.window).toBe('off_peak');
    expect(offPeak.cost_multiplier).toBe(DEEPSEEK_OFF_PEAK_MULTIPLIER);
  });

  it('applies documented legacy Z.ai multipliers only via explicit override', () => {
    // Legacy GLM-5.3: 1× off-peak / 3× peak (docs.z.ai/devpack/notice/usage-revision).
    const legacy = {
      zai: { plan_profile: 'legacy', peak_multiplier: 3, off_peak_multiplier: 1 },
    } as const;

    const peak = resolvePeakPricingAdjustment(zaiModel, { now: ZAI_PEAK_MONDAY, config: legacy });
    expect(peak.cost_multiplier).toBe(3);

    const offPeak = resolvePeakPricingAdjustment(zaiModel, {
      now: ZAI_OFF_PEAK_MONDAY,
      config: legacy,
    });
    expect(offPeak.cost_multiplier).toBe(1);
  });

  it('legacy profile without explicit multipliers stays unbiased (no invented rates)', () => {
    const legacy = { zai: { plan_profile: 'legacy' } } as const;
    const peak = resolvePeakPricingAdjustment(zaiModel, { now: ZAI_PEAK_MONDAY, config: legacy });
    const offPeak = resolvePeakPricingAdjustment(zaiModel, {
      now: ZAI_OFF_PEAK_MONDAY,
      config: legacy,
    });
    expect(peak.cost_multiplier).toBe(1);
    expect(offPeak.cost_multiplier).toBe(1);
    expect(peak.window).toBe('peak');
    expect(offPeak.window).toBe('off_peak');
  });

  it('returns window none with multiplier 1 for non-target models', () => {
    const result = resolvePeakPricingAdjustment(
      { id: 'gpt-5.1', provider: 'openai' },
      { now: DS_PEAK_EARLY },
    );
    expect(result).toEqual({ window: 'none', cost_multiplier: 1, adapter_id: null });
  });

  it('fails open when disabled or when the injected clock is invalid', () => {
    expect(
      resolvePeakPricingAdjustment(zaiModel, {
        now: ZAI_PEAK_MONDAY,
        config: { enabled: false },
      }),
    ).toEqual({ window: 'none', cost_multiplier: 1, adapter_id: null });

    expect(
      resolvePeakPricingAdjustment(zaiModel, { now: new Date(Number.NaN) }),
    ).toEqual({ window: 'none', cost_multiplier: 1, adapter_id: null });
  });

  it('honours a DeepSeek off-peak multiplier override', () => {
    const result = resolvePeakPricingAdjustment(deepseekModel, {
      now: DS_OFF_PEAK_GAP,
      config: { deepseek: { off_peak_multiplier: 0.4 } },
    });
    expect(result.cost_multiplier).toBe(0.4);
  });
});

// ─── estimateRoutingCost wiring (SP-243) ─────────────────────────────────────

describe('estimateRoutingCost peak soft-bias (SP-243)', () => {
  const glmModel: ModelProfile = {
    id: 'glm-4.6',
    provider: 'zai',
    tier: 'economical-cloud',
    capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 },
    pricing: { fallback_cost_per_1m: 1.2 },
  };
  const deepseekProfile: ModelProfile = {
    id: 'deepseek-chat',
    provider: 'deepseek',
    tier: 'economical-cloud',
    capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 },
    pricing: { fallback_cost_per_1m: 0.56 },
  };
  const gptProfile: ModelProfile = {
    id: 'gpt-5.1',
    provider: 'openai',
    tier: 'frontier-cloud',
    capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
    pricing: { fallback_cost_per_1m: 3.0 },
  };
  const request: RoutingRequest = {
    request_id: 'req-peak',
    session_id: 'sess-peak',
    prompt_text: 'hello',
    turn_type: 'main_loop',
    estimated_input_tokens: 1_000_000,
  };

  it('changes the Z.ai estimate inside vs outside the SGT peak window', () => {
    const peak = estimateRoutingCost(glmModel, request, null, null, { now: ZAI_PEAK_MONDAY });
    const offPeak = estimateRoutingCost(glmModel, request, null, null, {
      now: ZAI_OFF_PEAK_MONDAY,
    });

    expect(peak).toBeCloseTo(1.2, 9);
    expect(offPeak).toBeCloseTo(0.5 * peak, 9);
  });

  it('changes the DeepSeek estimate inside vs outside the UTC peak windows', () => {
    const peak = estimateRoutingCost(deepseekProfile, request, null, null, {
      now: DS_PEAK_LATE,
    });
    const offPeak = estimateRoutingCost(deepseekProfile, request, null, null, {
      now: DS_OFF_PEAK_GAP,
    });

    expect(peak).toBeCloseTo(0.56, 9);
    expect(offPeak).toBeCloseTo(0.5 * peak, 9);
  });

  it('leaves non-target providers unchanged and composes with the SP-242 calibration prior', () => {
    const peak = estimateRoutingCost(gptProfile, request, null, null, { now: DS_PEAK_EARLY });
    expect(peak).toBeCloseTo(3.0, 9);

    const prior: CostCalibrationPrior = {
      byModel: new Map([
        ['deepseek-chat', { key: 'deepseek-chat', kind: 'model', ratio: 2, samples: 5 }],
      ]),
      byTier: new Map(),
    };
    // Soft bias composes: 0.56 × 0.5 (off-peak) × 2 (warm calibration ratio).
    const calibrated = estimateRoutingCost(deepseekProfile, request, null, prior, {
      now: DS_OFF_PEAK_GAP,
    });
    expect(calibrated).toBeCloseTo(0.56 * 0.5 * 2, 9);
  });
});

// ─── Telemetry pricing_window field (SP-243) ─────────────────────────────────

describe('pricing_window telemetry (SP-243)', () => {
  const fleet: ModelProfile[] = [
    {
      id: 'glm-4.6',
      provider: 'zai',
      tier: 'economical-cloud',
      capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 },
      pricing: { fallback_cost_per_1m: 1.2 },
    },
    {
      id: 'gpt-5.1',
      provider: 'openai',
      tier: 'frontier-cloud',
      capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
      pricing: { fallback_cost_per_1m: 3.0 },
    },
  ];

  const request: RoutingRequest = {
    request_id: 'req-tw',
    session_id: 'sess-tw',
    prompt_text: 'hello',
    turn_type: 'main_loop',
  };

  function decisionFor(modelId: string): RoutingDecision {
    return {
      request_id: 'req-tw',
      selected_model_id: modelId,
      tier: 'economical-cloud',
      stage: 'fallback',
      reason_code: 'safe_cloud_default',
      routing_latency_ms: 1,
      pin_reason: null,
    };
  }

  it('records peak / off_peak for a Z.ai selection using the emitter clock', () => {
    const peakEmitter = new RoutingTelemetryEmitter({
      clock: () => ZAI_PEAK_MONDAY.toISOString(),
      fleet,
    });
    expect(peakEmitter.emit(request, decisionFor('glm-4.6')).pricing_window).toBe('peak');

    const offPeakEmitter = new RoutingTelemetryEmitter({
      clock: () => ZAI_OFF_PEAK_MONDAY.toISOString(),
      fleet,
    });
    expect(offPeakEmitter.emit(request, decisionFor('glm-4.6')).pricing_window).toBe('off_peak');
  });

  it('records none for non-target and unknown models', () => {
    const emitter = new RoutingTelemetryEmitter({
      clock: () => ZAI_PEAK_MONDAY.toISOString(),
      fleet,
    });
    expect(emitter.emit(request, decisionFor('gpt-5.1')).pricing_window).toBe('none');
    expect(emitter.emit(request, decisionFor('not-in-fleet')).pricing_window).toBe('none');
  });

  it('records none when no fleet is configured (fail open)', () => {
    const emitter = new RoutingTelemetryEmitter({
      clock: () => ZAI_PEAK_MONDAY.toISOString(),
    });
    expect(emitter.emit(request, decisionFor('glm-4.6')).pricing_window).toBe('none');
    expect(DEFAULT_PEAK_PRICING_TELEMETRY_FIELDS.pricing_window).toBe('none');
  });
});
