/**
 * Gemini tool-history guard — SP-077, narrowed SP-129, expanded SP-232.
 *
 * Excludes Google/Gemini fleet entries only when session history contains
 * tool-call replay state that delegation repair cannot make Google-safe.
 * Unsigned cross-provider toolCalls are silently sentinel-repaired (SP-231)
 * and stay routable to Gemini; the guard fires on repair-unsafe state:
 * redacted thinking (any origin — SP-231 identity alignment replays it to
 * Google as-is) and foreign non-Google signatures that repair preserves but
 * Google rejects, plus unrepairable Google-origin replay state (SP-129).
 */

import type { Message as PiMessage } from '@earendil-works/pi-ai/compat';

import {
  GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL,
  isGoogleOriginAssistantMessage,
} from '../delegation/delegation-context.js';
import type { Message as RoutingMessage, ModelProfile, RoutingRequest } from '../types/index.js';

export const GEMINI_TOOL_HISTORY_EXCLUDED = 'gemini_tool_history_excluded' as const;
export const GEMINI_TOOL_HISTORY_EMPTY_FLEET = 'gemini_tool_history_empty_fleet' as const;

const GOOGLE_GEMINI_PROVIDER_ALIASES = new Set([
  'google',
  'google-gemini',
  'google-generative-ai',
  'gemini',
]);

export interface GeminiToolHistoryGuardResult {
  readonly effectiveFleet: readonly ModelProfile[];
  readonly excluded: boolean;
  readonly reasonCode?: typeof GEMINI_TOOL_HISTORY_EXCLUDED;
  /** True when Gemini exclusion removed every fleet entry (SP-084). */
  readonly fleetEmptyAfterFilter?: boolean;
}

export class GeminiToolHistoryEmptyFleetError extends Error {
  readonly reasonCode = GEMINI_TOOL_HISTORY_EMPTY_FLEET;

  constructor() {
    super(
      'Gemini tool-history guard removed all models from the scoped fleet. ' +
        'Add a non-Google model (e.g. openai/gpt-4o-mini or cursor/auto), start a fresh session with /new, ' +
        'or pin a model with /model until pi preserves thought signatures upstream (earendil-works/pi#6342).',
    );
    this.name = 'GeminiToolHistoryEmptyFleetError';
  }
}

export function assertRoutableFleetAfterGeminiToolHistoryGuard(
  result: GeminiToolHistoryGuardResult,
): void {
  if (result.fleetEmptyAfterFilter) {
    throw new GeminiToolHistoryEmptyFleetError();
  }
}

export function isGoogleGeminiProfile(profile: ModelProfile): boolean {
  const provider = profile.provider.trim().toLowerCase();
  if (GOOGLE_GEMINI_PROVIDER_ALIASES.has(provider)) {
    return true;
  }

  if (provider.includes('google') || provider.includes('gemini')) {
    return true;
  }

  // Cursor Gemini aliases may register under cursor with gemini model ids.
  if (provider === 'cursor' && /gemini/i.test(profile.id)) {
    return true;
  }

  return /gemini/i.test(profile.id) && provider.includes('google');
}

export function hasToolCallHistoryFromContext(
  messages: readonly PiMessage[],
): boolean {
  for (const message of messages) {
    if (message.role === 'toolResult') {
      return true;
    }

    if (message.role === 'assistant') {
      for (const block of message.content) {
        if (block.type === 'toolCall') {
          return true;
        }
      }
    }
  }

  return false;
}

export function hasToolCallHistory(
  messages: readonly RoutingMessage[],
): boolean {
  for (const message of messages) {
    if (message.role === 'tool') {
      return true;
    }

    if (message.role === 'assistant') {
      if (message.tool_blocks !== undefined && message.tool_blocks.length > 0) {
        return true;
      }
    }
  }

  return false;
}

/** Google-origin assistant toolCall blocks in pi-ai context (SP-127 detector). */
export function hasGoogleReplayRiskFromContext(
  messages: readonly PiMessage[],
): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }

    if (!isGoogleOriginAssistantMessage(message)) {
      continue;
    }

    for (const block of message.content) {
      if (block.type === 'toolCall') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Routing messages lack provider/api metadata, so Google-origin replay risk
 * cannot be detected reliably — defer to contextMessages in resolveEffectiveFleet.
 */
export function hasGoogleReplayRisk(
  messages: readonly RoutingMessage[],
): boolean {
  // Routing messages lack provider/api metadata; Google-origin detection uses contextMessages.
  void messages;
  return false;
}

/**
 * Replay-sensitive state on Google-origin turns that SP-128 repair does not rewrite
 * (redacted thinking, thinking signatures, text signatures).
 */
export function hasUnrepairableGoogleReplayStateFromContext(
  messages: readonly PiMessage[],
): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }

    if (!isGoogleOriginAssistantMessage(message)) {
      continue;
    }

    for (const block of message.content) {
      if (block.type === 'thinking') {
        if (block.redacted) {
          return true;
        }
        if (block.thinkingSignature && block.thinkingSignature.length > 0) {
          return true;
        }
      }

      if (block.type === 'text' && block.textSignature && block.textSignature.length > 0) {
        return true;
      }
    }
  }

  return false;
}

