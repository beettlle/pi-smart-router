/**
 * Pin-economics telemetry builders — SP-276 (#143 bounded split).
 *
 * SAAR / cache-breakeven / flip-flop observability derived from session
 * pinner state, their default telemetry scalars, and the decision-feature
 * enrichment that surfaces pin economics on explain payloads. Extracted
 * from `routing-telemetry.ts`; the emitter façade re-exports these for
 * import-path stability.
 */

import { evaluateModelSwitchBreakeven } from '../../domain/pinning/session-pinner.js';
import type { SessionPinner } from '../../domain/pinning/session-pinner.js';
import {
  FLIP_FLOP_SHADOW_TIER_FLIP,
  FLIP_FLOP_SHADOW_TIER_PINNED,
} from '../../domain/pinning/flip-flop-guard.js';
import { selectLowestCostModel } from '../../domain/pinning/sub-route-policy.js';
import type {
  BreakevenObservability,
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingRequest,
  RoutingTelemetry,
  SaarConfig,
  SaarObservability,
  Tier,
} from '../../domain/types/index.js';
import type { QuotaWindowPosition } from '../../domain/types/entities.js';
import type { VirtualCostV2Config } from '../../domain/types/schemas.js';
import { emptyFeatureSidecar } from '../../domain/ports/telemetry-emitter-port.js';

export interface PinEconomicsObservabilityInput {
  readonly request: RoutingRequest;
  readonly decision: RoutingDecision;
  readonly fleet?: readonly ModelProfile[] | undefined;
  readonly sessionPinner?: SessionPinner | undefined;
  readonly saarConfig?: SaarConfig | undefined;
  readonly priceCatalog?: PriceCatalog | null;
  readonly quotaWindowPosition?: QuotaWindowPosition;
  readonly virtualCostV2Config?: VirtualCostV2Config;
}

/** Cache breakeven gate observability with virtual cost v2 scalars (SP-149). */
export interface BreakevenObservabilityV2 extends BreakevenObservability {
  readonly quota_premium_usd: number | null;
  readonly kv_cache_credit_usd: number | null;
}

export const BREAKEVEN_BLOCKED = 'breakeven_blocked' as const;
export const BREAKEVEN_PASS = 'breakeven_pass' as const;
export const SAAR_BUFFER_ACTIVE = 'saar_buffer_active' as const;
export const SAAR_HARD_LOCK = 'saar_hard_lock' as const;

export const FLIP_FLOP_TIER_FLIP = FLIP_FLOP_SHADOW_TIER_FLIP;
export const FLIP_FLOP_TIER_PINNED = FLIP_FLOP_SHADOW_TIER_PINNED;

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

/** Flip-flop shadow log observability (SP-155, #82). */
export interface FlipFlopObservability {
  readonly consecutive_tier_flips: number;
  readonly tier_pinned: Tier | null;
  readonly shadow_event: string | null;
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

/** Build flip-flop shadow log observability from session pinner state (SP-155). */
export function buildFlipFlopObservability(
  input: PinEconomicsObservabilityInput,
): FlipFlopObservability | null {
  const { request, sessionPinner } = input;
  if (!sessionPinner) {
    return null;
  }

  const observation = sessionPinner.getLastFlipFlopObservation();
  const state = sessionPinner.getFlipFlopState(request.session_id);
  if (!observation && !state) {
    return null;
  }

  return {
    consecutive_tier_flips:
      observation?.consecutive_tier_flips ?? state?.consecutive_tier_flips ?? 0,
    tier_pinned: observation?.tier_pinned ?? state?.tier_pinned ?? null,
    shadow_event: observation?.shadow_event ?? null,
  };
}

/** Build cache breakeven breakdown when a pin would switch tiers (SP-126, SP-149). */
export function buildBreakevenObservability(
  input: PinEconomicsObservabilityInput,
): BreakevenObservabilityV2 | null {
  const {
    request,
    sessionPinner,
    saarConfig,
    fleet,
    priceCatalog = null,
    quotaWindowPosition,
    virtualCostV2Config,
  } = input;
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
  const breakevenContext =
    quotaWindowPosition !== undefined || virtualCostV2Config !== undefined
      ? {
          priceCatalog,
          ...(quotaWindowPosition !== undefined ? { quotaWindowPosition } : {}),
          ...(virtualCostV2Config !== undefined ? { virtualCostV2Config } : {}),
        }
      : undefined;
  const breakeven = evaluateModelSwitchBreakeven(
    pinnedModel,
    candidate,
    tokenEstimate,
    tokenEstimate,
    saarConfig,
    breakevenContext,
  );

  return {
    marginal_savings: breakeven.marginal_savings,
    future_cache_value: breakeven.future_cache_value,
    cache_reprime_cost: breakeven.cache_reprime_cost,
    decision: breakeven.shouldSwitch ? 'pass' : 'blocked',
    breakeven_reason_code: breakeven.shouldSwitch ? BREAKEVEN_PASS : BREAKEVEN_BLOCKED,
    quota_premium_usd: breakeven.quota_premium_usd,
    kv_cache_credit_usd: breakeven.kv_cache_credit_usd,
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

export type FlipFlopTelemetryFields = {
  readonly flip_flop_consecutive_tier_flips: number | null;
  readonly flip_flop_tier_pinned: Tier | null;
  readonly flip_flop_shadow_event: string | null;
};

function defaultFlipFlopTelemetry(): FlipFlopTelemetryFields {
  return {
    flip_flop_consecutive_tier_flips: null,
    flip_flop_tier_pinned: null,
    flip_flop_shadow_event: null,
  };
}

/** Default breakeven telemetry scalars for tests and legacy store reads. */
export const DEFAULT_BREAKEVEN_TELEMETRY_FIELDS = defaultBreakevenTelemetry();

/** Default SAAR telemetry scalars for tests and legacy store reads. */
export const DEFAULT_SAAR_TELEMETRY_FIELDS = defaultSaarTelemetry();

export function pinEconomicsTelemetryFromInput(
  input: PinEconomicsObservabilityInput,
): ReturnType<typeof defaultBreakevenTelemetry> &
  ReturnType<typeof defaultSaarTelemetry> &
  FlipFlopTelemetryFields {
  const breakeven = buildBreakevenObservability(input);
  const saar = buildSaarObservability(input);
  const flipFlop = buildFlipFlopObservability(input);

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
    ...(flipFlop
      ? {
          flip_flop_consecutive_tier_flips: flipFlop.consecutive_tier_flips,
          flip_flop_tier_pinned: flipFlop.tier_pinned,
          flip_flop_shadow_event: flipFlop.shadow_event,
        }
      : defaultFlipFlopTelemetry()),
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
  const flipFlop = buildFlipFlopObservability(input);

  if (!breakeven && !saar && !flipFlop) {
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
