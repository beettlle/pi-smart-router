/**
 * Judge state builder (SP-306, GitHub #185 / epic #183) — pure domain, no I/O.
 *
 * Builds a compact, human-readable JSON state for the typed-judgment stage.
 * Measured on local OpenJev (epic #183): the HyDRA flag-prefix string
 * (`buildHydraInput`) is unreadable to a judge; named JSON fields plus a short
 * activity excerpt fixed most cases, and state size dominates latency
 * (~385 ms for a short state vs 3.6–4.3 s for ~3k tokens).
 *
 * Hard guarantees:
 * - The returned JSON never exceeds ~500 estimated tokens
 *   (`estimatePromptTokens` from `src/domain/matching/encoder-gate.ts`).
 *   Trim order: drop `recent_activity` lines (oldest first), then truncate
 *   the user message tail.
 * - The state contains **no** spend, budget, price, or model-cost keys.
 * - `recent_activity` holds at most 2 lines, each whitespace-collapsed and
 *   truncated — no raw tool output beyond the truncated lines.
 */

import { estimatePromptTokens } from '../matching/encoder-gate.js';
import { isToolFailure } from '../pinning/tool-failure.js';
import type { Message, RoutingRequest } from '../types/index.js';

/** Hard cap on judge-state size, in estimated tokens (#185). */
export const JUDGE_STATE_TOKEN_CAP = 500;

/** Maximum characters per `recent_activity` line (post-collapse, pre-ellipsis). */
export const ACTIVITY_LINE_MAX_CHARS = 120;

/** Maximum characters of an operator-supplied `workspace` one-liner. */
export const WORKSPACE_MAX_CHARS = 120;

export interface JudgeStateOptions {
  /**
   * Operator-supplied workspace one-liner (e.g. repo label). Absent by
   * default — when omitted or empty, no `workspace` key is emitted.
   */
  readonly workspace?: string | undefined;
  /**
   * Token cap override for tests/experiments. Default
   * {@link JUDGE_STATE_TOKEN_CAP}. Measured with
   * `estimatePromptTokens` (char-length proxy, turn-envelope parity).
   */
  readonly maxTokens?: number | undefined;
}

/** Shape of the judge state before serialization (mutable for trimming). */
interface JudgeStateShape {
  latest_user_message: string;
  session: {
    messages: number;
    tool_calls: number;
    compactions: boolean;
    context_tokens: number;
    turn_type: string;
    last_tool_failed: boolean;
  };
  workspace?: string;
  recent_activity: string[];
}

/** Collapse all whitespace runs (including newlines) to single spaces. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Truncate to `max` chars, appending an ellipsis when content was cut. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** Latest non-empty user message; falls back to `prompt_text`. */
function resolveLatestUserMessage(
  request: RoutingRequest,
): { text: string; index: number } {
  const messages = request.messages;
  if (messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      if (message.role === 'user' && message.content.trim()) {
        return { text: message.content, index: i };
      }
    }
  }
  return { text: request.prompt_text, index: -1 };
}

/**
 * Whether the most recent tool-result message is a failure, using the shared
 * `isToolFailure` precedence (SP-303): structured `is_error` / `status` win;
 * body heuristic only when no structured signal is present. No new failure
 * heuristics here. `false` when the session has no tool messages.
 */
function resolveLastToolFailed(request: RoutingRequest): boolean {
  const messages = request.messages;
  if (!messages) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role === 'tool') {
      return isToolFailure(message);
    }
  }
  return false;
}

/** Count of tool-result messages in the session. */
function countToolCalls(messages: readonly Message[] | undefined): number {
  if (!messages) return 0;
  let count = 0;
  for (const message of messages) {
    if (message.role === 'tool') count += 1;
  }
  return count;
}

/**
 * At most 2 activity lines from the tail of the session, excluding the
 * message surfaced as `latest_user_message`. Chronological order; each line
 * is `role: content` with whitespace collapsed and truncated to
 * {@link ACTIVITY_LINE_MAX_CHARS}.
 */
function buildRecentActivity(
  request: RoutingRequest,
  latestUserIndex: number,
): string[] {
  const messages = request.messages;
  if (!messages || messages.length === 0) return [];

  const lines: string[] = [];
  for (let i = messages.length - 1; i >= 0 && lines.length < 2; i--) {
    if (i === latestUserIndex) continue;
    const message = messages[i]!;
    const content = collapseWhitespace(message.content ?? '');
    if (!content) continue;
    lines.unshift(`${message.role}: ${truncate(content, ACTIVITY_LINE_MAX_CHARS)}`);
  }
  return lines;
}

