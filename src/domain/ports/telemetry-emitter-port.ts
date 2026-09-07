/**
 * Telemetry emitter ports (SP-275, #143 partial).
 *
 * Domain-owned contracts for routing telemetry: the reason-code vocabulary
 * pipeline stages write into decisions, the pure privacy-safe observability
 * builders (context-fit, tier-selection, planning-delegate), and the
 * {@link TelemetryEmitterPort} boundary the pipeline depends on.
 * Infrastructure (`infrastructure/telemetry/routing-telemetry.ts`) implements
 * the emitter (rolling window store, SAAR/pin-economics builders, dataset
 * scalars) and re-exports these symbols for import-path stability.
 *
 * Dependency direction: domain owns the port; infrastructure implements.
 * `RoutingCostEstimator` is an explicit seam: the default implementation
 * stays in infrastructure because per-token pricing resolution
 * (`pricing/price-broker`) is inverted in a separate #143 phase; the
 * composition root (`GatewayDispatch`) wires the default.
 */

import {
  CONTEXT_FIT_EXCEEDED,
  CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
  CONTEXT_OVERFLOW_NO_FIT,
  CONTEXT_OVERFLOW_SAME_PROVIDER_FALLBACK,
  modelFitsContext,
  resolveSafetyMargin,
  type ContextFitConfig,
} from '../routing/context-fit.js';
import { CLUSTER_REASON_CODE_PREFIX } from '../../config/routing-clusters-loader.js';
import type {
  ClusterMatchTableEntry,
  ContextFitObservability,
  ContextFitRejectedEntry,
  LowIntensityBreakdown,
  ModelProfile,
  PlanningDelegateObservability,
  PlanningDelegatePath,
  PriceCatalog,
  RejectedTierEntry,
  RoutePath,
  RoutingDecision,
  RoutingRequest,
  RoutingTelemetry,
  TierFeatureSummary,
  TierSelectionObservability,
} from '../types/index.js';
import type { PricingWindow } from '../pricing/peak-pricing.js';

// ─── Reason-code vocabulary (domain routing vocabulary) ──────────────────────

export const CONTEXT_FIT_PASS = 'context_fit_pass' as const;
export const CONTEXT_FIT_REJECTED_ALL = 'context_fit_rejected_all' as const;
export const CONTEXT_OVERFLOW_PIN_BREAK = 'context_overflow_pin_break' as const;

export const LOW_INTENSITY_STRUCTURAL = 'low_intensity_structural' as const;
export const HIGH_INTENSITY_STRUCTURAL = 'high_intensity_structural' as const;
export const P_SUCCESS_CHEAP = 'p_success_cheap' as const;
export const P_SUCCESS_UNCERTAIN = 'p_success_uncertain' as const;

export const PLANNING_DELEGATE = 'planning_delegate' as const;
export const PLANNING_DIRECT_FRONTIER = 'planning_direct_frontier' as const;
export const PLANNING_DELEGATE_DISABLED = 'planning_delegate_disabled' as const;

export const THROUGHPUT_BELOW_THRESHOLD = 'throughput_below_threshold' as const;
/** Pre-local_zero tool-use capability shortfall (SP-177, #98). */
export const TOOL_USE_CAPABILITY_SHORTFALL = 'tool_use_capability_shortfall' as const;
/** Operator disabled local_zero stage (SP-177, #98). */
export const LOCAL_ZERO_DISABLED = 'local_zero_disabled' as const;

// ─── Shared feature-sidecar helpers ──────────────────────────────────────────

/** Empty routing feature sidecar — baseline for enrichment spreads (SP-275 moved from infra). */
export function emptyFeatureSidecar() {
  return {
    triage: null,
    requirements: null,
    candidates: null,
    tier_hint: null,
    tier_hint_reason_code: null,
    low_intensity_score: null,
    p_success_cheap: null,
    p_success_raw: null,
    p_success_calibrated: null,
    p_success_alpha: null,
    local_eligible_reason: null,
  };
}

// ─── Context-fit observability (SP-110) ──────────────────────────────────────

const OVERFLOW_REASON_CODES = new Set<string>([
  CONTEXT_OVERFLOW_SAME_PROVIDER_FALLBACK,
  CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
  CONTEXT_OVERFLOW_NO_FIT,
]);

