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
import type {
  ContextFitObservability,
  ContextFitRejectedEntry,
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingRequest,
  RoutingTelemetry,
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
): Record<string, unknown> {
  const enriched = enrichRoutingDecisionWithContextFit(
    request,
    decision,
    fleet,
    contextFitConfig,
  );

  return {
    request_id: enriched.request_id,
    selected_model_id: enriched.selected_model_id,
    tier: enriched.tier,
    stage: enriched.stage,
    reason_code: enriched.reason_code,
    routing_latency_ms: enriched.routing_latency_ms,
    features: enriched.features ?? null,
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
