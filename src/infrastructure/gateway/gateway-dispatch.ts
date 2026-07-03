/**
 * Minimal gateway dispatch — T020, FR-001.
 *
 * Infrastructure entry point that delegates routing to the domain pipeline.
 * Accepts a RoutingRequest, runs it through the RouterPipeline, and returns
 * the selected model as a RoutingDecision. Never throws — the pipeline
 * guarantees a safe-default fallback.
 */

import type {
  ModelProfile,
  RoutingDecision,
  RoutingRequest,
} from '../../domain/types/index.js';
import { RouterPipeline } from '../../domain/pipeline/router-pipeline.js';

export class GatewayDispatch {
  private readonly pipeline: RouterPipeline;

  constructor(fleet: readonly ModelProfile[]) {
    this.pipeline = new RouterPipeline(fleet);
  }

  /**
   * Route a single request through the pipeline.
   *
   * Returns a RoutingDecision with the selected model — either from an
   * early-exit stage or the safe-cloud-default fallback. Never throws.
   */
  async dispatch(request: RoutingRequest): Promise<RoutingDecision> {
    return this.pipeline.route(request);
  }
}