export interface ContextFitObservabilityInput {
  readonly request: RoutingRequest;
  readonly decision: RoutingDecision;
  readonly fleet?: readonly ModelProfile[] | undefined;
  readonly contextFitConfig?: ContextFitConfig | undefined;
}

function resolveEstimatedInputTokens(request: RoutingRequest): number {
  return request.estimated_input_tokens ?? request.prompt_text.length;
}

function extractContextFitRejected(decision: RoutingDecision) {
  const candidates = decision.features?.candidates ?? decision.candidates ?? [];
  return candidates.filter(
    (candidate) => candidate.rejected_reason === CONTEXT_FIT_EXCEEDED,
  );
}

function lookupMaxInputTokens(
  fleet: readonly ModelProfile[] | undefined,
  modelId: string,
): number | null {
  const profile = fleet?.find((model) => model.id === modelId);
  return profile?.limits?.max_input_tokens ?? null;
}

function serializeContextFitRejected(
  rejected: readonly { model_id: string; rejected_reason: string | null }[],
  fleet: readonly ModelProfile[] | undefined,
): string | null {
  if (rejected.length === 0) {
    return null;
  }

  const entries: ContextFitRejectedEntry[] = rejected.map((candidate) => ({
    model_id: candidate.model_id,
    max_input_tokens: lookupMaxInputTokens(fleet, candidate.model_id),
    reason: candidate.rejected_reason ?? CONTEXT_FIT_EXCEEDED,
  }));

  return JSON.stringify(entries);
}

function countViableModels(
  fleet: readonly ModelProfile[],
  estimatedInputTokens: number,
  safetyMargin: number,
): number {
  let count = 0;
  for (const model of fleet) {
    if (modelFitsContext(model, estimatedInputTokens, safetyMargin)) {
      count += 1;
    }
  }
  return count;
}

function resolveContextOverflowPinBreak(decision: RoutingDecision): boolean {
  if (decision.pin_reason === 'context_overflow') {
    return true;
  }

  return OVERFLOW_REASON_CODES.has(decision.reason_code);
}

function resolveContextFitReasonCode(
  decision: RoutingDecision,
  rejectedCount: number,
  viableCount: number | null,
  gateRan: boolean,
): string | null {
  if (!gateRan) {
    return null;
  }

  if (decision.pin_reason === 'context_overflow') {
    return CONTEXT_OVERFLOW_PIN_BREAK;
  }

  if (OVERFLOW_REASON_CODES.has(decision.reason_code)) {
    return decision.reason_code;
  }

  if (decision.reason_code === CONTEXT_OVERFLOW_PIN_BREAK) {
    return CONTEXT_OVERFLOW_PIN_BREAK;
  }

  if (
    viableCount === 0 ||
    decision.reason_code === CONTEXT_OVERFLOW_NO_FIT ||
    (rejectedCount > 0 && decision.selected_model_id === 'unknown')
  ) {
    return CONTEXT_FIT_REJECTED_ALL;
  }

  if (rejectedCount > 0 || viableCount !== null) {
    return CONTEXT_FIT_PASS;
  }

  return CONTEXT_FIT_PASS;
}

function gateSkipped(request: RoutingRequest): boolean {
  return request.force_model_id !== undefined;
}

function gateRan(request: RoutingRequest, decision: RoutingDecision): boolean {
  if (gateSkipped(request)) {
    return false;
  }

  const rejected = extractContextFitRejected(decision);
  if (rejected.length > 0) {
    return true;
  }

  if (request.estimated_input_tokens !== undefined) {
    return true;
  }

  if (OVERFLOW_REASON_CODES.has(decision.reason_code)) {
    return true;
  }

  if (decision.pin_reason === 'context_overflow') {
    return true;
  }

  return decision.features?.context_fit !== undefined;
}