/**
 * Enforce the token cap. Trim order (#185): drop `recent_activity` lines
 * (oldest first — the most recent activity carries the most signal), then
 * truncate the tail of the user message.
 */
function enforceTokenCap(state: JudgeStateShape, cap: number): string {
  let json = JSON.stringify(state);
  if (estimatePromptTokens(json) <= cap) return json;

  while (state.recent_activity.length > 0) {
    state.recent_activity.shift();
    json = JSON.stringify(state);
    if (estimatePromptTokens(json) <= cap) return json;
  }

  const excess = estimatePromptTokens(json) - cap;
  if (excess > 0) {
    state.latest_user_message = truncate(
      state.latest_user_message,
      Math.max(0, state.latest_user_message.length - excess),
    );
    json = JSON.stringify(state);
  }
  return json;
}

/**
 * Build the judge state for a routing request as a JSON string.
 *
 * The state describes the *task* only — never spend, budget, price, or
 * model cost (budget policy is code's job, not the judge's; see epic #183).
 */
export function buildJudgeState(
  request: RoutingRequest,
  options?: JudgeStateOptions,
): string {
  const latest = resolveLatestUserMessage(request);

  const state: JudgeStateShape = {
    latest_user_message: latest.text,
    session: {
      messages: request.messages?.length ?? 0,
      tool_calls: countToolCalls(request.messages),
      compactions: request.compaction_flag === true,
      context_tokens: request.estimated_input_tokens ?? 0,
      turn_type: request.turn_type ?? 'unknown',
      last_tool_failed: resolveLastToolFailed(request),
    },
    recent_activity: buildRecentActivity(request, latest.index),
  };

  const workspace = options?.workspace?.trim();
  if (workspace) {
    state.workspace = truncate(collapseWhitespace(workspace), WORKSPACE_MAX_CHARS);
  }

  return enforceTokenCap(state, options?.maxTokens ?? JUDGE_STATE_TOKEN_CAP);
}

// ─── Acknowledgement detector ────────────────────────────────────────────────

/**
 * Session depth (message count) at/above which a session is "deep" for
 * acknowledgement detection. Rule (#179): in deep sessions a bare
 * continuation ("continue", "go ahead", …) is an instruction to keep working
 * on the long-running task — not a conversational acknowledgement — so it
 * must be judged, not skipped. Gate on session depth, not on text alone.
 */
export const ACK_DEEP_SESSION_MESSAGE_THRESHOLD = 100;

/** Pleasantries that are acknowledgements at any session depth. */
const PLEASANTRY_ACKS: ReadonlySet<string> = new Set([
  'ok',
  'okay',
  'k',
  'kk',
  'thanks',
  'thank you',
  'thx',
  'ty',
  'thnx',
  'got it',
  'understood',
  'noted',
  'nice',
  'cool',
  'great',
  'perfect',
  'awesome',
  'lol',
]);

/**
 * Short continuations/affirmations that are acknowledgements only in shallow
 * sessions; in deep sessions they mean "keep going" (#179).
 */
const CONTINUATION_ACKS: ReadonlySet<string> = new Set([
  'continue',
  'go ahead',
  'go on',
  'keep going',
  'proceed',
  'carry on',
  'yes',
  'yep',
  'yeah',
  'sure',
  'sounds good',
  'looks good',
  'lgtm',
  'do it',
]);

export interface IsAcknowledgementOptions {
  /**
   * Session depth in messages (e.g. `RoutingRequest.messages.length`).
   * Defaults to 0 (shallow session).
   */
  readonly sessionDepth?: number | undefined;
}

/** Normalize for ack matching: lowercase, strip punctuation, collapse spaces. */
function normalizeAckText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect acknowledgement-only turns (`ok`, `thanks`, `continue`, …) so the
 * typed-judgment stage can skip the judge call. Pure text + depth check.
 *
 * Depth rule (#179): short continuations in deep sessions (≥
 * {@link ACK_DEEP_SESSION_MESSAGE_THRESHOLD} messages) are **not**
 * acknowledgements — they direct an ongoing agentic task.
 */
export function isAcknowledgement(
  text: string,
  options?: IsAcknowledgementOptions,
): boolean {
  const normalized = normalizeAckText(text);
  if (!normalized) return false;

  if (PLEASANTRY_ACKS.has(normalized)) return true;

  if (CONTINUATION_ACKS.has(normalized)) {
    const depth = options?.sessionDepth ?? 0;
    return depth < ACK_DEEP_SESSION_MESSAGE_THRESHOLD;
  }

  return false;
}
