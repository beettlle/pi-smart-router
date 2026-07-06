/**
 * Smart Router CLI subcommands — library-facing command handlers.
 *
 * Extension wiring lives in `.pi/extensions/smart-router/commands.ts`;
 * this module holds reusable subcommand logic for dogfooding and tests.
 */

import { SessionPinner } from '../domain/pinning/session-pinner.js';

export const UNPIN_SUBCOMMAND = 'unpin' as const;

export type UnpinOutcome = 'cleared' | 'noop' | 'unavailable';

export interface UnpinCommandResult {
  readonly outcome: UnpinOutcome;
  readonly message: string;
  readonly level: 'info' | 'error';
  readonly previousModelId?: string;
}

export interface UnpinCommandContext {
  readonly sessionId: string;
  readonly sessionPinner: SessionPinner | undefined;
}

/** Returns true when args invoke `/smart-router unpin`. */
export function isUnpinInvocation(args: string): boolean {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  return tokens.length === 1 && tokens[0] === UNPIN_SUBCOMMAND;
}

/**
 * Clear the current session pin via SessionPinner.breakPin().
 * Does not modify SessionPinner break rules — operator-initiated unpin only.
 */
export function executeUnpinCommand(ctx: UnpinCommandContext): UnpinCommandResult {
  const { sessionId, sessionPinner } = ctx;

  if (!sessionPinner) {
    return {
      outcome: 'unavailable',
      message: 'Session pinner unavailable.',
      level: 'error',
    };
  }

  const pin = sessionPinner.getPin(sessionId);
  if (!pin) {
    return {
      outcome: 'noop',
      message: 'No session pin to clear.',
      level: 'info',
    };
  }

  sessionPinner.breakPin(sessionId);

  return {
    outcome: 'cleared',
    previousModelId: pin.pinned_model_id,
    message: `Cleared session pin (was ${pin.pinned_model_id}). Next request will run full routing.`,
    level: 'info',
  };
}

export const smartRouterCliSubcommands = {
  unpin: executeUnpinCommand,
} as const;
