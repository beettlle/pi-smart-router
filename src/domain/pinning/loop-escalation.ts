/**
 * Loop escalation — FR-014, FR-008 rule #3 / #4.
 *
 * Detects bounded repeated identical tool failures and signals
 * session pin escalation to a frontier-capable tier.
 *
 * Escalation fires once per session; no tier oscillation (FR-008).
 * Threshold defaults to 3 identical tool failures (operator configurable).
 *
 * Zero-tier observational pin-break (SP-178 / #99):
 * SAAR pins preserve prefix-cache value, but a zero-tier pin that faces
 * unsupported/unknown tools or sustained tool-loop churn is a capability
 * mismatch — the same class of observational signal as identical tool
 * failures (FR-014). Escalation reuses the `loop_escalation` pin reason
 * (allowed FR-008 break) rather than inventing a cache-economics bypass.
 * Voluntary cross-provider switches still go through breakeven; this path
 * only fires on observational evidence that the pinned zero-tier model
 * cannot complete the tool loop.
 *
 * Design: pure evaluation function — caller (pipeline stage) is
 * responsible for applying pin state updates via SessionPinner.
 */

import type { ModelProfile, RoutingRequest, SessionPin } from '../types/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoopEscalationConfig {
  readonly threshold: number;
  /**
   * Tool-result turns while pinned to zero-tier before observational escalate.
   * Defaults to `threshold` when omitted (same operator knob, no schema change).
   */
  readonly zero_tier_tool_call_threshold?: number;
}

export interface LoopEscalationResult {
  readonly shouldEscalate: boolean;
  readonly updatedPin: SessionPin | null;
  readonly escalationTarget: ModelProfile | null;
  readonly reason: string;
}

/** Stable signature for zero-tier tool-call churn counting (SP-178). */
export const ZERO_TIER_TOOL_CHURN_SIGNATURE = 'zt:tool_churn' as const;

// ─── Failure signature extraction ─────────────────────────────────────────────

const FAILURE_PATTERNS = [
  'error',
  'fail',
  'exception',
  'timed out',
  'timeout',
  'econnrefused',
  'enotfound',
  'econnreset',
  'epipe',
] as const;

/** Host/agent signals that the model invoked a tool the runtime does not expose. */
const UNSUPPORTED_TOOL_PATTERNS = [
  'unknown tool',
  'unsupported tool',
  'tool not found',
  'no such tool',
  'unrecognized tool',
  'is not a valid tool',
  'tool does not exist',
  'not a known tool',
] as const;

/**
 * Extract a tool-failure signature from the request's messages.
 * Returns null when the request does not carry a tool failure.
 *
 * Only inspects tool_result turns — other turn types cannot
 * carry observational failure signals (FR-014: no post-generation judging).
 */
export function extractToolFailureSignature(request: RoutingRequest): string | null {
  const content = latestToolContent(request);
  if (content === null) return null;
  if (looksLikeFailure(content)) {
    return computeSignature(content);
  }
  return null;
}

/**
 * True when the latest tool result reports an unsupported/unknown tool
 * (capability mismatch — escalate immediately on zero-tier pins).
 */
export function isUnsupportedOrUnknownToolResult(request: RoutingRequest): boolean {
  const content = latestToolContent(request);
  if (content === null) return false;
  const lower = content.toLowerCase();
  return UNSUPPORTED_TOOL_PATTERNS.some((p) => lower.includes(p));
}

function latestToolContent(request: RoutingRequest): string | null {
  const msgs = request.messages;
  if (!msgs || msgs.length === 0) return null;

  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i]!;
    if (msg.role === 'tool') {
      return msg.content;
    }
    return null;
  }
  return null;
}

function looksLikeFailure(content: string): boolean {
  const lower = content.toLowerCase();
  return FAILURE_PATTERNS.some((p) => lower.includes(p));
}

/** Deterministic djb2 hash of normalised error content. */
function computeSignature(content: string): string {
  const normalized = content.trim().slice(0, 256).toLowerCase();
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h + normalized.charCodeAt(i)) | 0;
  }
  return `tf:${(h >>> 0).toString(16)}`;
}

function resolvePinnedTier(
  pin: SessionPin,
  fleet: readonly ModelProfile[],
): ModelProfile['tier'] | null {
  return fleet.find((m) => m.id === pin.pinned_model_id)?.tier ?? null;
}

function resolveZeroTierToolCallThreshold(config: LoopEscalationConfig): number {
  return config.zero_tier_tool_call_threshold ?? config.threshold;
}

