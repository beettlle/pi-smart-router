/**
 * Telemetry scalar fields — SP-276 (#143 bounded split).
 *
 * Default and derived telemetry/dataset scalar fields: context-fit,
 * tier-selection, prewarm, pin-only fallback, peak-pricing, and usage
 * actuals, plus the pure record-update helpers (usage actuals, adaptive
 * reasoning) applied after emission. Extracted from `routing-telemetry.ts`;
 * the emitter façade re-exports these for import-path stability.
 */

import type {
  RoutingDatasetRecord,
  RoutingDecision,
  RoutingReasoningTelemetry,
  RoutingTelemetry,
  RoutingUsageActuals,
} from '../../domain/types/index.js';
import {
  buildTierSelectionObservability,
  type PeakPricingTelemetryFields,
} from '../../domain/ports/telemetry-emitter-port.js';

/** Emergency pin-on-first-turn fallback reason code (#83, SP-161/162). */
export const PIN_ONLY_FALLBACK = 'pin_only_fallback' as const;

function defaultPinOnlyFallbackTelemetry(): Pick<RoutingTelemetry, 'pin_only_fallback_active'> {
  return {
    pin_only_fallback_active: false,
  };
}

/** Default pin-only fallback telemetry scalars for tests and legacy store reads. */
export const DEFAULT_PIN_ONLY_FALLBACK_TELEMETRY_FIELDS = defaultPinOnlyFallbackTelemetry();

/** True when routing used emergency pin-only fallback for this decision (SP-162). */
export function resolvePinOnlyFallbackActive(decision: RoutingDecision): boolean {
  return decision.reason_code === PIN_ONLY_FALLBACK;
}

export function pinOnlyFallbackTelemetryFromDecision(
  decision: RoutingDecision,
): ReturnType<typeof defaultPinOnlyFallbackTelemetry> {
  return {
    pin_only_fallback_active: resolvePinOnlyFallbackActive(decision),
  };
}

function defaultPrewarmTelemetry(): Pick<
  RoutingTelemetry,
  'prewarm_attempted' | 'prewarm_accepted' | 'prewarm_disabled_reason'
> {
  return {
    prewarm_attempted: false,
    prewarm_accepted: null,
    prewarm_disabled_reason: null,
  };
}

/** Default speculative prewarm telemetry scalars for tests and legacy store reads (SP-217). */
export const DEFAULT_PREWARM_TELEMETRY_FIELDS = defaultPrewarmTelemetry();

/** Prewarm explain/telemetry fields from the decision feature sidecar (SP-217, #117). */
export function prewarmTelemetryFromDecision(
  decision: RoutingDecision,
): ReturnType<typeof defaultPrewarmTelemetry> {
  const features = decision.features;
  return {
    prewarm_attempted: features?.prewarm_attempted ?? false,
    prewarm_accepted: features?.prewarm_accepted ?? null,
    prewarm_disabled_reason: features?.prewarm_disabled_reason ?? null,
  };
}

function defaultPeakPricingTelemetry(): PeakPricingTelemetryFields {
  return { pricing_window: 'none' };
}

/** Default peak-pricing telemetry scalars for tests and legacy store reads (SP-243). */
export const DEFAULT_PEAK_PRICING_TELEMETRY_FIELDS = defaultPeakPricingTelemetry();

/** Default usage-actuals scalars for tests and legacy store reads (SP-241, #164). */
export const DEFAULT_USAGE_ACTUALS_TELEMETRY_FIELDS = {
  actual_cost_usd: null,
  actual_input_tokens: null,
  actual_output_tokens: null,
  actual_cache_read_tokens: null,
  actual_cache_write_tokens: null,
} as const satisfies Pick<
  RoutingTelemetry,
  | 'actual_cost_usd'
  | 'actual_input_tokens'
  | 'actual_output_tokens'
  | 'actual_cache_read_tokens'
  | 'actual_cache_write_tokens'
>;

function toNonNegativeFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Extract post-turn usage actuals from a pi assistant message `usage` object
 * (SP-241, #164). Structural and fail open: returns null when usage is missing
 * or carries no usable token counts (library embeds / non-pi hosts), so callers
 * can no-op without failing the route.
 *
 * Subscription / OAuth models report `cost.total === 0`: token actuals are
 * still recorded but `cost_usd` stays null so stats never invent USD.
 */
export function extractUsageActuals(usage: unknown): RoutingUsageActuals | null {
  if (usage === null || typeof usage !== 'object') {
    return null;
  }
  const record = usage as Record<string, unknown>;
  const input = toNonNegativeFinite(record.input);
  const output = toNonNegativeFinite(record.output);
  if (input === null && output === null) {
    return null;
  }
  const cacheRead = toNonNegativeFinite(record.cacheRead) ?? 0;
  const cacheWrite = toNonNegativeFinite(record.cacheWrite) ?? 0;

  const cost = record.cost;
  const costTotal =
    cost !== null && typeof cost === 'object'
      ? toNonNegativeFinite((cost as Record<string, unknown>).total)
      : null;

  return {
    cost_usd: costTotal !== null && costTotal > 0 ? costTotal : null,
    input_tokens: input ?? 0,
    output_tokens: output ?? 0,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
  };
}

/**
 * Attach usage actuals to a telemetry record, retaining `estimated_cost_usd`
 * (SP-241, #164). Pure — returns a new record.
 */
export function applyUsageActuals(
  entry: RoutingTelemetry,
  actuals: RoutingUsageActuals,
): RoutingTelemetry {
  return {
    ...entry,
    actual_cost_usd: actuals.cost_usd,
    actual_input_tokens: actuals.input_tokens,
    actual_output_tokens: actuals.output_tokens,
    actual_cache_read_tokens: actuals.cache_read_tokens,
    actual_cache_write_tokens: actuals.cache_write_tokens,
  };
}

/**
 * Attach post-delegation adaptive reasoning fields to a telemetry record
 * (SP-246, #166). Pure — returns a new record.
 */
export function applyReasoningTelemetry(
  entry: RoutingTelemetry,
  fields: RoutingReasoningTelemetry,
): RoutingTelemetry {
  return {
    ...entry,
    reasoning_level_requested: fields.reasoning_level_requested,
    reasoning_level_applied: fields.reasoning_level_applied,
    reasoning_reason_code: fields.reasoning_reason_code,
  };
}

export function defaultContextFitTelemetry(): Pick<
  RoutingTelemetry,
  | 'estimated_input_tokens'
  | 'context_fit_viable_count'
  | 'context_fit_rejected_json'
  | 'context_overflow_pin_break'
  | 'selected_model_max_input_tokens'
  | 'context_fit_reason_code'
> {
  return {
    estimated_input_tokens: null,
    context_fit_viable_count: null,
    context_fit_rejected_json: null,
    context_overflow_pin_break: false,
    selected_model_max_input_tokens: null,
    context_fit_reason_code: null,
  };
}

/** Default context-fit telemetry scalars for tests and legacy store reads. */
export const DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS = defaultContextFitTelemetry();

function defaultTierSelectionTelemetry(): Pick<
  RoutingTelemetry,
  | 'cluster_id'
  | 'cluster_similarity'
  | 'cluster_margin'
  | 'low_intensity_score'
  | 'tier_hint'
  | 'p_success_cheap'
  | 'local_eligible_reason'
  | 'tier_selection_reason_code'
> {
  return {
    cluster_id: null,
    cluster_similarity: null,
    cluster_margin: null,
    low_intensity_score: null,
    tier_hint: null,
    p_success_cheap: null,
    local_eligible_reason: null,
    tier_selection_reason_code: null,
  };
}

/** Default tier-selection telemetry scalars for tests and legacy store reads. */
export const DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS = defaultTierSelectionTelemetry();

export function tierSelectionTelemetryFromDecision(
  decision: RoutingDecision,
): ReturnType<typeof defaultTierSelectionTelemetry> {
  const observability = buildTierSelectionObservability({ decision });
  if (!observability) {
    return defaultTierSelectionTelemetry();
  }

  return {
    cluster_id: observability.cluster_id,
    cluster_similarity: observability.cluster_similarity,
    cluster_margin: observability.cluster_margin,
    low_intensity_score: observability.low_intensity_score,
    tier_hint: observability.tier_hint,
    p_success_cheap: observability.p_success_cheap,
    local_eligible_reason: observability.local_eligible_reason,
    tier_selection_reason_code: observability.tier_selection_reason_code,
  };
}

/** Default context-fit dataset scalars for tests and legacy store reads. */
export const DEFAULT_CONTEXT_FIT_DATASET_FIELDS = {
  estimated_input_tokens_gate: null,
  context_fit_viable_count: null,
  context_fit_rejected_json: null,
  context_overflow_pin_break: false,
  selected_model_max_input_tokens: null,
  context_fit_reason_code: null,
} as const satisfies Pick<
  RoutingDatasetRecord,
  | 'estimated_input_tokens_gate'
  | 'context_fit_viable_count'
  | 'context_fit_rejected_json'
  | 'context_overflow_pin_break'
  | 'selected_model_max_input_tokens'
  | 'context_fit_reason_code'
>;

/** Default embedding field for tests and legacy store reads (SP-285, #170). */
export const DEFAULT_EMBEDDING_DATASET_FIELDS = {
  embedding: null,
} as const satisfies Pick<RoutingDatasetRecord, 'embedding'>;

/** Default tier-selection dataset scalars for tests and legacy store reads. */
export const DEFAULT_TIER_SELECTION_DATASET_FIELDS = {
  cluster_id: null,
  cluster_similarity: null,
  cluster_margin: null,
  low_intensity_score: null,
  tier_hint: null,
  p_success_cheap: null,
  local_eligible_reason: null,
  tier_selection_reason_code: null,
} as const satisfies Pick<
  RoutingDatasetRecord,
  | 'cluster_id'
  | 'cluster_similarity'
  | 'cluster_margin'
  | 'low_intensity_score'
  | 'tier_hint'
  | 'p_success_cheap'
  | 'local_eligible_reason'
  | 'tier_selection_reason_code'
>;
