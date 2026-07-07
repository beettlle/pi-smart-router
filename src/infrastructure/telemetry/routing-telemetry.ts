/**
 * Routing telemetry emitter — T039.
 *
 * Maintains an append-only rolling window of routing decisions for
 * observability and audit. Window bounds: 168 hours (7 days), max 1111 entries.
 */

import {
  CONTEXT_FIT_EXCEEDED,
  CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
  CONTEXT_OVERFLOW_NO_FIT,
  CONTEXT_OVERFLOW_SAME_PROVIDER_FALLBACK,
  modelFitsContext,
  resolveSafetyMargin,
  type ContextFitConfig,
} from '../../domain/routing/context-fit.js';
import { CLUSTER_REASON_CODE_PREFIX } from '../../config/routing-clusters-loader.js';
import type { ClusterMatcher } from '../../domain/matching/cluster-matcher.js';
import type {
  ClusterMatchTableEntry,
  ContextFitObservability,
  ContextFitRejectedEntry,
  LowIntensityBreakdown,
  ModelProfile,
  PriceCatalog,
  RejectedTierEntry,
  RoutingDecision,
  RoutingRequest,
  RoutingTelemetry,
  TierFeatureSummary,
  TierSelectionObservability,
} from '../../domain/types/index.js';
import { resolveFrugalityCostPer1M } from '../pricing/price-broker.js';
import {
  TELEMETRY_MAX_ENTRIES,
  TELEMETRY_WINDOW_MS,
  evictExpiredTelemetryEntries,
  makeTelemetryRoom,
} from './telemetry-limits.js';

export const CONTEXT_FIT_PASS = 'context_fit_pass' as const;
export const CONTEXT_FIT_REJECTED_ALL = 'context_fit_rejected_all' as const;
export const CONTEXT_OVERFLOW_PIN_BREAK = 'context_overflow_pin_break' as const;

export const LOW_INTENSITY_STRUCTURAL = 'low_intensity_structural' as const;
export const HIGH_INTENSITY_STRUCTURAL = 'high_intensity_structural' as const;
export const P_SUCCESS_CHEAP = 'p_success_cheap' as const;
export const P_SUCCESS_UNCERTAIN = 'p_success_uncertain' as const;

const EXPECTED_COST_PREFIX = 'expected_cost_';
const EXPECTED_COST_DEFER_CODES = new Set<string>([
  'expected_cost_price_delta_insufficient',
  'expected_cost_no_viable_tier',
]);

const OVERFLOW_REASON_CODES = new Set<string>([
  CONTEXT_OVERFLOW_SAME_PROVIDER_FALLBACK,
  CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
  CONTEXT_OVERFLOW_NO_FIT,
]);

/**
 * Estimate per-request routing cost in USD from resolved model pricing (SP-085).
 * Uses estimated_input_tokens when present, otherwise prompt_text length as a token proxy.
 */
export function estimateRoutingCost(
  model: ModelProfile,
  request: RoutingRequest,
  catalog: PriceCatalog | null,
): number {
  const tokens = request.estimated_input_tokens ?? request.prompt_text.length;
  const costPer1M = resolveFrugalityCostPer1M(model, catalog);
  return (tokens / 1_000_000) * costPer1M;
}

export {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  TELEMETRY_MAX_ENTRIES,
  TELEMETRY_WINDOW_HOURS,
  TELEMETRY_WINDOW_MS,
} from './telemetry-limits.js';

export interface TelemetryEmitterOptions {
  readonly maxEntries?: number;
  readonly windowMs?: number;
  readonly clock?: () => string;
  readonly onRecord?: (record: RoutingTelemetry) => void;
  readonly fleet?: readonly ModelProfile[];
  readonly contextFitConfig?: ContextFitConfig;
}

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

