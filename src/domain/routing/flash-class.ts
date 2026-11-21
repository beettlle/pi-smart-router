/**
 * Deterministic flash-class capability floor for deep agentic main_loop turns.
 *
 * Shared with typed-judgment consumers (#188): judgment may raise capability
 * requirements, but must never lower them below this deterministic floor.
 */

import type {
  ModelProfile,
  RoutingRequest,
  TurnType,
} from '../types/index.js';
import { classifyTurnEnvelope } from '../triage/turn-envelope.js';

export const DEEP_SESSION_MESSAGE_COUNT_THRESHOLD = 1_000;
export const DEEP_SESSION_ESTIMATED_TOKEN_THRESHOLD = 100_000;
export const FLASH_CLASS_CAPABILITY_FLOOR = 0.7;
export const SESSION_DEPTH_CAPABILITY_FLOOR = 'session_depth_capability_floor';

const FLASH_CLASS_ID_PATTERN = /flash|lite|mini|nano/i;

export interface MainLoopCapabilityFloorResult {
  /** Filtered candidates, or the original array reference when no floor applies. */
  readonly fleet: readonly ModelProfile[];
  /** Flash-class candidates excluded by the floor, in original fleet order. */
  readonly excludedModelIds: readonly string[];
}

/**
 * Capability thresholds are primary; the id pattern conservatively catches
 * named flash variants whose catalog capabilities have not been calibrated.
 */
export function isFlashClassModel(
  model: Pick<ModelProfile, 'id' | 'capabilities'>,
): boolean {
  return (
    model.capabilities.reasoning < FLASH_CLASS_CAPABILITY_FLOOR ||
    model.capabilities.tool_use < FLASH_CLASS_CAPABILITY_FLOOR ||
    FLASH_CLASS_ID_PATTERN.test(model.id)
  );
}

/** Strict issue-#179 boundaries: more than 1,000 messages OR 100k tokens. */
export function isDeepAgenticSession(
  request: Pick<RoutingRequest, 'messages' | 'estimated_input_tokens'>,
): boolean {
  return (
    (request.messages?.length ?? 0) > DEEP_SESSION_MESSAGE_COUNT_THRESHOLD ||
    (request.estimated_input_tokens ?? 0) >
      DEEP_SESSION_ESTIMATED_TOKEN_THRESHOLD
  );
}

/**
 * Exclude flash-class candidates for deep main_loop turns when a healthy
 * higher-capability peer exists. With no such peer, retain the original fleet
 * rather than leaving the host without a usable route. Explicit model forces
 * and non-main_loop turns are unchanged.
 */
export function applyMainLoopCapabilityFloor(
  request: RoutingRequest,
  fleet: readonly ModelProfile[],
  turnType: TurnType = request.turn_type ?? classifyTurnEnvelope(request.messages),
): MainLoopCapabilityFloorResult {
  const unchanged = { fleet, excludedModelIds: [] } as const;
  if (
    request.force_model_id ||
    turnType !== 'main_loop' ||
    !isDeepAgenticSession(request)
  ) {
    return unchanged;
  }

  const hasHigherCapabilityPeer = fleet.some(
    (model) => model.healthy !== false && !isFlashClassModel(model),
  );
  if (!hasHigherCapabilityPeer) {
    return unchanged;
  }

  const excludedModelIds = fleet
    .filter(isFlashClassModel)
    .map((model) => model.id);
  if (excludedModelIds.length === 0) {
    return unchanged;
  }

  return {
    fleet: fleet.filter((model) => !isFlashClassModel(model)),
    excludedModelIds,
  };
}
