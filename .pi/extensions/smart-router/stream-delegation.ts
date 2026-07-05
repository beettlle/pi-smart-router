import {
  type Api,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai/compat';

import type { RoutingDecision, RoutingFeatureSidecar } from '../../../src/domain/types/index.js';
import { createErrorMessage } from './delegation-runtime.js';
import { routeAndDelegate } from './route-and-delegate.js';
import type { StreamDelegationDeps } from './types.js';

function isRoutingLogEnabled(): boolean {
  return process.env.SMART_ROUTER_LOG_ROUTING === '1';
}

export function logRoutingDecision(
  decision: RoutingDecision,
  delegate?: { provider: string; modelId: string; api: Api },
): void {
  if (!isRoutingLogEnabled()) {
    return;
  }

  console.warn(
    '[smart-router] routing decision',
    JSON.stringify({
      request_id: decision.request_id,
      selected_model_id: decision.selected_model_id,
      tier: decision.tier,
      stage: decision.stage,
      reason_code: decision.reason_code,
      routing_latency_ms: decision.routing_latency_ms,
      features: decision.features ?? null,
      delegate,
    }),
  );
}

/** Read dataset feature sidecar from a routing decision (SP-057). */
export function getRoutingFeatureSidecar(
  decision: RoutingDecision,
): RoutingFeatureSidecar | undefined {
  return decision.features;
}

export function createStreamSimple(deps: StreamDelegationDeps) {
  return function streamSimple(
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream {
    const stream = createAssistantMessageEventStream();

    void (async () => {
      try {
        await routeAndDelegate(context, options, deps, stream);
      } catch (error) {
        stream.push({
          type: 'error',
          reason: options?.signal?.aborted ? 'aborted' : 'error',
          error: createErrorMessage(model, options, error),
        });
        stream.end();
      }
    })();

    return stream;
  };
}

export { resolveDelegationOptions, buildDelegationContext } from './delegation-runtime.js';
export { resolveTargetModel } from './route-and-delegate.js';
