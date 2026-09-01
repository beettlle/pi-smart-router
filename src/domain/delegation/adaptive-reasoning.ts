/**
 * Adaptive reasoning policy — SP-245, #166 (partial).
 *
 * Computes the effective `reasoning` / thinking intensity for a delegated
 * provider call from turn signals so chatty models stay concise on routine
 * tool loops and only "think hard" when planning / escalation demands it.
 *
 * Policy table (defaults):
 *   - tool_result turns          → minimal
 *   - main_loop turns            → low
 *   - planning turns / planning_delegate → medium
 *   - frontier escalation (tier or loop_escalation) → high
 *
 * Merge invariants:
 *   1. pi's ambient session default (`SESSION_AMBIENT_THINKING_LEVEL`, pi's
 *      DEFAULT_THINKING_LEVEL = 'medium') is adjustable by policy — that is
 *      the dogfood case (#166): the host passes the session level on every
 *      turn and the router chooses a smart default instead of blindly passing
 *      it through.
 *   2. Any other caller `reasoning` is treated as an explicit operator
 *      `/thinking` choice and is never lowered — policy may only raise it when
 *      the turn class upgrades.
 *   3. Pin continuation inherits the session level unless the turn class
 *      upgrades above it.
 *   4. Policy never raises past the model-supported max (levels mapped to
 *      `null` in `thinkingLevelMap` are unsupported; policy level clamps down).
 *   5. Fail open: models without reasoning support pass caller options through
 *      unchanged; providers that ignore reasoning options degrade to a no-op.
 *   6. Operator knobs (SP-246): `enabled: false` skips the policy entirely;
 *      floor/ceiling bound only policy-derived levels and never lower an
 *      explicit operator `/thinking` choice.
 *
 * Telemetry (`reasoning_level_requested` / `reasoning_level_applied` /
 * `reasoning_reason_code`) is emitted by the extension delegation path (SP-246).
 */

import type {
  Api,
  Context,
  Model,
  ThinkingLevel,
} from '@earendil-works/pi-ai/compat';

import type {
  ModelProfile,
  RoutingDecision,
  TurnType,
} from '../types/index.js';

/**
 * pi's DEFAULT_THINKING_LEVEL — the ambient session level the host passes on
 * every stream call when the operator has not chosen an explicit `/thinking`.
 * Policy may adjust this level; any other caller level is an explicit operator
 * floor (never lowered).
 */
export const SESSION_AMBIENT_THINKING_LEVEL: ThinkingLevel = 'medium';

/** Profiles at or above this verbosity_factor are "chatty" (GLM-class). */
export const HIGH_VERBOSITY_FACTOR_THRESHOLD = 1.5;

/** Light conciseness nudge appended to the delegated system prompt. */
export const CONCISENESS_SUFFIX =
  'Be concise: answer directly and keep narration before tool calls to a minimum.';

/** Reason codes for the adaptive reasoning decision (telemetry in SP-246). */export type AdaptiveReasoningReasonCode =
  | 'adaptive_reasoning_disabled'
  | 'reasoning_unsupported'
  | 'no_policy_signal'
  | 'turn_envelope_tool_result'
  | 'turn_envelope_main_loop'
  | 'planning_turn'
  | 'frontier_escalation'
  | 'operator_thinking_floor'
  | 'operator_thinking_upgrade'
  | 'operator_floor_applied'
  | 'operator_ceiling_applied'
  | 'pin_inherit_session'
  | 'pin_turn_class_upgrade';

/** Turn-class signals available at route/delegation time. */
export interface AdaptiveReasoningSignal {
  /** Turn envelope classification from the routing request. */
  readonly turnType?: TurnType | undefined;
  /** Routing decision for this delegation (tier / stage / reason_code). */
  readonly decision?: RoutingDecision | undefined;
  /** Fleet profile of the delegation target (verbosity_factor). */
  readonly profile?: ModelProfile | undefined;
}

export interface AdaptiveReasoningResult {
  /**
   * Effective reasoning level to merge into delegation stream options.
   * `undefined` → leave caller options untouched (fail open / no signal).
   */
  readonly reasoning: ThinkingLevel | undefined;
  readonly reasonCode: AdaptiveReasoningReasonCode;
  /** True when a light conciseness suffix should be appended to the prompt. */
  readonly concisenessHint: boolean;
}

/**
 * Operator knobs (SP-246, #166): enable/disable + optional floor/ceiling on
 * policy-derived levels. Floor/ceiling are discrete thinking levels — never a
 * free-form verbosity percent. They bind only what the policy itself derives;
 * an explicit operator `/thinking` choice is never lowered (and never raised
 * by the floor — live session choice beats static config).
 */
