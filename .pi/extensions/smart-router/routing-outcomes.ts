import type { RoutingDecision, RoutingRequest } from '../../../src/domain/types/index.js';
import type { SessionRoutingSnapshot } from '../../../src/infrastructure/telemetry/outcome-recorder.js';
import type { StreamDelegationDeps } from './types.js';

export function capturePreRouteOutcomes(
  request: RoutingRequest,
  deps: StreamDelegationDeps,
  priorSnapshot: SessionRoutingSnapshot | undefined,
  hadPin: boolean,
): void {
  if (!priorSnapshot || !deps.outcomeRecorder) {
    return;
  }

  const sessionId = request.session_id;

  if (request.compaction_flag && hadPin) {
    deps.outcomeRecorder.recordCompactionPinBreak(priorSnapshot, sessionId);
  }

  if (request.force_model_id) {
    deps.outcomeRecorder.recordModelOverride(
      priorSnapshot,
      sessionId,
      request.force_model_id,
    );
  }
}

export function updateSessionRoutingSnapshot(
  deps: StreamDelegationDeps,
  sessionId: string | undefined,
  request: RoutingRequest,
  decision: RoutingDecision,
): void {
  if (!sessionId || !deps.sessionRouting) {
    return;
  }

  deps.sessionRouting.set(sessionId, {
    lastRequestId: request.request_id,
    lastSelectedModelId: decision.selected_model_id,
  });
}