/** Build privacy-safe context-fit observability from a routing decision (SP-110). */
export function buildContextFitObservability(
  input: ContextFitObservabilityInput,
): ContextFitObservability | null {
  const { request, decision, fleet, contextFitConfig } = input;

  if (decision.features?.context_fit) {
    return decision.features.context_fit;
  }

  if (gateSkipped(request)) {
    return null;
  }

  const ran = gateRan(request, decision);
  if (!ran) {
    return null;
  }

  const rejected = extractContextFitRejected(decision);
  const estimatedInputTokens = resolveEstimatedInputTokens(request);
  const safetyMargin = resolveSafetyMargin(contextFitConfig);
  const viableCount =
    fleet !== undefined ? countViableModels(fleet, estimatedInputTokens, safetyMargin) : null;

  return {
    estimated_input_tokens: estimatedInputTokens,
    context_fit_viable_count: viableCount,
    context_fit_rejected_json: serializeContextFitRejected(rejected, fleet),
    context_overflow_pin_break: resolveContextOverflowPinBreak(decision),
    selected_model_max_input_tokens: lookupMaxInputTokens(
      fleet,
      decision.selected_model_id,
    ),
    context_fit_reason_code: resolveContextFitReasonCode(
      decision,
      rejected.length,
      viableCount,
      ran,
    ),
  };
}

// ─── Tier-selection observability (SP-113) ───────────────────────────────────

const EXPECTED_COST_PREFIX = 'expected_cost_';
const EXPECTED_COST_DEFER_CODES = new Set<string>([
  'expected_cost_price_delta_insufficient',
  'expected_cost_no_viable_tier',
]);

function parseClusterIdFromReasonCode(reasonCode: string | null | undefined): string | null {
  if (reasonCode === null || reasonCode === undefined || !reasonCode.startsWith(CLUSTER_REASON_CODE_PREFIX)) {
    return null;
  }

  return reasonCode.slice(CLUSTER_REASON_CODE_PREFIX.length);
}

/** Normalize tier-selection reason codes for telemetry and explain (SP-113). */
export function resolveTierSelectionReasonCode(
  features: RoutingDecision['features'],
): string | null {
  if (!features) {
    return null;
  }

  const reasonCode = features.tier_hint_reason_code;
  if (reasonCode === null || reasonCode === undefined) {
    if (features.p_success_cheap !== null && features.tier_hint === null) {
      return P_SUCCESS_UNCERTAIN;
    }
    return null;
  }

  if (
    reasonCode.startsWith(CLUSTER_REASON_CODE_PREFIX) ||
    reasonCode === LOW_INTENSITY_STRUCTURAL ||
    reasonCode === HIGH_INTENSITY_STRUCTURAL
  ) {
    return reasonCode;
  }

  if (reasonCode.startsWith(EXPECTED_COST_PREFIX)) {
    if (EXPECTED_COST_DEFER_CODES.has(reasonCode) || features.tier_hint === null) {
      return P_SUCCESS_UNCERTAIN;
    }

    if (features.tier_hint === 'economical-cloud' || features.tier_hint === 'zero-tier') {
      return P_SUCCESS_CHEAP;
    }
  }

  return reasonCode;
}

function extractRejectedTiers(
  candidates: NonNullable<RoutingDecision['features']>['candidates'],
): readonly RejectedTierEntry[] {
  if (!candidates || candidates.length === 0) {
    return [];
  }

  const rejected: RejectedTierEntry[] = [];
  for (const candidate of candidates) {
    if (!candidate.model_id.startsWith('__expected_cost_')) {
      continue;
    }

    const tier = candidate.model_id
      .replace('__expected_cost_', '')
      .replace(/__$/, '');

    rejected.push({
      tier,
      expected_cost_usd: candidate.score,
      adjusted_expected_cost_usd: candidate.shortfall,
      reason: candidate.rejected_reason ?? '',
    });
  }

  return rejected;
}

function buildTierFeatureSummary(
  features: NonNullable<RoutingDecision['features']>,
): TierFeatureSummary {
  return {
    triage_verdict: features.triage?.verdict ?? null,
    triage_reason_code: features.triage?.reason_code ?? null,
    cyclomatic_score: features.triage?.cyclomatic_score ?? null,
    requirement_reasoning: features.requirements?.reasoning ?? null,
    requirement_code_gen: features.requirements?.code_gen ?? null,
    requirement_tool_use: features.requirements?.tool_use ?? null,
  };
}

