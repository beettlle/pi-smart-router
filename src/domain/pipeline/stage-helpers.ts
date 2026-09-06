/**
 * Shared helpers for extracted pipeline stages (SP-273, #143 partial).
 *
 * Pure functions lifted out of `RouterPipeline` so the extracted stage
 * modules (triage / pin / hydra clusters) and the orchestrator's remaining
 * inline stages share a single implementation. `router-pipeline.ts`
 * re-exports the public gates so existing import paths stay stable.
 * Behavior-preserving only — no routing policy changes.
 *
 * Imports from `./router-pipeline.js` are type-only (erased at runtime), so
 * the router-pipeline ↔ stage-helpers reference is not a runtime cycle.
 */

import type {
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingRequest,
  Tier,
} from '../types/index.js';
import { estimateRoutingCost } from '../../infrastructure/telemetry/routing-telemetry.js';
import { classifyTurnEnvelope } from '../triage/turn-envelope.js';
import type { TriageVerdict } from '../triage/triage-engine.js';
import { selectLowestCostModel } from '../pinning/sub-route-policy.js';
import { clusterReasonCode } from '../../config/routing-clusters-loader.js';
import type { ClusterMatchResult } from '../matching/cluster-matcher.js';
import type { PipelineOptions } from './router-pipeline.js';

// ─── Local-zero eligibility gates ────────────────────────────────────────────

/** Inputs for local_zero eligibility beyond trivial-only triage (SP-111, #59). */
export interface LocalEligibleInput {
  readonly triageVerdict: TriageVerdict | null;
  readonly tierHint: Tier | null;
  readonly lowIntensityScore: number | null;
  readonly highThreshold: number;
  readonly clusterMatch: ClusterMatchResult | null;
}

export interface LocalEligibleResult {
  readonly eligible: boolean;
  readonly reason: string | null;
}

/**
 * Disjunction: triage trivial OR low-intensity zero-tier hint (high confidence)
 * OR high-confidence zero-tier cluster match.
 */
export function resolveLocalEligible(input: LocalEligibleInput): LocalEligibleResult {
  const clusterZeroTier =
    input.clusterMatch?.confidence === 'high' &&
    input.clusterMatch.tierBias === 'zero-tier';

  const triageTrivial = input.triageVerdict === 'trivial';

  // SP-211 / #123 (inverse of #97): a genuinely trivial / no-tool prompt is
  // local-eligible on a high low-intensity score ALONE — decoupled from the
  // expected-cost tier hint, which optimizes cost-quality among cloud tiers and
  // may legitimately hint economical/frontier even for low-stakes turns. Without
  // this, a no-tool conversational prompt that triage rates 'ambiguous' (no
  // trivial keyword) falls through to economical even when a healthy local
  // zero-tier model is ready. The local_zero stage still gates on healthy local
  // readiness, throughput (#84), and tool-use capability (#98), and a 'complex'
  // triage verdict is decided at the triage stage before this runs — so agentic
  // / destructive prompts (#97) are never forced to zero-tier.
  const lowIntensityEligible =
    input.lowIntensityScore !== null &&
    input.lowIntensityScore >= input.highThreshold &&
    input.triageVerdict !== 'complex';

  if (!triageTrivial && !lowIntensityEligible && !clusterZeroTier) {
    return { eligible: false, reason: null };
  }

  if (triageTrivial) {
    return { eligible: true, reason: 'triage_trivial' };
  }

  if (clusterZeroTier) {
    return {
      eligible: true,
      reason: clusterReasonCode(input.clusterMatch!.clusterId),
    };
  }

  return { eligible: true, reason: 'low_intensity_structural' };
}

/**
 * Cheap pre-HyDRA tool-use requirement estimate for local_zero gating (SP-177, #98).
 * Cue categories: git / bash-shell / edit / explore / delete / repo.
 * Returns 0–1; true trivial prompts (format/lint) stay near 0.
 */