function tryEscalate(
  pin: SessionPin,
  fleet: readonly ModelProfile[],
  updated: SessionPin,
  reason: string,
): LoopEscalationResult {
  const target = selectEscalationTarget(fleet, pin.pinned_model_id);
  if (target) {
    return {
      shouldEscalate: true,
      updatedPin: updated,
      escalationTarget: target,
      reason,
    };
  }
  return {
    shouldEscalate: false,
    updatedPin: updated,
    escalationTarget: null,
    reason: 'no_frontier_available',
  };
}

/**
 * Zero-tier pin: unsupported tool → immediate escalate; else count every
 * tool_result turn and escalate after N (observational agentic churn).
 */
function evaluateZeroTierObservationalBreak(
  pin: SessionPin,
  request: RoutingRequest,
  fleet: readonly ModelProfile[],
  config: LoopEscalationConfig,
): LoopEscalationResult {
  const now = new Date().toISOString();

  if (isUnsupportedOrUnknownToolResult(request)) {
    const updated: SessionPin = {
      ...pin,
      consecutive_tool_failures: Math.max(pin.consecutive_tool_failures, 1),
      last_tool_failure_signature: 'zt:unsupported_tool',
      updated_at: now,
    };
    return tryEscalate(pin, fleet, updated, 'zero_tier_unsupported_tool');
  }

  const churnThreshold = resolveZeroTierToolCallThreshold(config);
  const isChurn = pin.last_tool_failure_signature === ZERO_TIER_TOOL_CHURN_SIGNATURE;
  const newCount = isChurn ? pin.consecutive_tool_failures + 1 : 1;
  const updated: SessionPin = {
    ...pin,
    consecutive_tool_failures: newCount,
    last_tool_failure_signature: ZERO_TIER_TOOL_CHURN_SIGNATURE,
    updated_at: now,
  };

  if (newCount >= churnThreshold) {
    return tryEscalate(pin, fleet, updated, 'zero_tier_tool_churn');
  }

  return {
    shouldEscalate: false,
    updatedPin: updated,
    escalationTarget: null,
    reason: 'zero_tier_below_threshold',
  };
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/**
 * Evaluate whether the session should escalate to a higher tier.
 *
 * Pure function — does not mutate pin state. Returns `updatedPin`
 * when the caller should persist new failure-tracking state.
 *
 * Caller applies updates via `SessionPinner.loadPin()`, and on
 * escalation via `breakPin()` + `recordPin()`.
 */
export function evaluateLoopEscalation(
  pin: SessionPin | null,
  request: RoutingRequest,
  fleet: readonly ModelProfile[],
  config: LoopEscalationConfig,
): LoopEscalationResult {
  if (!pin) {
    return noEscalation('no_pin');
  }

  if (pin.pin_reason === 'loop_escalation') {
    return noEscalation('already_escalated');
  }

  if (request.turn_type !== 'tool_result') {
    return noEscalation('not_tool_result');
  }

  if (resolvePinnedTier(pin, fleet) === 'zero-tier') {
    return evaluateZeroTierObservationalBreak(pin, request, fleet, config);
  }

  const signature = extractToolFailureSignature(request);

  if (!signature) {
    if (pin.consecutive_tool_failures > 0) {
      return {
        shouldEscalate: false,
        updatedPin: {
          ...pin,
          consecutive_tool_failures: 0,
          last_tool_failure_signature: null,
          updated_at: new Date().toISOString(),
        },
        escalationTarget: null,
        reason: 'success_reset',
      };
    }
    return noEscalation('no_failure');
  }

  const isIdentical = pin.last_tool_failure_signature === signature;
  const newCount = isIdentical ? pin.consecutive_tool_failures + 1 : 1;

  const updated: SessionPin = {
    ...pin,
    consecutive_tool_failures: newCount,
    last_tool_failure_signature: signature,
    updated_at: new Date().toISOString(),
  };

  if (newCount >= config.threshold) {
    return tryEscalate(pin, fleet, updated, 'threshold_exceeded');
  }

  return {
    shouldEscalate: false,
    updatedPin: updated,
    escalationTarget: null,
    reason: 'below_threshold',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noEscalation(reason: string): LoopEscalationResult {
  return { shouldEscalate: false, updatedPin: null, escalationTarget: null, reason };
}

/** Select the best healthy frontier-cloud model that differs from the current pin. */
function selectEscalationTarget(
  fleet: readonly ModelProfile[],
  currentModelId: string,
): ModelProfile | null {
  return (
    fleet.find(
      (m) => m.tier === 'frontier-cloud' && m.id !== currentModelId && m.healthy !== false,
    ) ?? null
  );
}