function buildLowIntensityBreakdown(
  features: NonNullable<RoutingDecision['features']>,
): LowIntensityBreakdown {
  return {
    score: features.low_intensity_score,
    tier_hint: features.tier_hint,
    tier_hint_reason_code: features.tier_hint_reason_code,
    tier_selection_reason_code: resolveTierSelectionReasonCode(features),
    p_success_cheap: features.p_success_cheap,
    p_success_raw: features.p_success_raw,
    p_success_calibrated: features.p_success_calibrated,
    p_success_alpha: features.p_success_alpha,
    rejected_tiers: extractRejectedTiers(features.candidates),
  };
}

/** Infer why local_zero did not dispatch when another stage won (SP-113). */
export function buildLocalZeroSkipReasons(
  decision: RoutingDecision,
  features: RoutingDecision['features'],
): readonly string[] {
  if (decision.stage === 'local_zero') {
    if (decision.reason_code === THROUGHPUT_BELOW_THRESHOLD) {
      return [THROUGHPUT_BELOW_THRESHOLD];
    }
    return [];
  }

  const reasons: string[] = [];
  if (!features?.local_eligible_reason) {
    reasons.push('not_locally_eligible');
  }

  const rejectedJson = features?.context_fit?.context_fit_rejected_json;
  if (rejectedJson !== null && rejectedJson !== undefined && rejectedJson.includes('zero-tier')) {
    reasons.push('context_fit_excluded_local');
  }

  if (features?.local_eligible_reason) {
    if (decision.pin_reason !== null) {
      reasons.push('session_pin_active');
    } else {
      reasons.push('hardware_or_local_unavailable');
    }
  }

  return reasons;
}

function resolveClusterScalars(
  features: RoutingDecision['features'],
  clusterMatchTable: readonly ClusterMatchTableEntry[] | null,
): Pick<
  TierSelectionObservability,
  'cluster_id' | 'cluster_similarity' | 'cluster_margin'
> {
  const selected =
    clusterMatchTable?.find((entry) => entry.selected) ??
    clusterMatchTable?.[0] ??
    null;

  if (selected) {
    return {
      cluster_id: selected.cluster_id,
      cluster_similarity: selected.similarity,
      cluster_margin: selected.margin,
    };
  }

  const clusterId =
    parseClusterIdFromReasonCode(features?.tier_hint_reason_code) ??
    parseClusterIdFromReasonCode(features?.local_eligible_reason);

  return {
    cluster_id: clusterId,
    cluster_similarity: null,
    cluster_margin: null,
  };
}

export interface TierSelectionObservabilityInput {
  readonly decision: RoutingDecision;
  readonly clusterMatchTable?: readonly ClusterMatchTableEntry[] | null;
}

/** Build privacy-safe tier/cluster observability from routing decision features (SP-113). */
export function buildTierSelectionObservability(
  input: TierSelectionObservabilityInput,
): TierSelectionObservability | null {
  const { decision, clusterMatchTable = null } = input;
  const features = decision.features;

  if (!features) {
    return null;
  }

  const tierGateRan =
    features.low_intensity_score !== null ||
    features.tier_hint !== null ||
    features.tier_hint_reason_code !== null ||
    features.p_success_cheap !== null;

  if (!tierGateRan) {
    return null;
  }

  const clusterScalars = resolveClusterScalars(features, clusterMatchTable);

  return {
    ...clusterScalars,
    low_intensity_score: features.low_intensity_score,
    tier_hint: features.tier_hint,
    p_success_cheap: features.p_success_cheap,
    local_eligible_reason: features.local_eligible_reason,
    tier_selection_reason_code: resolveTierSelectionReasonCode(features),
    cluster_match_table: clusterMatchTable,
    tier_feature_summary: buildTierFeatureSummary(features),
    low_intensity_breakdown: buildLowIntensityBreakdown(features),
    local_zero_skip_reasons: buildLocalZeroSkipReasons(decision, features),
  };
}

// ─── Planning-delegate observability (SP-142) ────────────────────────────────