const TOOL_USE_CUE_PATTERNS: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  { id: 'git', pattern: /\b(git|commit|checkout|unstage|rebase|merge conflict)\b/i },
  { id: 'bash', pattern: /\b(bash|shell|terminal|zsh|powershell|cmd\.exe)\b/i },
  { id: 'edit', pattern: /\b(edit|rewrite|patch|apply diff)\b/i },
  { id: 'explore', pattern: /\b(explore|navigate|search (the )?codebase|list files|find files)\b/i },
  { id: 'delete', pattern: /\b(delete|remove files?|rm\b|unlink)\b/i },
  { id: 'repo', pattern: /\b(repo|repository|workdir|working tree)\b/i },
];

export function estimateCheapToolUseRequirement(promptText: string): number {
  if (!promptText || promptText.trim().length === 0) {
    return 0;
  }

  let hits = 0;
  for (const cue of TOOL_USE_CUE_PATTERNS) {
    if (cue.pattern.test(promptText)) {
      hits += 1;
    }
  }

  if (hits === 0) return 0;
  if (hits === 1) return 0.55;
  if (hits === 2) return 0.75;
  return 0.9;
}

export function resolveLocalZeroToolUseCeiling(
  localToolUseCapability: number,
  maxToolUseRequirement: number,
): number {
  return Math.min(localToolUseCapability, maxToolUseRequirement);
}

// ─── Decision/cost helpers ───────────────────────────────────────────────────

/** Attach estimated_cost_usd to a decision using the configured price catalog. */
export function withEstimatedCost(
  request: RoutingRequest,
  model: ModelProfile,
  decision: RoutingDecision,
  priceCatalog: PriceCatalog | null,
): RoutingDecision {
  return {
    ...decision,
    estimated_cost_usd: estimateRoutingCost(model, request, priceCatalog),
  };
}

/** Redact raw prompt text from an error message before logging (privacy). */
export function redactPromptFromError(error: unknown, promptText: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!promptText || !message.includes(promptText)) {
    return message;
  }
  return message.replaceAll(promptText, '[REDACTED]');
}

// ─── Pin helpers ─────────────────────────────────────────────────────────────

/** Turn-type → tier bias map (Step 2b turn envelope; also feeds SAAR candidate). */
export const TURN_TIER_MAP: Readonly<Record<string, Tier | null>> = {
  planning: 'frontier-cloud',
  tool_result: 'economical-cloud',
  subagent: 'economical-cloud',
  main_loop: null,
  unknown: null,
};

/** True when pin-only emergency fallback is active for a warm session (SP-161). */
export function isPinOnlyFallbackActive(
  options: PipelineOptions,
  request: RoutingRequest,
): boolean {
  if (!options.pinOnlyFallback) {
    return false;
  }

  const pinner = options.sessionPinner;
  if (!pinner) {
    return false;
  }

  return pinner.getPin(request.session_id) !== null;
}

/**
 * Enrich the request with a SAAR candidate model derived from the turn-type
 * tier bias when the caller did not provide one explicitly.
 */
export function enrichRequestWithSaarCandidate(
  request: RoutingRequest,
  fleet: readonly ModelProfile[],
): RoutingRequest {
  if (request.candidate_model_id) {
    return request;
  }

  const turnType = request.turn_type ?? classifyTurnEnvelope(request.messages);
  const targetTier = TURN_TIER_MAP[turnType] ?? null;
  if (!targetTier) {
    return request;
  }

  const tierCandidates = fleet.filter(
    (m) => m.tier === targetTier && m.healthy !== false,
  );
  const model = selectLowestCostModel(tierCandidates);
  if (!model) {
    return request;
  }

  return { ...request, candidate_model_id: model.id };
}

// ─── Fleet helpers ───────────────────────────────────────────────────────────

/** Narrow the fleet to a tier hint when possible; fall back to the full fleet. */
export function constrainFleetToTierHint(
  fleet: readonly ModelProfile[],
  tierHint: Tier,
): readonly ModelProfile[] {
  const filtered = fleet.filter(
    (model) => model.tier === tierHint && model.healthy !== false,
  );
  return filtered.length > 0 ? filtered : fleet;
}
