/**
 * HyDRA embedding input builder — SP-112, GitHub #60.
 *
 * Prefixes prompt text with session metadata so requirement vectors reflect
 * turn context, not only the latest user string.
 */

import type { RoutingRequest } from '../types/index.js';
import type { TriageResult } from '../triage/triage-engine.js';

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

/**
 * Build HyDRA encoder input: metadata prefix + prompt text.
 *
 * Format: `[turns:N|tools:0|tokens:N|type:...] {prompt_text}`
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
  ].join('|');

  return `[${flags}] ${request.prompt_text}`;
}
