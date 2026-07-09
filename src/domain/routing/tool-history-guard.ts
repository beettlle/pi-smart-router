/**
 * Gemini tool-history guard — SP-077, narrowed SP-129.
 *
 * Excludes Google/Gemini fleet entries only when session history contains
 * Google-origin assistant tool calls with replay state SP-128 repair cannot fix.
 * OpenAI-only tool sessions may route to economical Gemini; repairable Google
 * tool history relies on delegation replay repair instead of a blunt ban.
 */

import type { Message as PiMessage } from '@earendil-works/pi-ai/compat';

import {
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
  _messages: readonly RoutingMessage[],
): boolean {
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

function sessionHasGoogleReplayRisk(
  request: RoutingRequest,
  contextMessages?: readonly PiMessage[],
): boolean {
  if (contextMessages !== undefined && contextMessages.length > 0) {
    return hasGoogleReplayRiskFromContext(contextMessages);
  }

  return hasGoogleReplayRisk(request.messages ?? []);
}

function sessionHasUnrepairableGoogleReplayRisk(
  request: RoutingRequest,
  contextMessages?: readonly PiMessage[],
): boolean {
  if (contextMessages !== undefined && contextMessages.length > 0) {
    return hasUnrepairableGoogleReplayRiskFromContext(contextMessages);
  }

  return false;
}

/**
 * Apply Gemini exclusion when unrepairable Google replay risk is present.
 * Honors `force_model_id` by returning the unfiltered fleet.
 */
export function resolveEffectiveFleet(
  fleet: readonly ModelProfile[],
  request: RoutingRequest,
  contextMessages?: readonly PiMessage[],
): GeminiToolHistoryGuardResult {
  if (request.force_model_id) {
    return { effectiveFleet: fleet, excluded: false };
  }

  if (!sessionHasUnrepairableGoogleReplayRisk(request, contextMessages)) {
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
