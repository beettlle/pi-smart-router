/**
 * Shared tool-failure detection — SP-303, GitHub #186.
 *
 * Single source of truth for deciding whether a tool-result message
 * represents a failure. Used by loop escalation (pin break) and the
 * HyDRA `loop:` metadata flag.
 *
 * Precedence: structured host signals (`is_error`, then `status`) win;
 * a tightened body heuristic applies only when no structured signal
 * is present. Benign negations ("no errors", "without failure") never
 * count as failures.
 */

import type { Message } from '../types/index.js';

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

/** Rate-limit and quota failures whose body text may omit generic error keywords. */
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  '429',
  'too many requests',
  'quota exceeded',
] as const;

/** Auth/access failures that are not rate limits but still indicate tool failure. */
const AUTH_DENIED_PATTERNS = [
  'permission denied',
  'access denied',
] as const;

/**
 * Decide whether a tool-result message represents a failure.
 * Prefers structured host signals (`is_error` / `status`); falls back to a
 * tightened body heuristic only when no structured signal is present.
 */
export function isToolFailure(msg: Message): boolean {
  if (msg.is_error === true) return true;
  if (msg.is_error === false) return false;
  if (msg.status !== undefined) {
    return msg.status >= 400;
  }
  return looksLikeFailure(msg.content ?? '');
}

function looksLikeFailure(content: string): boolean {
  const lower = content.toLowerCase();
  // Benign negations must not be counted as failures.
  if (/\bno (error|errors|failure|failures)\b/.test(lower)) return false;
  if (/\bwithout (an? )?(error|failure)\b/.test(lower)) return false;
  return (
    FAILURE_PATTERNS.some((p) => lower.includes(p)) ||
    RATE_LIMIT_PATTERNS.some((p) => lower.includes(p)) ||
    AUTH_DENIED_PATTERNS.some((p) => lower.includes(p))
  );
}
