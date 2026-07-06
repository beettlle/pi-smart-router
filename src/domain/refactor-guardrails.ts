/**
 * Epic refactor guardrails — SP-083.
 *
 * Detects large refactoring workloads and emits spine-decomposition,
 * test-gate, and frontier-routing policies. Inert for normal requests —
 * callers treat `is_epic: false` as a no-op.
 */

import { cyclomaticScan } from './triage/triage-engine.js';
import type { RoutingRequest, Tier } from './types/index.js';

export const EPIC_REFACTOR_DETECTED = 'epic_refactor_detected' as const;
export const EPIC_REFACTOR_NOT_DETECTED = 'epic_refactor_not_detected' as const;

export const EPIC_REFACTOR_RECOMMENDED_TIER: Tier = 'frontier-cloud';

export type EpicRefactorGuardrailKind =
  | 'spine_decomposition'
  | 'test_gate'
  | 'frontier_routing';

export const EPIC_REFACTOR_GUARDRAILS: readonly EpicRefactorGuardrailKind[] = [
  'spine_decomposition',
  'test_gate',
  'frontier_routing',
];

export interface EpicRefactorScopeSignals {
  readonly epic_keyword_hits: number;
  readonly file_path_mentions: number;
  readonly cyclomatic_score: number;
  readonly planning_turn: boolean;
}

export interface EpicRefactorGuardrailEvaluation {
  readonly is_epic: boolean;
  readonly reason_code:
    | typeof EPIC_REFACTOR_DETECTED
    | typeof EPIC_REFACTOR_NOT_DETECTED;
  readonly guardrails: readonly EpicRefactorGuardrailKind[];
  readonly recommended_tier?: Tier;
  readonly signals: EpicRefactorScopeSignals;
}

export interface EpicRefactorGuardrailConfig {
  /** Minimum epic-keyword hits when paired with other scope signals. Default 1. */
  readonly minKeywordHits?: number;
  /** File-path mentions required with a keyword hit. Default 3. */
  readonly minFilePathMentions?: number;
  /** Cyclomatic score required with planning turn + keyword. Default 15. */
  readonly minCyclomaticScore?: number;
  /** Keyword hits that alone qualify as epic. Default 2. */
  readonly standaloneKeywordHits?: number;
}

const DEFAULT_CONFIG: Required<EpicRefactorGuardrailConfig> = {
  minKeywordHits: 1,
  minFilePathMentions: 3,
  minCyclomaticScore: 15,
  standaloneKeywordHits: 2,
};

const EPIC_KEYWORDS: readonly string[] = [
  'epic refactor',
  'god file',
  'god object',
  'god class',
  'decompose',
  'decomposition',
  'large refactor',
  'large-scale refactor',
  'mass refactor',
  'restructure',
  'split module',
  'extract module',
  'break up',
  'monolith',
  'cross-cutting',
  'wide-reaching',
  'rename across',
  'move across',
  'refactor entire',
  'refactor whole',
];

const STRONG_EPIC_PHRASES: readonly RegExp[] = [
  /\bepic\s+refactor\b/i,
  /\bgod\s+(?:file|object|class)\b/i,
  /\bdecompos(?:e|ition)\b/i,
];

const RE_FILE_PATH =
  /\b(?:[\w@.-]+\/)+[\w@.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|cs|vue|svelte)\b/gi;

const RE_BARE_FILE =
  /\b[\w@.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|cs|vue|svelte)\b/gi;

function countKeywordHits(text: string): number {
  const lower = text.toLowerCase();
  let hits = 0;

  for (const keyword of EPIC_KEYWORDS) {
    if (lower.includes(keyword)) {
      hits += 1;
    }
  }

  for (const pattern of STRONG_EPIC_PHRASES) {
    if (pattern.test(text)) {
      hits += 1;
    }
  }

  return hits;
}

function countFilePathMentions(text: string): number {
  const paths = new Set<string>();

  for (const match of text.matchAll(RE_FILE_PATH)) {
    paths.add(match[0]!.toLowerCase());
  }

  for (const match of text.matchAll(RE_BARE_FILE)) {
    paths.add(match[0]!.toLowerCase());
  }

  return paths.size;
}

export function collectEpicRefactorScopeSignals(
  request: RoutingRequest,
): EpicRefactorScopeSignals {
  const text = request.prompt_text;
  return {
    epic_keyword_hits: countKeywordHits(text),
    file_path_mentions: countFilePathMentions(text),
    cyclomatic_score: cyclomaticScan(text),
    planning_turn: request.turn_type === 'planning',
  };
}

/**
 * Returns true when scope signals indicate an epic refactor workload.
 * Conservative thresholds keep normal routing and small edits unaffected.
 */
export function isEpicRefactorScope(
  signals: EpicRefactorScopeSignals,
  config?: EpicRefactorGuardrailConfig,
): boolean {
  const resolved = { ...DEFAULT_CONFIG, ...config };

  if (signals.epic_keyword_hits >= resolved.standaloneKeywordHits) {
    return true;
  }

  if (
    signals.epic_keyword_hits >= resolved.minKeywordHits &&
    signals.file_path_mentions >= resolved.minFilePathMentions
  ) {
    return true;
  }

  if (
    signals.planning_turn &&
    signals.epic_keyword_hits >= resolved.minKeywordHits &&
    signals.cyclomatic_score >= resolved.minCyclomaticScore
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluate epic-refactor guardrails for a routing request.
 * Non-epic requests return empty guardrails and no tier override.
 */
export function evaluateEpicRefactorGuardrails(
  request: RoutingRequest,
  config?: EpicRefactorGuardrailConfig,
): EpicRefactorGuardrailEvaluation {
  const signals = collectEpicRefactorScopeSignals(request);
  const is_epic = isEpicRefactorScope(signals, config);

  if (!is_epic) {
    return {
      is_epic: false,
      reason_code: EPIC_REFACTOR_NOT_DETECTED,
      guardrails: [],
      signals,
    };
  }

  return {
    is_epic: true,
    reason_code: EPIC_REFACTOR_DETECTED,
    guardrails: EPIC_REFACTOR_GUARDRAILS,
    recommended_tier: EPIC_REFACTOR_RECOMMENDED_TIER,
    signals,
  };
}
