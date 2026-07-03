/**
 * Gateway dispatch — T020, FR-001, FR-023.
 *
 * Infrastructure entry point that delegates routing to the domain pipeline.
 * Accepts a RoutingRequest, runs it through the RouterPipeline, and returns
 * the selected model as a RoutingDecision. Never throws — the pipeline
 * guarantees a safe-default fallback.
 *
 * FR-023: preserves provider context-caching semantics on same-provider
 * request paths by tracking the last-used provider per session.
 */

import type {
  ModelProfile,
  RoutingDecision,
  RoutingRequest,
} from '../../domain/types/index.js';
import { RouterPipeline } from '../../domain/pipeline/router-pipeline.js';
import type { PipelineOptions } from '../../domain/pipeline/router-pipeline.js';

// ─── Cache marker tracking (FR-023) ──────────────────────────────────────────

export interface CacheMarker {
  readonly sessionId: string;
  readonly provider: string;
  readonly modelId: string;
  readonly cacheFriendly: boolean;
}

export class GatewayDispatch {
  private readonly pipeline: RouterPipeline;
  private readonly fleet: readonly ModelProfile[];
  private readonly cacheMarkers = new Map<string, CacheMarker>();

  constructor(fleet: readonly ModelProfile[], options?: PipelineOptions) {
    this.fleet = fleet;
    this.pipeline = new RouterPipeline(fleet, options);
  }

  /**
   * Route a single request through the pipeline.
   *
   * After routing, updates the FR-023 cache marker for the session so
   * subsequent same-provider requests preserve context-caching semantics.
   * Never throws.
   */
  async dispatch(request: RoutingRequest): Promise<RoutingDecision> {
    const decision = await this.pipeline.route(request);
    this.updateCacheMarker(request.session_id, decision);
    return decision;
  }

  /**
   * Retrieve the current cache marker for a session (FR-023 inspection).
   */
  getCacheMarker(sessionId: string): CacheMarker | null {
    return this.cacheMarkers.get(sessionId) ?? null;
  }

  /**
   * FR-023: track the provider and cache-friendly status for the session.
   * Sub-routed requests on the same provider preserve the existing marker
   * rather than replacing it — the pin model's cache state is authoritative.
   */
  private updateCacheMarker(
    sessionId: string,
    decision: RoutingDecision,
  ): void {
    const model = this.fleet.find((m) => m.id === decision.selected_model_id);
    if (!model) return;

    const existing = this.cacheMarkers.get(sessionId);

    if (
      existing &&
      existing.provider === model.provider &&
      decision.reason_code === 'tool_result_sub_route'
    ) {
      return;
    }

    this.cacheMarkers.set(sessionId, {
      sessionId,
      provider: model.provider,
      modelId: model.id,
      cacheFriendly: model.performance?.cache_friendly ?? false,
    });
  }
}
