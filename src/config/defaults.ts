/**
 * Operator configuration defaults (FR-021).
 * Values sourced from specs/001-build-smart-router/data-model.md § Configuration (Operator).
 */

import {
  DEFAULT_PLANNING_DELEGATE_CONFIG,
  DEFAULT_SAAR_CONFIG,
  resolvePlanningDelegateConfigFromEnv,
  resolveSaarConfigFromEnv,
  type OperatorConfig,
} from '../domain/types/schemas.js';
import { DEFAULT_LOW_INTENSITY_WEIGHTS } from '../domain/routing/tier-features.js';

export { DEFAULT_PLANNING_DELEGATE_CONFIG, DEFAULT_SAAR_CONFIG, resolvePlanningDelegateConfigFromEnv, resolveSaarConfigFromEnv } from '../domain/types/schemas.js';

/** Merge operator env overrides onto defaults (SAAR and planning delegate sections). */
export function resolveOperatorConfigFromEnv(
  base: OperatorConfig = DEFAULT_OPERATOR_CONFIG,
): OperatorConfig {
  return {
    ...base,
    saar: resolveSaarConfigFromEnv(base.saar),
    planning_delegate: resolvePlanningDelegateConfigFromEnv(base.planning_delegate),
  };
}

export const DEFAULT_OPERATOR_CONFIG: Readonly<OperatorConfig> = {
  frugality: {
    lambda_cost: 0.5,
    lambda_latency: 0.1,
    lambda_verbosity: 0.15,
  },
  loop_escalation: {
    threshold: 3,
  },
  pricing: {
    staleness_days: 14,
  },
  local: {
    min_memory_gb_full: 16,
    min_memory_gb_classification: 8,
    battery_threshold_pct: 20,
  },
  hydra: {
    artifact_cache_path: '.pi-smart-router/models/',
  },
  low_intensity: {
    weights: DEFAULT_LOW_INTENSITY_WEIGHTS,
    high_threshold: 0.65,
    low_threshold: 0.35,
    p_success_alpha: 0.5,
  },
  saar: DEFAULT_SAAR_CONFIG,
  planning_delegate: DEFAULT_PLANNING_DELEGATE_CONFIG,
  pin_only_fallback: false,
} as const;
