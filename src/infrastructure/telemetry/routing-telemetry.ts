/**
 * Routing telemetry emitter — T039; bounded split SP-276 (#143).
 *
 * Maintains an append-only rolling window of routing decisions for
 * observability and audit. Window bounds: 168 hours (7 days), max 1111 entries.
 *
 * SP-275 (#143 partial): the reason-code vocabulary, pure observability
 * builders, and the emitter port are domain-owned; infrastructure re-exports
 * them for import-path stability.
 *
 * SP-276 (#143): the SAAR/pin-economics builders moved to
 * `pin-economics-telemetry.ts`, planning-delegate fields to
 * `planning-delegate-telemetry.ts`, default/derived scalars and record
 * updates to `telemetry-scalar-fields.ts`, and the explain/log payload
 * builders to `routing-decision-log.ts`. This module keeps the rolling-window
 * emitter plus the cost estimator and re-exports the split symbols so
 * existing import paths stay stable.
 */

import type { ContextFitConfig } from '../../domain/routing/context-fit.js';
import type { SessionPinner } from '../../domain/pinning/session-pinner.js';
import type {
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingRequest,
  RoutingTelemetry,
  SaarConfig,
} from '../../domain/types/index.js';
import type { QuotaWindowPosition } from '../../domain/types/entities.js';
import type { VirtualCostV2Config } from '../../domain/types/schemas.js';
import { resolveFrugalityCostPer1M } from '../../domain/pricing/price-resolution.js';
import {
  resolveCostCalibrationRatio,
  type CostCalibrationPrior,
} from '../../domain/routing/expected-cost.js';
import type { PricingWindow } from '../../domain/pricing/peak-pricing.js';
import {
  resolvePeakPricingAdjustment,
  type PeakPricingOptions,
} from '../../domain/pricing/peak-pricing.js';
import {
  TELEMETRY_MAX_ENTRIES,
  TELEMETRY_WINDOW_MS,
  evictExpiredTelemetryEntries,
  makeTelemetryRoom,
} from './telemetry-limits.js';
import {
  buildContextFitObservability,
  type PeakPricingTelemetryFields,
  type RoutePathTelemetryExtras,
  type RoutingCostEstimator,
} from '../../domain/ports/telemetry-emitter-port.js';
import {
  pinEconomicsTelemetryFromInput,
  type FlipFlopTelemetryFields,
} from './pin-economics-telemetry.js';
import { planningDelegateTelemetryFromDecision } from './planning-delegate-telemetry.js';
import {
  defaultContextFitTelemetry,
  pinOnlyFallbackTelemetryFromDecision,
  prewarmTelemetryFromDecision,
  tierSelectionTelemetryFromDecision,
} from './telemetry-scalar-fields.js';

// SP-275: domain-owned reason codes, pure observability builders, and the
// emitter port — re-exported here for import-path stability.
export {
  CONTEXT_FIT_PASS,
  CONTEXT_FIT_REJECTED_ALL,
  CONTEXT_OVERFLOW_PIN_BREAK,
  HIGH_INTENSITY_STRUCTURAL,
  LOCAL_ZERO_DISABLED,
  LOW_INTENSITY_STRUCTURAL,
  PLANNING_DELEGATE,
  PLANNING_DELEGATE_DISABLED,
  PLANNING_DIRECT_FRONTIER,
  P_SUCCESS_CHEAP,
  P_SUCCESS_UNCERTAIN,
  THROUGHPUT_BELOW_THRESHOLD,
  TOOL_USE_CAPABILITY_SHORTFALL,
  buildContextFitObservability,
  buildLocalZeroSkipReasons,
  buildTierSelectionObservability,
  createPlanningDelegateObservability,
  enrichRoutingDecisionWithContextFit,
  enrichRoutingDecisionWithTierSelection,
  resolveTierSelectionReasonCode,
} from '../../domain/ports/telemetry-emitter-port.js';
export type {
  ContextFitObservabilityInput,
  PeakPricingTelemetryFields,
  RoutePathTelemetryExtras,
  RoutingCostEstimator,
  TelemetryEmitterPort,
  TierSelectionObservabilityInput,
} from '../../domain/ports/telemetry-emitter-port.js';

