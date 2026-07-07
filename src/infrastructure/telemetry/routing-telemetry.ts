/**
 * Routing telemetry emitter — T039.
 *
 * Maintains an append-only rolling window of routing decisions for
 * observability and audit. Window bounds: 168 hours (7 days), max 1111 entries.
 */

import type {
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
}

// ─── Emitter ─────────────────────────────────────────────────────────────────

export class RoutingTelemetryEmitter {
  private readonly entries: RoutingTelemetry[] = [];
  private readonly maxEntries: number;
  private readonly windowMs: number;
  private readonly clock: () => string;
  private readonly onRecord: ((record: RoutingTelemetry) => void) | undefined;

  constructor(options?: TelemetryEmitterOptions) {
    this.maxEntries = options?.maxEntries ?? TELEMETRY_MAX_ENTRIES;
    this.windowMs = options?.windowMs ?? TELEMETRY_WINDOW_MS;
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.onRecord = options?.onRecord;
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