/** Construct planning delegate observability for pipeline and tests (SP-142). */
export function createPlanningDelegateObservability(input: {
  path: PlanningDelegatePath;
  primary_model_id?: string | null;
  delegate_model_id?: string | null;
  compressed_context?: PlanningDelegateObservability['compressed_context'];
  planning_delegate_reason_code: string;
  fallback_reason?: string | null;
  /** Worker telemetry analogs (SP-213, #120); null when not yet executed. */
  workers_spawned?: number | null;
  workers_succeeded?: number | null;
  worker_timeout_count?: number | null;
}): PlanningDelegateObservability {
  return {
    path: input.path,
    primary_model_id: input.primary_model_id ?? null,
    delegate_model_id: input.delegate_model_id ?? null,
    compressed_context: input.compressed_context ?? null,
    planning_delegate_reason_code: input.planning_delegate_reason_code,
    fallback_reason: input.fallback_reason ?? null,
    workers_spawned: input.workers_spawned ?? null,
    workers_succeeded: input.workers_succeeded ?? null,
    worker_timeout_count: input.worker_timeout_count ?? null,
  };
}

// ─── Decision enrichment (pure, domain policy) ───────────────────────────────

/** Attach context-fit observability to a routing decision features sidecar (SP-110). */
export function enrichRoutingDecisionWithContextFit(
  request: RoutingRequest,
  decision: RoutingDecision,
  fleet?: readonly ModelProfile[],
  contextFitConfig?: ContextFitConfig,
): RoutingDecision {
  const contextFit = buildContextFitObservability({
    request,
    decision,
    fleet,
    ...(contextFitConfig !== undefined ? { contextFitConfig } : {}),
  });

  if (!contextFit) {
    return decision;
  }

  return {
    ...decision,
    features: {
      ...(decision.features ?? emptyFeatureSidecar()),
      context_fit: contextFit,
    },
  };
}

/** Attach tier-selection observability to a routing decision features sidecar (SP-113). */
export function enrichRoutingDecisionWithTierSelection(
  decision: RoutingDecision,
  clusterMatchTable?: readonly ClusterMatchTableEntry[] | null,
): RoutingDecision {
  const tierSelection = buildTierSelectionObservability({
    decision,
    clusterMatchTable: clusterMatchTable ?? null,
  });

  if (!tierSelection) {
    return decision;
  }

  return {
    ...decision,
    features: {
      ...(decision.features ?? emptyFeatureSidecar()),
      tier_selection: tierSelection,
    },
  };
}

// ─── Emitter port ────────────────────────────────────────────────────────────

/** Optional route_path classification supplied by the pipeline (SP-212, #119). */
export interface RoutePathTelemetryExtras {
  readonly routePath?: RoutePath | null;
  readonly routePathConfidence?: number | null;
}

/** Peak/off-peak pricing window applied to the estimate (SP-243, #165). */
export type PeakPricingTelemetryFields = {
  readonly pricing_window: PricingWindow;
};

/**
 * Port for routing telemetry emission (SP-275, #143).
 *
 * The pipeline records one telemetry entry per routing decision (plus one
 * when a stage throws and routing degrades to the safe default). The
 * infrastructure implementation (`RoutingTelemetryEmitter`) maintains the
 * rolling window and derives the privacy-safe observability scalars; the
 * domain depends on this interface only.
 */
export interface TelemetryEmitterPort {
  /** Emit a telemetry record from a completed routing decision. */
  emit(
    request: RoutingRequest,
    decision: RoutingDecision,
    extras?: RoutePathTelemetryExtras,
  ): RoutingTelemetry & PeakPricingTelemetryFields;

  /** Emit telemetry when a pipeline stage threw and routing degraded to safe default. */
  emitPipelineError(
    request: RoutingRequest,
    failedStage: string,
    fallback: RoutingDecision,
    extras?: RoutePathTelemetryExtras,
  ): RoutingTelemetry & PeakPricingTelemetryFields;
}

// ─── Cost-estimator seam ─────────────────────────────────────────────────────

/**
 * Per-request routing cost estimator seam (SP-275, #143 partial).
 *
 * The default implementation lives in infrastructure
 * (`estimateRoutingCost`) because per-token price resolution
 * (`infrastructure/pricing/price-broker.js` + wall-clock peak bias) is
 * inverted in a separate #143 phase. The composition root
 * (`GatewayDispatch`) wires the default; tests may inject their own.
 * When no estimator is wired, decisions are returned without an
 * `estimated_cost_usd` estimate.
 */
export type RoutingCostEstimator = (
  model: ModelProfile,
  request: RoutingRequest,
  catalog: PriceCatalog | null,
) => number;