// SP-276 (#143): bounded telemetry builders split out of this module —
// re-exported for import-path stability.
export {
  BREAKEVEN_BLOCKED,
  BREAKEVEN_PASS,
  DEFAULT_BREAKEVEN_TELEMETRY_FIELDS,
  DEFAULT_SAAR_TELEMETRY_FIELDS,
  FLIP_FLOP_TIER_FLIP,
  FLIP_FLOP_TIER_PINNED,
  SAAR_BUFFER_ACTIVE,
  SAAR_HARD_LOCK,
  buildBreakevenObservability,
  buildFlipFlopObservability,
  buildSaarObservability,
  enrichRoutingDecisionWithPinEconomics,
} from './pin-economics-telemetry.js';
export type {
  BreakevenObservabilityV2,
  FlipFlopObservability,
  PinEconomicsObservabilityInput,
} from './pin-economics-telemetry.js';

export {
  DEFAULT_PLANNING_DELEGATE_TELEMETRY_FIELDS,
  PLANNING_DELEGATE_TIMEOUT,
  PLANNING_DELEGATE_UNAVAILABLE,
  buildPlanningDelegateObservability,
  enrichRoutingDecisionWithPlanningDelegate,
} from './planning-delegate-telemetry.js';

export {
  DEFAULT_CONTEXT_FIT_DATASET_FIELDS,
  DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
  DEFAULT_PEAK_PRICING_TELEMETRY_FIELDS,
  DEFAULT_PIN_ONLY_FALLBACK_TELEMETRY_FIELDS,
  DEFAULT_PREWARM_TELEMETRY_FIELDS,
  DEFAULT_TIER_SELECTION_DATASET_FIELDS,
  DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
  DEFAULT_USAGE_ACTUALS_TELEMETRY_FIELDS,
  PIN_ONLY_FALLBACK,
  applyReasoningTelemetry,
  applyUsageActuals,
  extractUsageActuals,
  prewarmTelemetryFromDecision,
  resolvePinOnlyFallbackActive,
} from './telemetry-scalar-fields.js';

export {
  buildPeakPricingObservability,
  buildRoutingDecisionLogPayload,
  enrichRoutingDecisionForExplain,
} from './routing-decision-log.js';
export type {
  ExplainEnrichmentOptions,
  PeakPricingObservability,
  RoutingDecisionLogDelegate,
} from './routing-decision-log.js';

export {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  TELEMETRY_MAX_ENTRIES,
  TELEMETRY_WINDOW_HOURS,
  TELEMETRY_WINDOW_MS,
} from './telemetry-limits.js';

/**
 * Estimate per-request routing cost in USD from resolved model pricing (SP-085).
 * Uses estimated_input_tokens when present, otherwise prompt_text length as a token proxy.
 *
 * SP-242 (#164): an optional rolling calibration prior (built from SP-241
 * usage actuals) soft-biases the catalog rate by the warm actual/estimate
 * ratio (model bucket first, tier bucket fallback). Cold / missing prior or
 * bucket resolves ratio 1 — catalog estimate unchanged (fail open).
 *
 * SP-243 (#165): the peak/off-peak schedule adapters (Z.ai, DeepSeek)
 * soft-bias the resolved rate by the current pricing window — pass
 * `peak.now` in tests to freeze the clock. Non-target providers and any
 * adapter failure resolve multiplier 1 (fail open); no hard ban.
 */
export function estimateRoutingCost(
  model: ModelProfile,
  request: RoutingRequest,
  catalog: PriceCatalog | null,
  calibration?: CostCalibrationPrior | null,
  peak?: PeakPricingOptions,
): number {
  const tokens = request.estimated_input_tokens ?? request.prompt_text.length;
  const costPer1M = resolveFrugalityCostPer1M(model, catalog, peak);
  const calibrationRatio = resolveCostCalibrationRatio(calibration, {
    modelId: model.id,
    tier: model.tier,
  });
  return (tokens / 1_000_000) * costPer1M * calibrationRatio;
}

/** Default {@link RoutingCostEstimator} — wired by the composition root (SP-275, #143). */
export const defaultRoutingCostEstimator: RoutingCostEstimator = estimateRoutingCost;

