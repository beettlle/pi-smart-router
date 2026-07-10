/**
 * Quality retention regression checks for pin-only fallback trigger — SP-162, #83.
 *
 * Compares shadow eval harness QR against a frozen baseline and recommends
 * enabling `pin_only_fallback` when regression exceeds a configurable threshold.
 */

import type { HarnessAggregateMetrics } from './harness-tracks.js';

/** Default absolute QR drop that triggers pin-only fallback (5 percentage points). */
export const DEFAULT_QR_REGRESSION_THRESHOLD = 0.05;

export interface QualityRetentionCheckInput {
  readonly shadowQualityRetention: number;
  readonly baselineQualityRetention: number;
  readonly regressionThreshold?: number;
}

export interface QualityRetentionCheckResult {
  readonly shadow_quality_retention: number;
  readonly baseline_quality_retention: number;
  readonly regression_delta: number;
  readonly regression_threshold: number;
  readonly quality_regressed: boolean;
}

/** Absolute QR drop from baseline to shadow (clamped at zero). */
export function computeQualityRetentionRegression(
  input: QualityRetentionCheckInput,
): QualityRetentionCheckResult {
  const threshold = input.regressionThreshold ?? DEFAULT_QR_REGRESSION_THRESHOLD;
  const regressionDelta = Math.max(
    0,
    input.baselineQualityRetention - input.shadowQualityRetention,
  );

  return {
    shadow_quality_retention: input.shadowQualityRetention,
    baseline_quality_retention: input.baselineQualityRetention,
    regression_delta: regressionDelta,
    regression_threshold: threshold,
    quality_regressed: regressionDelta > threshold,
  };
}

export type PinOnlyFallbackTriggerSource = 'manual' | 'eval_regression' | 'none';

export interface PinOnlyFallbackTriggerInput {
  readonly shadowQualityRetention: number;
  readonly baselineQualityRetention: number;
  readonly regressionThreshold?: number;
  /**
   * Operator config `pin_only_fallback` when set explicitly.
   * `true` forces emergency mode on; `false` disables auto-trigger.
   */
  readonly manualOverride?: boolean;
  /** When true, skip automated eval regression trigger. */
  readonly disableAutoTrigger?: boolean;
}

export interface PinOnlyFallbackTriggerResult {
  readonly pin_only_fallback: boolean;
  readonly trigger_source: PinOnlyFallbackTriggerSource;
  readonly quality_check: QualityRetentionCheckResult;
}

/**
 * Resolve whether pin-only fallback should be active.
 * Manual operator override wins over automated eval regression.
 */
export function evaluatePinOnlyFallbackTrigger(
  input: PinOnlyFallbackTriggerInput,
): PinOnlyFallbackTriggerResult {
  const qualityCheck = computeQualityRetentionRegression(
    input.regressionThreshold === undefined
      ? {
          shadowQualityRetention: input.shadowQualityRetention,
          baselineQualityRetention: input.baselineQualityRetention,
        }
      : {
          shadowQualityRetention: input.shadowQualityRetention,
          baselineQualityRetention: input.baselineQualityRetention,
          regressionThreshold: input.regressionThreshold,
        },
  );

  if (input.manualOverride === true) {
    return {
      pin_only_fallback: true,
      trigger_source: 'manual',
      quality_check: qualityCheck,
    };
  }

  if (input.manualOverride === false) {
    return {
      pin_only_fallback: false,
      trigger_source: 'none',
      quality_check: qualityCheck,
    };
  }

  if (!input.disableAutoTrigger && qualityCheck.quality_regressed) {
    return {
      pin_only_fallback: true,
      trigger_source: 'eval_regression',
      quality_check: qualityCheck,
    };
  }

  return {
    pin_only_fallback: false,
    trigger_source: 'none',
    quality_check: qualityCheck,
  };
}

/** Evaluate trigger from aggregate harness metrics (shadow vs baseline JSON). */
export function evaluatePinOnlyFallbackFromHarness(
  shadow: Pick<HarnessAggregateMetrics['tracks']['capability'], 'mean_quality_retention'>,
  baseline: Pick<HarnessAggregateMetrics['tracks']['capability'], 'mean_quality_retention'>,
  options?: Omit<
    PinOnlyFallbackTriggerInput,
    'shadowQualityRetention' | 'baselineQualityRetention'
  >,
): PinOnlyFallbackTriggerResult {
  return evaluatePinOnlyFallbackTrigger({
    shadowQualityRetention: shadow.mean_quality_retention,
    baselineQualityRetention: baseline.mean_quality_retention,
    ...options,
  });
}
