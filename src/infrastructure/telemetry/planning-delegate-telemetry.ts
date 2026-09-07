/**
 * Planning-delegate telemetry builders — SP-276 (#143 bounded split).
 *
 * Planning-delegate observability read from routing decision features, its
 * default telemetry scalars, and the flat telemetry field mapping used by
 * the emitter. Extracted from `routing-telemetry.ts`; the emitter façade
 * re-exports these for import-path stability.
 */

import type {
  PlanningDelegateObservability,
  RoutingDecision,
  RoutingTelemetry,
} from '../../domain/types/index.js';
import { emptyFeatureSidecar } from '../../domain/ports/telemetry-emitter-port.js';

export const PLANNING_DELEGATE_UNAVAILABLE = 'planning_delegate_unavailable' as const;
/** Reason recorded when a delegate sub-call exceeds its timeout budget (SP-213, #120). */
export const PLANNING_DELEGATE_TIMEOUT = 'planning_delegate_timeout' as const;

/** Build planning delegate observability from routing decision features (SP-142). */
export function buildPlanningDelegateObservability(
  decision: RoutingDecision,
): PlanningDelegateObservability | null {
  return decision.features?.planning_delegate ?? null;
}

/** Attach planning delegate observability to routing decision features (SP-142). */
export function enrichRoutingDecisionWithPlanningDelegate(
  decision: RoutingDecision,
  planningDelegate?: PlanningDelegateObservability | null,
): RoutingDecision {
  const observability = planningDelegate ?? buildPlanningDelegateObservability(decision);
  if (!observability) {
    return decision;
  }

  return {
    ...decision,
    features: {
      ...(decision.features ?? emptyFeatureSidecar()),
      planning_delegate: observability,
    },
  };
}

export function defaultPlanningDelegateTelemetry(): Pick<
  RoutingTelemetry,
  | 'planning_delegate_path'
  | 'planning_delegate_primary_model_id'
  | 'planning_delegate_model_id'
  | 'planning_delegate_reason_code'
  | 'planning_delegate_fallback_reason'
  | 'planning_delegate_max_messages'
  | 'planning_delegate_max_tokens'
  | 'planning_delegate_exclude_execution_history'
  | 'planning_delegate_workers_spawned'
  | 'planning_delegate_workers_succeeded'
  | 'planning_delegate_worker_timeout_count'
> {
  return {
    planning_delegate_path: null,
    planning_delegate_primary_model_id: null,
    planning_delegate_model_id: null,
    planning_delegate_reason_code: null,
    planning_delegate_fallback_reason: null,
    planning_delegate_max_messages: null,
    planning_delegate_max_tokens: null,
    planning_delegate_exclude_execution_history: null,
    planning_delegate_workers_spawned: null,
    planning_delegate_workers_succeeded: null,
    planning_delegate_worker_timeout_count: null,
  };
}

/** Default planning delegate telemetry scalars for tests and legacy store reads. */
export const DEFAULT_PLANNING_DELEGATE_TELEMETRY_FIELDS = defaultPlanningDelegateTelemetry();

export function planningDelegateTelemetryFromDecision(
  decision: RoutingDecision,
): ReturnType<typeof defaultPlanningDelegateTelemetry> {
  const observability = buildPlanningDelegateObservability(decision);
  if (!observability) {
    return defaultPlanningDelegateTelemetry();
  }

  return {
    planning_delegate_path: observability.path === 'none' ? null : observability.path,
    planning_delegate_primary_model_id: observability.primary_model_id,
    planning_delegate_model_id: observability.delegate_model_id,
    planning_delegate_reason_code: observability.planning_delegate_reason_code,
    planning_delegate_fallback_reason: observability.fallback_reason,
    planning_delegate_max_messages: observability.compressed_context?.max_messages ?? null,
    planning_delegate_max_tokens: observability.compressed_context?.max_tokens ?? null,
    planning_delegate_exclude_execution_history:
      observability.compressed_context?.exclude_execution_history ?? null,
    planning_delegate_workers_spawned: observability.workers_spawned,
    planning_delegate_workers_succeeded: observability.workers_succeeded,
    planning_delegate_worker_timeout_count: observability.worker_timeout_count,
  };
}