export interface TelemetryEmitterOptions {
  readonly maxEntries?: number;
  readonly windowMs?: number;
  readonly clock?: () => string;
  readonly onRecord?: (record: RoutingTelemetry) => void;
  readonly fleet?: readonly ModelProfile[];
  readonly contextFitConfig?: ContextFitConfig;
  readonly sessionPinner?: SessionPinner;
  readonly saarConfig?: SaarConfig;
  readonly priceCatalog?: PriceCatalog | null;
  readonly quotaWindowPosition?: QuotaWindowPosition;
  readonly virtualCostV2Config?: VirtualCostV2Config;
}

// ─── Emitter ─────────────────────────────────────────────────────────────────

export class RoutingTelemetryEmitter {
  private readonly entries: RoutingTelemetry[] = [];
  private readonly maxEntries: number;
  private readonly windowMs: number;
  private readonly clock: () => string;
  private readonly onRecord: ((record: RoutingTelemetry) => void) | undefined;
  private readonly fleet: readonly ModelProfile[] | undefined;
  private readonly contextFitConfig: ContextFitConfig | undefined;
  private readonly sessionPinner: SessionPinner | undefined;
  private readonly saarConfig: SaarConfig | undefined;
  private readonly priceCatalog: PriceCatalog | null | undefined;
  private readonly quotaWindowPosition: QuotaWindowPosition | undefined;
  private readonly virtualCostV2Config: VirtualCostV2Config | undefined;

  constructor(options?: TelemetryEmitterOptions) {
    this.maxEntries = options?.maxEntries ?? TELEMETRY_MAX_ENTRIES;
    this.windowMs = options?.windowMs ?? TELEMETRY_WINDOW_MS;
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.onRecord = options?.onRecord;
    this.fleet = options?.fleet;
    this.contextFitConfig = options?.contextFitConfig;
    this.sessionPinner = options?.sessionPinner;
    this.saarConfig = options?.saarConfig;
    this.priceCatalog = options?.priceCatalog;
    this.quotaWindowPosition = options?.quotaWindowPosition;
    this.virtualCostV2Config = options?.virtualCostV2Config;
  }

  /**
   * Emit a telemetry record from a completed routing decision.
   * Enforces the rolling window (time + count) before appending.
   */
  emit(
    request: RoutingRequest,
    decision: RoutingDecision,
    extras?: RoutePathTelemetryExtras,
  ): RoutingTelemetry & PeakPricingTelemetryFields {
    return this.appendRecord(request, decision, extras);
  }

  /**
   * Emit telemetry when a pipeline stage throws and routing degrades to safe default.
   */
  emitPipelineError(
    request: RoutingRequest,
    failedStage: string,
    fallback: RoutingDecision,
    extras?: RoutePathTelemetryExtras,
  ): RoutingTelemetry & PeakPricingTelemetryFields {
    const errorDecision: RoutingDecision = {
      ...fallback,
      stage: failedStage as RoutingDecision['stage'],
      reason_code: 'pipeline_error',
    };
    return this.appendRecord(request, errorDecision, extras);
  }

