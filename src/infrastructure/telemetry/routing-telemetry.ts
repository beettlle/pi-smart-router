/**
 * Routing telemetry emitter — T039.
 *
 * Maintains an append-only rolling window of routing decisions for
 * observability and audit. Window bounds: 168 hours (7 days), max 1111 entries.
 */

import type { RoutingDecision, RoutingRequest, RoutingTelemetry } from '../../domain/types/index.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const WINDOW_HOURS = 168;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;
const MAX_ENTRIES = 1111;

export interface TelemetryEmitterOptions {
  readonly maxEntries?: number;
  readonly windowMs?: number;
  readonly clock?: () => string;
}

// ─── Emitter ─────────────────────────────────────────────────────────────────

export class RoutingTelemetryEmitter {
  private readonly entries: RoutingTelemetry[] = [];
  private readonly maxEntries: number;
  private readonly windowMs: number;
  private readonly clock: () => string;

  constructor(options?: TelemetryEmitterOptions) {
    this.maxEntries = options?.maxEntries ?? MAX_ENTRIES;
    this.windowMs = options?.windowMs ?? WINDOW_MS;
    this.clock = options?.clock ?? (() => new Date().toISOString());
  }

  /**
   * Emit a telemetry record from a completed routing decision.
   * Enforces the rolling window (time + count) before appending.
   */
  emit(request: RoutingRequest, decision: RoutingDecision): RoutingTelemetry {
    this.evict();

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
    return record;
  }

  /** Current number of retained entries. */
  get size(): number {
    return this.entries.length;
  }

  /** Snapshot of all retained entries (newest last). */
  snapshot(): readonly RoutingTelemetry[] {
    this.evict();
    return [...this.entries];
  }

  /**
   * Evict entries outside the rolling window.
   * Removes time-expired entries first, then trims oldest if count exceeds max.
   */
  private evict(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    while (this.entries.length > 0) {
      const oldest = this.entries[0]!;
      if (new Date(oldest.timestamp).getTime() < cutoff) {
        this.entries.shift();
      } else {
        break;
      }
    }

    while (this.entries.length >= this.maxEntries) {
      this.entries.shift();
    }
  }
}
