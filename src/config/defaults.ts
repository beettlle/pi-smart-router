/**
 * Operator configuration defaults (FR-021).
 * Values sourced from specs/001-build-smart-router/data-model.md § Configuration (Operator).
 */

import type { OperatorConfig } from '../domain/types/schemas.js';
import type { SaarConfig } from '../domain/types/entities.js';
import { DEFAULT_LOW_INTENSITY_WEIGHTS } from '../domain/routing/tier-features.js';

/** SAAR defaults per routing-roadmap.md §2 P0 (SP-121). */
export const DEFAULT_SAAR_CONFIG: Readonly<SaarConfig> = {
  planning_turn_buffer: 2,
  prefix_cache_weight: 0.20,
  idle_timeout_seconds: 300,
  switch_threshold: 0.5,
} as const;

/** Env: SMART_ROUTER_PLANNING_TURN_BUFFER — SAAR planning buffer turns (default 2). */
const ENV_PLANNING_TURN_BUFFER = 'SMART_ROUTER_PLANNING_TURN_BUFFER';
/** Env: SMART_ROUTER_PREFIX_CACHE_WEIGHT — SAAR prefix cache weight 0–1 (default 0.20). */
const ENV_PREFIX_CACHE_WEIGHT = 'SMART_ROUTER_PREFIX_CACHE_WEIGHT';
/** Env: SMART_ROUTER_IDLE_TIMEOUT_SECONDS — SAAR idle reopen timeout seconds (default 300). */
const ENV_IDLE_TIMEOUT_SECONDS = 'SMART_ROUTER_IDLE_TIMEOUT_SECONDS';
/** Env: SMART_ROUTER_SWITCH_THRESHOLD — SAAR switch score gate 0–1 (default 0.5). */
const ENV_SWITCH_THRESHOLD = 'SMART_ROUTER_SWITCH_THRESHOLD';

function readPositiveIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readUnitIntervalEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

/** Merge SAAR env overrides onto defaults (invalid env values are ignored). */
export function resolveSaarConfigFromEnv(
  base: SaarConfig = DEFAULT_SAAR_CONFIG,
): SaarConfig {
  return {
    planning_turn_buffer:
      readPositiveIntEnv(ENV_PLANNING_TURN_BUFFER) ?? base.planning_turn_buffer,
    prefix_cache_weight:
      readUnitIntervalEnv(ENV_PREFIX_CACHE_WEIGHT) ?? base.prefix_cache_weight,
    idle_timeout_seconds:
      readPositiveIntEnv(ENV_IDLE_TIMEOUT_SECONDS) ?? base.idle_timeout_seconds,
    switch_threshold:
      readUnitIntervalEnv(ENV_SWITCH_THRESHOLD) ?? base.switch_threshold,
  };
}

/** Merge operator env overrides onto defaults (SAAR section only today). */
export function resolveOperatorConfigFromEnv(
  base: OperatorConfig = DEFAULT_OPERATOR_CONFIG,
): OperatorConfig {
  return {
    ...base,
    saar: resolveSaarConfigFromEnv(base.saar),
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
} as const;