  private appendRecord(
    request: RoutingRequest,
    decision: RoutingDecision,
    extras?: RoutePathTelemetryExtras,
  ): RoutingTelemetry & PeakPricingTelemetryFields {
    makeTelemetryRoom(this.entries, this.maxEntries);

    const contextFit = buildContextFitObservability({
      request,
      decision,
      ...(this.fleet !== undefined ? { fleet: this.fleet } : {}),
      ...(this.contextFitConfig !== undefined
        ? { contextFitConfig: this.contextFitConfig }
        : {}),
    });
    const contextFitFields = contextFit ?? defaultContextFitTelemetry();
    const tierSelectionFields = tierSelectionTelemetryFromDecision(decision);
    const pinEconomicsFields = pinEconomicsTelemetryFromInput({
      request,
      decision,
      ...(this.fleet !== undefined ? { fleet: this.fleet } : {}),
      ...(this.sessionPinner !== undefined
        ? { sessionPinner: this.sessionPinner }
        : {}),
      ...(this.saarConfig !== undefined ? { saarConfig: this.saarConfig } : {}),
      ...(this.priceCatalog !== undefined ? { priceCatalog: this.priceCatalog } : {}),
      ...(this.quotaWindowPosition !== undefined
        ? { quotaWindowPosition: this.quotaWindowPosition }
        : {}),
      ...(this.virtualCostV2Config !== undefined
        ? { virtualCostV2Config: this.virtualCostV2Config }
        : {}),
    });
    const planningDelegateFields = planningDelegateTelemetryFromDecision(decision);
    const pinOnlyFallbackFields = pinOnlyFallbackTelemetryFromDecision(decision);
    const prewarmFields = prewarmTelemetryFromDecision(decision);

    const record: RoutingTelemetry & FlipFlopTelemetryFields & PeakPricingTelemetryFields = {
      timestamp: this.clock(),
      session_id: request.session_id,
      request_id: decision.request_id,
      turn_type: request.turn_type ?? 'unknown',
      stage: decision.stage,
      reason_code: decision.reason_code,
      selected_model_id: decision.selected_model_id,
      estimated_cost_usd: decision.estimated_cost_usd ?? 0,
      routing_latency_ms: decision.routing_latency_ms,
      pin_reason: decision.pin_reason,
      estimated_input_tokens: contextFitFields.estimated_input_tokens,
      context_fit_viable_count: contextFitFields.context_fit_viable_count,
      context_fit_rejected_json: contextFitFields.context_fit_rejected_json,
      context_overflow_pin_break: contextFitFields.context_overflow_pin_break,
      selected_model_max_input_tokens: contextFitFields.selected_model_max_input_tokens,
      context_fit_reason_code: contextFitFields.context_fit_reason_code,
      cluster_id: tierSelectionFields.cluster_id,
      cluster_similarity: tierSelectionFields.cluster_similarity,
      cluster_margin: tierSelectionFields.cluster_margin,
      low_intensity_score: tierSelectionFields.low_intensity_score,
      tier_hint: tierSelectionFields.tier_hint,
      p_success_cheap: tierSelectionFields.p_success_cheap,
      local_eligible_reason: tierSelectionFields.local_eligible_reason,
      tier_selection_reason_code: tierSelectionFields.tier_selection_reason_code,
      marginal_savings: pinEconomicsFields.marginal_savings,
      future_cache_value: pinEconomicsFields.future_cache_value,
      cache_reprime_cost: pinEconomicsFields.cache_reprime_cost,
      breakeven_decision: pinEconomicsFields.breakeven_decision,
      breakeven_reason_code: pinEconomicsFields.breakeven_reason_code,
      saar_buffer_active: pinEconomicsFields.saar_buffer_active,
      saar_hard_lock: pinEconomicsFields.saar_hard_lock,
      turn_index_in_session: pinEconomicsFields.turn_index_in_session,
      saar_reason_code: pinEconomicsFields.saar_reason_code,
      flip_flop_consecutive_tier_flips:
        pinEconomicsFields.flip_flop_consecutive_tier_flips,
      flip_flop_tier_pinned: pinEconomicsFields.flip_flop_tier_pinned,
      flip_flop_shadow_event: pinEconomicsFields.flip_flop_shadow_event,
      ...planningDelegateFields,
      ...pinOnlyFallbackFields,
      ...prewarmFields,
      route_path: extras?.routePath ?? null,
      route_path_confidence: extras?.routePathConfidence ?? null,
      // SP-246 (#166): adaptive reasoning resolves at delegation time (after
      // emit); defaults null, enriched via updateTelemetryReasoning.
      reasoning_level_requested: null,
      reasoning_level_applied: null,
      reasoning_reason_code: null,
      // SP-243 (#165): peak/off-peak window for the selected model.
      pricing_window: this.resolvePricingWindow(decision.selected_model_id),
    };

    this.entries.push(record);
    this.onRecord?.(record);
    return record;
  }

  /** Current number of retained entries. */
  get size(): number {
    return this.entries.length;
  }

  /** Snapshot of all retained entries (newest last). */
  snapshot(): readonly RoutingTelemetry[] {
    evictExpiredTelemetryEntries(this.entries, this.windowMs);
    return [...this.entries];
  }

  /**
   * Pricing window for the selected model (SP-243, #165). Fail open: unknown
   * models or non-target providers record 'none'.
   */
  private resolvePricingWindow(modelId: string): PricingWindow {
    const model = this.fleet?.find((entry) => entry.id === modelId);
    if (!model) {
      return 'none';
    }
    return resolvePeakPricingAdjustment(model, { now: new Date(this.clock()) }).window;
  }
}