export interface AdaptiveReasoningOptions {
  /** When false, skip the policy: caller reasoning passes through unchanged. */
  readonly enabled?: boolean;
  /** Floor: policy-derived levels are raised to at least this level. */
  readonly floor?: ThinkingLevel;
  /** Ceiling: policy-derived levels are capped at this level. */
  readonly ceiling?: ThinkingLevel;
}

// ─── Level ordering ──────────────────────────────────────────────────────────

const REASONING_LEVEL_RANK: Readonly<Record<ThinkingLevel, number>> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
};

const REASONING_LEVELS_BY_RANK: readonly ThinkingLevel[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export function rankReasoningLevel(level: ThinkingLevel): number {
  return REASONING_LEVEL_RANK[level];
}

// ─── Model support ───────────────────────────────────────────────────────────

/**
 * A level is supported unless the model's thinkingLevelMap explicitly maps it
 * to `null` (pi-ai: "Missing keys use provider defaults. null marks a level as
 * unsupported.").
 */
function isLevelSupported(model: Model<Api>, level: ThinkingLevel): boolean {
  return model.thinkingLevelMap?.[level] !== null;
}

/**
 * Clamp a policy level down to the nearest supported level at or below it.
 * Returns undefined when the model supports no level at or below `level`.
 */
export function clampToSupportedLevel(
  level: ThinkingLevel,
  model: Model<Api>,
): ThinkingLevel | undefined {
  for (let rank = rankReasoningLevel(level); rank >= 0; rank--) {
    const candidate = REASONING_LEVELS_BY_RANK[rank]!;
    if (isLevelSupported(model, candidate)) {
      return candidate;
    }
  }
  return undefined;
}

// ─── Turn classification ─────────────────────────────────────────────────────

export type ReasoningTurnClass =
  | 'routine'
  | 'planning'
  | 'escalation'
  | 'unknown';

/** planning_delegate reason code emitted by the pipeline (SP-144, #71). */
const PLANNING_DELEGATE_REASON_CODE = 'planning_delegate';

export function classifyReasoningTurn(
  signal: AdaptiveReasoningSignal,
): ReasoningTurnClass {
  const { turnType, decision } = signal;

  if (
    turnType === 'planning' ||
    decision?.reason_code === PLANNING_DELEGATE_REASON_CODE
  ) {
    return 'planning';
  }

  if (
    decision?.tier === 'frontier-cloud' ||
    decision?.stage === 'loop_escalation'
  ) {
    return 'escalation';
  }

  if (turnType === 'tool_result' || turnType === 'main_loop') {
    return 'routine';
  }

  return 'unknown';
}

function policyLevelFor(
  turnClass: ReasoningTurnClass,
  turnType: TurnType | undefined,
): ThinkingLevel | undefined {
  switch (turnClass) {
    case 'routine':
      return turnType === 'tool_result' ? 'minimal' : 'low';
    case 'planning':
      return 'medium';
    case 'escalation':
      return 'high';
    case 'unknown':
      return undefined;
  }
}

function policyReasonCode(
  turnClass: ReasoningTurnClass,
  turnType: TurnType | undefined,
): AdaptiveReasoningReasonCode {
  switch (turnClass) {
    case 'routine':
      return turnType === 'tool_result'
        ? 'turn_envelope_tool_result'
        : 'turn_envelope_main_loop';
    case 'planning':
      return 'planning_turn';
    case 'escalation':
      return 'frontier_escalation';
    case 'unknown':
      return 'no_policy_signal';
  }
}

function isPinContinuation(decision: RoutingDecision | undefined): boolean {
  return (
    decision?.stage === 'session_pin' ||
    decision?.reason_code === 'session_pinned'
  );
}

// ─── Policy resolution ───────────────────────────────────────────────────────

/**
 * Resolve the effective reasoning level for a delegated call.
 *
 * `callerReasoning` is the host-provided `options.reasoning` (pi session
 * thinking level). See module doc for the merge invariants.
 *
 * `options` (SP-246, #166) carries the operator enable/disable + floor/ceiling
 * knobs. Semantics:
 *   - `enabled: false` → pass caller reasoning through unchanged
 *     (`adaptive_reasoning_disabled`).
 *   - `floor` raises policy-derived levels to at least the floor.
 *   - `ceiling` caps policy-derived levels (including turn-class upgrades) at
 *     the ceiling. When floor > ceiling the ceiling wins (cost-safe).
 *   - Neither knob ever *lowers* an explicit operator `/thinking` choice.
 */
export function resolveAdaptiveReasoning(
  targetModel: Model<Api>,
  signal: AdaptiveReasoningSignal,
  callerReasoning?: ThinkingLevel,
  options?: AdaptiveReasoningOptions,
): AdaptiveReasoningResult {
  // Operator master switch (SP-246): policy off — pass caller through.
  if (options && options.enabled === false) {
    return {
      reasoning: callerReasoning,
      reasonCode: 'adaptive_reasoning_disabled',
      concisenessHint: false,
    };
  }

  // Fail open: model does not support reasoning options — pass caller through.
  if (!targetModel.reasoning) {
    return {
      reasoning: callerReasoning,
      reasonCode: 'reasoning_unsupported',
      concisenessHint: false,
    };
  }

  const turnClass = classifyReasoningTurn(signal);
  const policyLevel = policyLevelFor(turnClass, signal.turnType);
  if (!policyLevel) {
    return {
      reasoning: callerReasoning,
      reasonCode: 'no_policy_signal',
      concisenessHint: false,
    };
  }

  const clamped = clampToSupportedLevel(policyLevel, targetModel);
  if (!clamped) {
    // Model claims reasoning support but maps every level ≤ policy to null —
    // fail open rather than guess.
    return {
      reasoning: callerReasoning,
      reasonCode: 'reasoning_unsupported',
      concisenessHint: false,
    };
  }

  // SP-246 (#166): operator floor/ceiling bind the policy-derived level.
  // Applied before the caller merge so turn-class comparisons use the
  // bounded level; re-clamped down to model support afterwards.
  let bounded = clamped;
  if (options?.floor && rankReasoningLevel(bounded) < rankReasoningLevel(options.floor)) {
    bounded = options.floor;
  }
  if (
    options?.ceiling &&
    rankReasoningLevel(bounded) > rankReasoningLevel(options.ceiling)
  ) {
    bounded = options.ceiling;
  }
  const effectivePolicyLevel =
    bounded === clamped ? clamped : clampToSupportedLevel(bounded, targetModel);
  if (!effectivePolicyLevel) {
    return {
      reasoning: callerReasoning,
      reasonCode: 'reasoning_unsupported',
      concisenessHint: false,
    };
  }

  let reasoning: ThinkingLevel;
  let reasonCode: AdaptiveReasoningReasonCode;

  if (callerReasoning && callerReasoning !== SESSION_AMBIENT_THINKING_LEVEL) {
    // Explicit operator /thinking — never lowered; turn class may upgrade it.
    if (
      rankReasoningLevel(effectivePolicyLevel) > rankReasoningLevel(callerReasoning)
    ) {
      reasoning = effectivePolicyLevel;
      reasonCode = 'operator_thinking_upgrade';
    } else {
      reasoning = callerReasoning;
      reasonCode = 'operator_thinking_floor';
    }
  } else if (callerReasoning && isPinContinuation(signal.decision)) {
    // Pin continuation inherits the (ambient) session level unless the turn
    // class upgrades above it.
    if (
      rankReasoningLevel(effectivePolicyLevel) > rankReasoningLevel(callerReasoning)
    ) {
      reasoning = effectivePolicyLevel;
      reasonCode = 'pin_turn_class_upgrade';
    } else {
      reasoning = callerReasoning;
      reasonCode = 'pin_inherit_session';
    }
  } else {
    // Ambient session default or no caller level — pure policy.
    reasoning = effectivePolicyLevel;
    reasonCode = policyReasonCode(turnClass, signal.turnType);
  }

  // SP-246 (#166): when a floor/ceiling knob materially changed the applied
  // level (merged outcome IS the bounded policy level, distinct from the raw
  // turn-class level), surface that in the reason code so operators can audit
  // whether their bounds are doing anything.
  if (effectivePolicyLevel !== clamped && reasoning === effectivePolicyLevel) {
    reasonCode =
      rankReasoningLevel(effectivePolicyLevel) > rankReasoningLevel(clamped)
        ? 'operator_floor_applied'
        : 'operator_ceiling_applied';
  }

  const verbosityFactor = signal.profile?.performance?.verbosity_factor ?? 1;
  const concisenessHint =
    (reasoning === 'minimal' || reasoning === 'low') &&
    verbosityFactor >= HIGH_VERBOSITY_FACTOR_THRESHOLD;

  return { reasoning, reasonCode, concisenessHint };
}

// ─── Context conciseness hint ────────────────────────────────────────────────

/**
 * Append the light conciseness suffix to the delegated system prompt when the
 * policy result calls for it (effective level low/minimal + high
 * verbosity_factor profile). Not a prompt rewrite — a single nudge line.
 */
export function applyConcisenessHint(
  context: Context,
  result: AdaptiveReasoningResult | undefined,
): Context {
  if (!result?.concisenessHint) {
    return context;
  }
  const existing = context.systemPrompt ?? '';
  if (existing.includes(CONCISENESS_SUFFIX)) {
    return context;
  }
  return {
    ...context,
    systemPrompt: existing
      ? `${existing}\n\n${CONCISENESS_SUFFIX}`
      : CONCISENESS_SUFFIX,
  };
}