function emptyFeatureSidecar() {
  return {
    triage: null,
    requirements: null,
    candidates: null,
    tier_hint: null,
    tier_hint_reason_code: null,
    low_intensity_score: null,
    p_success_cheap: null,
    p_success_alpha: null,
    local_eligible_reason: null,
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

export interface ExplainEnrichmentOptions {
  readonly fleet?: readonly ModelProfile[];
  readonly contextFitConfig?: ContextFitConfig;
  readonly clusterMatcher?: ClusterMatcher;
}

/** Attach context-fit and tier-selection observability for explain responses (SP-110, SP-113). */
export async function enrichRoutingDecisionForExplain(
  request: RoutingRequest,
  decision: RoutingDecision,
  options?: ExplainEnrichmentOptions,
): Promise<RoutingDecision> {
  const withContextFit = enrichRoutingDecisionWithContextFit(
    request,
    decision,
    options?.fleet,
    options?.contextFitConfig,
  );

  let clusterMatchTable: readonly ClusterMatchTableEntry[] | null = null;
  if (options?.clusterMatcher) {
    try {
      clusterMatchTable = await options.clusterMatcher.matchTable(request);
    } catch {
      clusterMatchTable = null;
    }
  }

  return enrichRoutingDecisionWithTierSelection(withContextFit, clusterMatchTable);
}

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

export interface RoutingDecisionLogDelegate {
  readonly provider: string;
  readonly modelId: string;
  readonly api: string;
}

/** JSON payload for SMART_ROUTER_LOG_ROUTING=1 stderr lines (SP-110). */
export function buildRoutingDecisionLogPayload(
  request: RoutingRequest,
  decision: RoutingDecision,
  delegate?: RoutingDecisionLogDelegate,
  fleet?: readonly ModelProfile[],
  contextFitConfig?: ContextFitConfig,
): Record<string, unknown> {
  const enriched = enrichRoutingDecisionWithTierSelection(
    enrichRoutingDecisionWithContextFit(
      request,
      decision,
      fleet,
      contextFitConfig,
    ),
  );

  const tierSelection = enriched.features?.tier_selection;

  return {
    request_id: enriched.request_id,
    selected_model_id: enriched.selected_model_id,
    tier: enriched.tier,
    stage: enriched.stage,
    reason_code: enriched.reason_code,
    routing_latency_ms: enriched.routing_latency_ms,
    features: enriched.features ?? null,
    cluster_summary: tierSelection
      ? {
          cluster_id: tierSelection.cluster_id,
          cluster_similarity: tierSelection.cluster_similarity,
          cluster_margin: tierSelection.cluster_margin,
          tier_hint: tierSelection.tier_hint,
          tier_selection_reason_code: tierSelection.tier_selection_reason_code,
          low_intensity_score: tierSelection.low_intensity_score,
          p_success_cheap: tierSelection.p_success_cheap,
        }
      : null,
    delegate,
  };
}

function defaultContextFitTelemetry(): Pick<
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

function tierSelectionTelemetryFromDecision(
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
  import('../../domain/types/index.js').RoutingDatasetRecord,
  | 'estimated_input_tokens_gate'
  | 'context_fit_viable_count'
  | 'context_fit_rejected_json'
  | 'context_overflow_pin_break'
  | 'selected_model_max_input_tokens'
  | 'context_fit_reason_code'
>;

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
  import('../../domain/types/index.js').RoutingDatasetRecord,
  | 'cluster_id'
  | 'cluster_similarity'
  | 'cluster_margin'
  | 'low_intensity_score'
  | 'tier_hint'
  | 'p_success_cheap'
  | 'local_eligible_reason'
  | 'tier_selection_reason_code'
>;

// ─── Emitter ─────────────────────────────────────────────────────────────────

export class RoutingTelemetryEmitter {
  private readonly entries: RoutingTelemetry[] = [];
  private readonly maxEntries: number;
  private readonly windowMs: number;
  private readonly clock: () => string;
  private readonly onRecord: ((record: RoutingTelemetry) => void) | undefined;
  private readonly fleet: readonly ModelProfile[] | undefined;
  private readonly contextFitConfig: ContextFitConfig | undefined;

  constructor(options?: TelemetryEmitterOptions) {
    this.maxEntries = options?.maxEntries ?? TELEMETRY_MAX_ENTRIES;
    this.windowMs = options?.windowMs ?? TELEMETRY_WINDOW_MS;
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.onRecord = options?.onRecord;
    this.fleet = options?.fleet;
    this.contextFitConfig = options?.contextFitConfig;
  }

  /**
   * Emit a telemetry record from a completed routing decision.
   * Enforces the rolling window (time + count) before appending.
   */
  emit(request: RoutingRequest, decision: RoutingDecision): RoutingTelemetry {
    return this.appendRecord(request, decision);
  }

  /**
   * Emit telemetry when a pipeline stage throws and routing degrades to safe default.
   */
  emitPipelineError(
    request: RoutingRequest,
    failedStage: string,
    fallback: RoutingDecision,
  ): RoutingTelemetry {
    const errorDecision: RoutingDecision = {
      ...fallback,
      stage: failedStage as RoutingDecision['stage'],
      reason_code: 'pipeline_error',
    };
    return this.appendRecord(request, errorDecision);
  }

  private appendRecord(
    request: RoutingRequest,
    decision: RoutingDecision,
  ): RoutingTelemetry {
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

    const record: RoutingTelemetry = {
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
}
