/**
 * HyDRA embedding input builder — SP-112, SP-138, GitHub #60, #76.
 *
 * Prefixes the latest user turn with session metadata so requirement vectors
 * reflect turn context, not only the latest user string. Prior assistant
 * responses are excluded from the encoder body per HyDRA reference (#76).
 */

import type { Message, RoutingRequest } from '../types/index.js';
import type { TriageResult } from '../triage/triage-engine.js';

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

function resolveMessageCount(request: RoutingRequest): number {
  return request.messages?.length ?? 0;
}

function resolveHasToolContext(request: RoutingRequest): boolean {
  if (request.turn_type === 'tool_result') {
    return true;
  }

  return request.messages?.some((message) => message.role === 'tool') ?? false;
}

function resolveEstimatedInputTokens(request: RoutingRequest): number {
  return request.estimated_input_tokens ?? 0;
}

function resolveTurnType(request: RoutingRequest): string {
  return request.turn_type ?? 'unknown';
}

function resolveCompactionFlag(request: RoutingRequest): 0 | 1 {
  return request.compaction_flag ? 1 : 0;
}

function looksLikeToolFailure(content: string): boolean {
  const lower = content.toLowerCase();
  return FAILURE_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Observational loop-pressure flag: 1 when the latest tool message looks
 * like a failure. Mirrors loop-escalation heuristics without session pin state.
 */
function resolveLoopPressure(request: RoutingRequest): 0 | 1 {
  const messages = request.messages;
  if (!messages || messages.length === 0) {
    return 0;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role === 'tool') {
      return looksLikeToolFailure(message.content) ? 1 : 0;
    }
  }

  return 0;
}

function messageHasAttachmentIndicator(message: Message): boolean {
  if (message.tool_blocks && message.tool_blocks.length > 0) {
    return true;
  }

  if (message.role !== 'user') {
    return false;
  }

  const lower = message.content.toLowerCase();
  return lower.includes('data:image');
}

function resolveAttachmentFlag(request: RoutingRequest): 0 | 1 {
  return request.messages?.some((message) => messageHasAttachmentIndicator(message)) ? 1 : 0;
}

/**
 * Latest user turn text only — excludes prior assistant responses (#76).
 */
function resolveHydraPromptText(request: RoutingRequest): string {
  const messages = request.messages;
  if (messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      if (message.role === 'user' && message.content.trim()) {
        return message.content;
      }
    }
  }

  return request.prompt_text;
}

/**
 * Build HyDRA encoder input: seven-flag metadata prefix + latest user text.
 *
 * Format: `[turns:N|tools:0|tokens:N|type:...|compact:0|loop:0|attach:0] {text}`
 *
 * Metadata affects capability prediction only; tier selection uses the
 * cluster/feature gate (SP-103) separately.
 */
export function buildHydraInput(
  request: RoutingRequest,
  triage?: TriageResult,
): string {
  void triage;

  const flags = [
    `turns:${resolveMessageCount(request)}`,
    `tools:${resolveHasToolContext(request) ? 1 : 0}`,
    `tokens:${resolveEstimatedInputTokens(request)}`,
    `type:${resolveTurnType(request)}`,
    `compact:${resolveCompactionFlag(request)}`,
    `loop:${resolveLoopPressure(request)}`,
    `attach:${resolveAttachmentFlag(request)}`,
  ].join('|');

  return `[${flags}] ${resolveHydraPromptText(request)}`;
}