export function hasUnrepairableGoogleReplayRiskFromContext(
  messages: readonly PiMessage[],
): boolean {
  return (
    hasGoogleReplayRiskFromContext(messages) &&
    hasUnrepairableGoogleReplayStateFromContext(messages)
  );
}

/**
 * Replay state repair cannot make Google-safe on cross-provider turns (SP-232, #158).
 *
 * SP-231 aligns every assistant identity to the Google delegation target, so
 * replay-sensitive blocks from ANY origin reach the Google API. Redacted
 * thinking cannot be fabricated and foreign signatures (Claude/GLM/OpenAI
 * thinking, text, or toolCall signatures) are preserved by repair but rejected
 * by Google — the previously injected skip sentinel is Google-accepted and
 * does not count as a foreign signature.
 */
export function hasCrossProviderUnrepairableReplayStateFromContext(
  messages: readonly PiMessage[],
): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }

    const googleOrigin = isGoogleOriginAssistantMessage(message);

    for (const block of message.content) {
      if (block.type === 'thinking') {
        // Redacted thinking is unrepairable from any origin; Google-origin
        // signed thinking is covered by hasUnrepairableGoogleReplayStateFromContext.
        if (block.redacted) {
          return true;
        }
        if (
          !googleOrigin &&
          block.thinkingSignature &&
          block.thinkingSignature.length > 0
        ) {
          return true;
        }
      }

      if (
        !googleOrigin &&
        block.type === 'text' &&
        block.textSignature &&
        block.textSignature.length > 0
      ) {
        return true;
      }

      if (
        !googleOrigin &&
        block.type === 'toolCall' &&
        block.thoughtSignature &&
        block.thoughtSignature.length > 0 &&
        block.thoughtSignature !== GEMINI_SKIP_THOUGHT_SIGNATURE_SENTINEL
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Cross-provider replay risk: tool history present AND repair-unsafe replay
 * state on a non-Google turn (SP-232). Tool-history coupling keeps text-only
 * sessions routable to Gemini.
 */
export function hasUnrepairableCrossProviderReplayRiskFromContext(
  messages: readonly PiMessage[],
): boolean {
  return (
    hasToolCallHistoryFromContext(messages) &&
    hasCrossProviderUnrepairableReplayStateFromContext(messages)
  );
}

function sessionHasGoogleReplayRisk(
  request: RoutingRequest,
  contextMessages?: readonly PiMessage[],
): boolean {
  if (contextMessages !== undefined && contextMessages.length > 0) {
    return hasGoogleReplayRiskFromContext(contextMessages);
  }

  return hasGoogleReplayRisk(request.messages ?? []);
}

function sessionHasGoogleUnsafeToolHistory(
  request: RoutingRequest,
  contextMessages?: readonly PiMessage[],
): boolean {
  if (contextMessages !== undefined && contextMessages.length > 0) {
    return (
      hasUnrepairableGoogleReplayRiskFromContext(contextMessages) ||
      hasUnrepairableCrossProviderReplayRiskFromContext(contextMessages)
    );
  }

  return false;
}

/**
 * Apply Gemini exclusion when tool history is Google-unsafe (unrepairable
 * Google-origin replay state or cross-provider state SP-231 repair cannot
 * make safe). Honors `force_model_id` by returning the unfiltered fleet.
 */
export function resolveEffectiveFleet(
  fleet: readonly ModelProfile[],
  request: RoutingRequest,
  contextMessages?: readonly PiMessage[],
): GeminiToolHistoryGuardResult {
  if (request.force_model_id) {
    return { effectiveFleet: fleet, excluded: false };
  }

  if (!sessionHasGoogleUnsafeToolHistory(request, contextMessages)) {
    return { effectiveFleet: fleet, excluded: false };
  }

  const filtered = fleet.filter((profile) => !isGoogleGeminiProfile(profile));
  if (filtered.length === fleet.length) {
    return { effectiveFleet: fleet, excluded: false };
  }

  if (filtered.length === 0) {
    return {
      effectiveFleet: filtered,
      excluded: true,
      reasonCode: GEMINI_TOOL_HISTORY_EXCLUDED,
      fleetEmptyAfterFilter: true,
    };
  }

  return {
    effectiveFleet: filtered,
    excluded: true,
    reasonCode: GEMINI_TOOL_HISTORY_EXCLUDED,
  };
}

/** Shared SP-129 detector for SP-080 fleet deprioritization. */
export function sessionHasGoogleReplayRiskForDeprioritize(
  request: RoutingRequest,
  contextMessages?: readonly PiMessage[],
): boolean {
  return sessionHasGoogleReplayRisk(request, contextMessages);
}
