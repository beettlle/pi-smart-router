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
import { evaluateModelSwitchBreakeven } from '../../domain/pinning/session-pinner.js';
import { selectLowestCostModel } from '../../domain/pinning/sub-route-policy.js';
import type { SessionPinner } from '../../domain/pinning/session-pinner.js';
import type {
  BreakevenObservability,
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
  SaarConfig,
  SaarObservability,
  Tier,
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

export const BREAKEVEN_BLOCKED = 'breakeven_blocked' as const;
export const BREAKEVEN_PASS = 'breakeven_pass' as const;
export const SAAR_BUFFER_ACTIVE = 'saar_buffer_active' as const;
export const SAAR_HARD_LOCK = 'saar_hard_lock' as const;

const TURN_ENVELOPE_TIER_MAP: Readonly<Record<string, Tier | null>> = {
  planning: 'frontier-cloud',
  tool_result: 'economical-cloud',
  subagent: 'economical-cloud',
  main_loop: null,
  unknown: null,
};

const SAAR_DECISION_REASON_CODES = new Set<string>([
  SAAR_BUFFER_ACTIVE,
  SAAR_HARD_LOCK,
  'saar_tier_upgrade',
  'saar_idle_reopen',
]);

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
  readonly sessionPinner?: SessionPinner;
  readonly saarConfig?: SaarConfig;
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

export interface PinEconomicsObservabilityInput {
  readonly request: RoutingRequest;
  readonly decision: RoutingDecision;
  readonly fleet?: readonly ModelProfile[] | undefined;
  readonly sessionPinner?: SessionPinner | undefined;
  readonly saarConfig?: SaarConfig | undefined;
}

function resolveTurnEnvelopeTargetTier(request: RoutingRequest): Tier | null {
  const turnType = request.turn_type ?? 'unknown';
  return TURN_ENVELOPE_TIER_MAP[turnType] ?? null;
}

function isSaarPlanningBufferActive(
  request: RoutingRequest,
  sessionPinner: SessionPinner | undefined,
  saarConfig: SaarConfig | undefined,
): boolean {
  if (!saarConfig || !sessionPinner || request.turn_type !== 'planning') {
    return false;
  }

  if (!sessionPinner.getPin(request.session_id)) {
    return false;
  }

  const saarState = sessionPinner.getSaarState(request.session_id);
  const turnIndex = saarState?.turn_index ?? 0;

  return turnIndex < saarConfig.planning_turn_buffer;
}

function resolveSaarReasonCode(decision: RoutingDecision): string | null {
  if (SAAR_DECISION_REASON_CODES.has(decision.reason_code)) {
    return decision.reason_code;
  }

  return null;
}

/** Build privacy-safe SAAR pin state for explain and telemetry (SP-126). */
export function buildSaarObservability(
  input: PinEconomicsObservabilityInput,
): SaarObservability | null {
  const { request, decision, sessionPinner, saarConfig } = input;
  if (!saarConfig) {
    return null;
  }

  const saarState = sessionPinner?.getSaarState(request.session_id) ?? null;
  const pin = sessionPinner?.getPin(request.session_id) ?? null;

  if (!pin && !saarState && !resolveSaarReasonCode(decision)) {
    return null;
  }

  const turnIndex = saarState?.turn_index ?? (pin ? 0 : null);

  return {
    buffer_active:
      turnIndex !== null ? turnIndex < saarConfig.planning_turn_buffer : false,
    hard_lock: saarState?.hard_lock ?? false,
    turn_index_in_session: turnIndex,
    planning_turn_buffer: saarConfig.planning_turn_buffer,
    idle_timeout_seconds: saarConfig.idle_timeout_seconds,
    saar_reason_code: resolveSaarReasonCode(decision),
  };
}

/** Build cache breakeven breakdown when a pin would switch tiers (SP-126). */
export function buildBreakevenObservability(
  input: PinEconomicsObservabilityInput,
): BreakevenObservability | null {
  const { request, sessionPinner, saarConfig, fleet } = input;
  if (!fleet || !sessionPinner) {
    return null;
  }

  const pin = sessionPinner.getPin(request.session_id);
  if (!pin) {
    return null;
  }

  const targetTier = resolveTurnEnvelopeTargetTier(request);
  if (!targetTier) {
    return null;
  }

  if (isSaarPlanningBufferActive(request, sessionPinner, saarConfig)) {
    return null;
  }

  const pinnedModel = fleet.find(
    (model) => model.id === pin.pinned_model_id && model.healthy !== false,
  );
  const candidate = selectLowestCostModel(
    fleet.filter((model) => model.tier === targetTier && model.healthy !== false),
  );

  if (!pinnedModel || !candidate || pinnedModel.id === candidate.id) {
    return null;
  }

  const tokenEstimate =
    request.estimated_input_tokens ?? request.prompt_text.length;
  const breakeven = evaluateModelSwitchBreakeven(
    pinnedModel,
    candidate,
    tokenEstimate,
    tokenEstimate,
    saarConfig,
  );

  return {
    marginal_savings: breakeven.marginal_savings,
    future_cache_value: breakeven.future_cache_value,
    cache_reprime_cost: breakeven.cache_reprime_cost,
    decision: breakeven.shouldSwitch ? 'pass' : 'blocked',
    breakeven_reason_code: breakeven.shouldSwitch ? BREAKEVEN_PASS : BREAKEVEN_BLOCKED,
  };
}

function defaultBreakevenTelemetry(): Pick<
  RoutingTelemetry,
  | 'marginal_savings'
  | 'future_cache_value'
  | 'cache_reprime_cost'
  | 'breakeven_decision'
  | 'breakeven_reason_code'
> {
  return {
    marginal_savings: null,
    future_cache_value: null,
    cache_reprime_cost: null,
    breakeven_decision: null,
    breakeven_reason_code: null,
  };
}

function defaultSaarTelemetry(): Pick<
  RoutingTelemetry,
  | 'saar_buffer_active'
  | 'saar_hard_lock'
  | 'turn_index_in_session'
  | 'saar_reason_code'
> {
  return {
    saar_buffer_active: false,
    saar_hard_lock: false,
    turn_index_in_session: null,
    saar_reason_code: null,
  };
}

/** Default breakeven telemetry scalars for tests and legacy store reads. */
export const DEFAULT_BREAKEVEN_TELEMETRY_FIELDS = defaultBreakevenTelemetry();

/** Default SAAR telemetry scalars for tests and legacy store reads. */
export const DEFAULT_SAAR_TELEMETRY_FIELDS = defaultSaarTelemetry();

function pinEconomicsTelemetryFromInput(
  input: PinEconomicsObservabilityInput,
): ReturnType<typeof defaultBreakevenTelemetry> &
  ReturnType<typeof defaultSaarTelemetry> {
  const breakeven = buildBreakevenObservability(input);
  const saar = buildSaarObservability(input);

  return {
    ...(breakeven
      ? {
          marginal_savings: breakeven.marginal_savings,
          future_cache_value: breakeven.future_cache_value,
          cache_reprime_cost: breakeven.cache_reprime_cost,
          breakeven_decision: breakeven.decision,
          breakeven_reason_code: breakeven.breakeven_reason_code,
        }
      : defaultBreakevenTelemetry()),
    saar_buffer_active: saar?.buffer_active ?? false,
    saar_hard_lock: saar?.hard_lock ?? false,
    turn_index_in_session: saar?.turn_index_in_session ?? null,
    saar_reason_code: saar?.saar_reason_code ?? null,
  };
}

/** Attach breakeven and SAAR observability to routing decision features (SP-126). */
export function enrichRoutingDecisionWithPinEconomics(
  request: RoutingRequest,
  decision: RoutingDecision,
  options?: Omit<PinEconomicsObservabilityInput, 'request' | 'decision'>,
): RoutingDecision {
  const input: PinEconomicsObservabilityInput = {
    request,
    decision,
    ...(options?.fleet !== undefined ? { fleet: options.fleet } : {}),
    ...(options?.sessionPinner !== undefined
      ? { sessionPinner: options.sessionPinner }
      : {}),
    ...(options?.saarConfig !== undefined ? { saarConfig: options.saarConfig } : {}),
  };

  const breakeven = buildBreakevenObservability(input);
  const saar = buildSaarObservability(input);

  if (!breakeven && !saar) {
    return decision;
  }

  return {
    ...decision,
    features: {
      ...(decision.features ?? emptyFeatureSidecar()),
      ...(breakeven ? { breakeven } : {}),
      ...(saar ? { saar } : {}),
    },
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
  readonly sessionPinner?: SessionPinner;
  readonly saarConfig?: SaarConfig;
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

  return enrichRoutingDecisionWithPinEconomics(
    request,
    enrichRoutingDecisionWithTierSelection(withContextFit, clusterMatchTable),
    pinEconomicsOptionsFromExplain(options),
  );
}

function pinEconomicsOptionsFromExplain(
  options?: ExplainEnrichmentOptions,
): Omit<PinEconomicsObservabilityInput, 'request' | 'decision'> {
  return {
    ...(options?.fleet !== undefined ? { fleet: options.fleet } : {}),
    ...(options?.sessionPinner !== undefined
      ? { sessionPinner: options.sessionPinner }
      : {}),
    ...(options?.saarConfig !== undefined ? { saarConfig: options.saarConfig } : {}),
  };
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
  pinEconomics?: Omit<PinEconomicsObservabilityInput, 'request' | 'decision' | 'fleet'>,
): Record<string, unknown> {
  const enriched = enrichRoutingDecisionWithPinEconomics(
    request,
    enrichRoutingDecisionWithTierSelection(
      enrichRoutingDecisionWithContextFit(
        request,
        decision,
        fleet,
        contextFitConfig,
      ),
    ),
    {
      ...(fleet !== undefined ? { fleet } : {}),
      ...(pinEconomics?.sessionPinner !== undefined
        ? { sessionPinner: pinEconomics.sessionPinner }
        : {}),
      ...(pinEconomics?.saarConfig !== undefined
        ? { saarConfig: pinEconomics.saarConfig }
        : {}),
    },
  );

  const tierSelection = enriched.features?.tier_selection;
  const breakeven = enriched.features?.breakeven;
  const saar = enriched.features?.saar;

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
    breakeven_summary: breakeven
      ? {
          marginal_savings: breakeven.marginal_savings,
          future_cache_value: breakeven.future_cache_value,
          cache_reprime_cost: breakeven.cache_reprime_cost,
          decision: breakeven.decision,
          breakeven_reason_code: breakeven.breakeven_reason_code,
        }
      : null,
    saar_summary: saar
      ? {
          buffer_active: saar.buffer_active,
          hard_lock: saar.hard_lock,
          turn_index_in_session: saar.turn_index_in_session,
          planning_turn_buffer: saar.planning_turn_buffer,
          idle_timeout_seconds: saar.idle_timeout_seconds,
          saar_reason_code: saar.saar_reason_code,
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
  private readonly sessionPinner: SessionPinner | undefined;
  private readonly saarConfig: SaarConfig | undefined;

  constructor(options?: TelemetryEmitterOptions) {
    this.maxEntries = options?.maxEntries ?? TELEMETRY_MAX_ENTRIES;
    this.windowMs = options?.windowMs ?? TELEMETRY_WINDOW_MS;
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.onRecord = options?.onRecord;
    this.fleet = options?.fleet;
    this.contextFitConfig = options?.contextFitConfig;
    this.sessionPinner = options?.sessionPinner;
    this.saarConfig = options?.saarConfig;
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
    const pinEconomicsFields = pinEconomicsTelemetryFromInput({
      request,
      decision,
      ...(this.fleet !== undefined ? { fleet: this.fleet } : {}),
      ...(this.sessionPinner !== undefined
        ? { sessionPinner: this.sessionPinner }
        : {}),
      ...(this.saarConfig !== undefined ? { saarConfig: this.saarConfig } : {}),
    });

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
      marginal_savings: pinEconomicsFields.marginal_savings,
      future_cache_value: pinEconomicsFields.future_cache_value,
      cache_reprime_cost: pinEconomicsFields.cache_reprime_cost,
      breakeven_decision: pinEconomicsFields.breakeven_decision,
      breakeven_reason_code: pinEconomicsFields.breakeven_reason_code,
      saar_buffer_active: pinEconomicsFields.saar_buffer_active,
      saar_hard_lock: pinEconomicsFields.saar_hard_lock,
      turn_index_in_session: pinEconomicsFields.turn_index_in_session,
      saar_reason_code: pinEconomicsFields.saar_reason_code,
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
