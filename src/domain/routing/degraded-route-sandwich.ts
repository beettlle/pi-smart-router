/**
 * Degraded neural failover sandwich (SP-212, #119).
 *
 * When the encoder/neural routing stage fails, is misconfigured, or exceeds its
 * latency budget, routing fails open through a cheap chain instead of crashing
 * the host agent:
 *
 *   neural (HyDRA) → learned map → operator pattern pack → safe default
 *
 * - **learned** — privacy-safe map keyed by requirement fingerprint (SHA-256 of
 *   the rounded requirement vector) or cluster id → preferred tier. NEVER raw
 *   prompt text. Exact-key policy: fingerprint match first, cluster id second;
 *   no fuzzy/similarity matching (documented operator contract).
 * - **heuristic** — optional operator pattern pack (router_rules-style regex
 *   overlay). Deny-by-default: no match means no decision. Fail closed on
 *   invalid regex: the rule is rejected at compile time and never applies.
 * - **safe_default** — safe economical/frontier default (context-fit aware via
 *   the pipeline's safeCloudDefault).
 *
 * Guards:
 * - Learned/pattern suggestions toward cheaper tiers are only honored when the
 *   cheap tool-use cue estimate is below `pattern_tool_use_ceiling` — a cheap
 *   overlay may never alone override a predicted capability shortfall (#98).
 * - Learned store keys/values are validated (bounded floats, snake_case cluster
 *   ids, Tier enum) and capped (FIFO eviction) so confounder/entropy attacks
 *   cannot poison the map (see docs/deep-research.md; entropy-check guards).
 *
 * Distinct from #115 soft heat affinity (healthy-path bias): this module is
 * failover / skip-expensive-stage only. No FrugalGPT generate-then-judge
 * cascades — routing remains pre-generation (docs/routing-roadmap.md).
 */

import { createHash } from 'node:crypto';

import { z } from 'zod';

import type {
  ModelProfile,
  RequirementVector,
  RoutePath,
  Tier,
} from '../types/index.js';
import { TierSchema, type DegradedRouteConfig } from '../types/schemas.js';

export type { DegradedRouteConfig } from '../types/schemas.js';

// ─── Reason codes ────────────────────────────────────────────────────────────

/** Neural failure kinds that trigger the degraded sandwich. */
export type NeuralFailureKind =
  | 'neural_error'
  | 'neural_budget_exceeded'
  | 'neural_misconfigured';

export const DEGRADED_REASON_LEARNED = 'degraded_learned_route';
export const DEGRADED_REASON_SAFE_DEFAULT = 'degraded_safe_default';

/** Pattern-pack hit reason code (`degraded_pattern_${ruleId}`). */
export function degradedPatternReasonCode(ruleId: string): string {
  return `degraded_pattern_${ruleId}`;
}

// ─── Learned route store ─────────────────────────────────────────────────────

/**
 * Privacy-safe learned key. `requirementFingerprint` is a SHA-256 digest of the
 * rounded requirement vector — never raw prompt text. `clusterId` is an
 * operator-catalog snake_case id.
 */
export interface LearnedRouteKey {
  readonly requirementFingerprint: string | null;
  readonly clusterId: string | null;
}

export interface LearnedRouteEntry {
  readonly tier: Tier;
  /** 0–1; grows with repeated consistent observations. */
  readonly confidence: number;
  /** Number of consistent observations recorded for this key. */
  readonly samples: number;
}

export interface LearnedRouteStore {
  /** Exact-key lookup: fingerprint first, then cluster id. Null on miss. */
  lookup(key: LearnedRouteKey): LearnedRouteEntry | null;
  /** Record an observed tier for a key. Invalid keys/tiers are rejected loudly. */
  record(key: LearnedRouteKey, tier: Tier): void;
  /** Total entries across key spaces (for tests/telemetry). */
  readonly size: number;
}

const FINGERPRINT_PATTERN = /^[0-9a-f]{16}$/;
const CLUSTER_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Stable privacy-safe fingerprint of a requirement vector.
 * Rounds each dimension to 2 decimals and SHA-256 digests the tuple — the
 * digest cannot be reversed into prompt text.
 */
export function requirementFingerprint(requirements: RequirementVector): string {
  const rounded = [
    requirements.reasoning,
    requirements.code_gen,
    requirements.tool_use,
  ].map((value) => clampUnit(value).toFixed(2));
  return createHash('sha256').update(rounded.join(',')).digest('hex').slice(0, 16);
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

interface MutableLearnedEntry {
  tier: Tier;
  confidence: number;
  samples: number;
}

function isValidFingerprint(value: string): boolean {
  return FINGERPRINT_PATTERN.test(value);
}

function isValidClusterId(value: string): boolean {
  return CLUSTER_ID_PATTERN.test(value);
}

/**
 * In-memory learned route map. Bounded (FIFO eviction per key space) and
 * validated on write so adversarial inputs cannot poison routing memory.
 */
export class InMemoryLearnedRouteStore implements LearnedRouteStore {
  private readonly maxEntries: number;
  private readonly byFingerprint = new Map<string, MutableLearnedEntry>();
  private readonly byClusterId = new Map<string, MutableLearnedEntry>();

  constructor(maxEntries: number) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error(
        `Learned route store maxEntries must be a positive integer, got ${maxEntries}`,
      );
    }
    this.maxEntries = maxEntries;
  }

  get size(): number {
    return this.byFingerprint.size + this.byClusterId.size;
  }

  lookup(key: LearnedRouteKey): LearnedRouteEntry | null {
    if (key.requirementFingerprint !== null) {
      const entry = this.byFingerprint.get(key.requirementFingerprint);
      if (entry) {
        return { tier: entry.tier, confidence: entry.confidence, samples: entry.samples };
      }
    }
    if (key.clusterId !== null) {
      const entry = this.byClusterId.get(key.clusterId);
      if (entry) {
        return { tier: entry.tier, confidence: entry.confidence, samples: entry.samples };
      }
    }
    return null;
  }

  record(key: LearnedRouteKey, tier: Tier): void {
    const parsedTier = TierSchema.safeParse(tier);
    if (!parsedTier.success) {
      console.warn('Learned route store rejected invalid tier', { tier });
      return;
    }

    if (
      key.requirementFingerprint !== null &&
      !isValidFingerprint(key.requirementFingerprint)
    ) {
      console.warn('Learned route store rejected invalid fingerprint key');
      return;
    }
    if (key.clusterId !== null && !isValidClusterId(key.clusterId)) {
      console.warn('Learned route store rejected invalid cluster id key', {
        clusterId: key.clusterId,
      });
      return;
    }

    if (key.requirementFingerprint !== null) {
      this.upsert(this.byFingerprint, key.requirementFingerprint, parsedTier.data);
    }
    if (key.clusterId !== null) {
      this.upsert(this.byClusterId, key.clusterId, parsedTier.data);
    }
  }

  private upsert(
    map: Map<string, MutableLearnedEntry>,
    key: string,
    tier: Tier,
  ): void {
    const existing = map.get(key);
    if (existing) {
      if (existing.tier === tier) {
        existing.samples += 1;
        existing.confidence = Math.min(0.9, 0.5 + existing.samples * 0.1);
      } else {
        // Conflicting observation: reset to the newest tier at base confidence.
        existing.tier = tier;
        existing.samples = 1;
        existing.confidence = 0.6;
      }
      return;
    }

    if (map.size >= this.maxEntries) {
      const oldest = map.keys().next();
      if (!oldest.done) {
        map.delete(oldest.value);
      }
    }
    map.set(key, { tier, confidence: 0.6, samples: 1 });
  }
}

// ─── Operator pattern pack ───────────────────────────────────────────────────

/** router_rules-style overlay rule: known-simple intent → tier bias. */
export const PatternPackRuleSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Rule id must be lowercase snake_case'),
  pattern: z.string().min(1).max(512),
  flags: z
    .string()
    .max(6)
    .regex(/^[imsuy]*$/, 'Unsupported regex flags')
    .optional(),
  tier: TierSchema,
  /** Match confidence (0–1); default 0.6. */
  confidence: z.number().min(0).max(1).optional(),
});

export type PatternPackRule = z.infer<typeof PatternPackRuleSchema>;

export interface CompiledPatternRule {
  readonly id: string;
  readonly regex: RegExp;
  readonly tier: Tier;
  readonly confidence: number;
}

export interface RejectedPatternRule {
  readonly id: string;
  readonly reason: string;
}

/**
 * Compiled pattern pack. `rejected` lists rules that failed validation or
 * regex compilation — those rules are fail-closed and never match.
 */
export interface CompiledPatternPack {
  readonly rules: readonly CompiledPatternRule[];
  readonly rejected: readonly RejectedPatternRule[];
}

const DEFAULT_PATTERN_CONFIDENCE = 0.6;

/**
 * Validate and compile an operator pattern pack. Deny-by-default: an empty or
 * fully-rejected pack never produces a decision. Fail closed on invalid regex:
 * the offending rule is dropped (loudly) and cannot match.
 */
export function compilePatternPack(raw: unknown): CompiledPatternPack {
  const rules: CompiledPatternRule[] = [];
  const rejected: RejectedPatternRule[] = [];

  const entries = Array.isArray(raw)
    ? raw
    : raw !== null &&
        typeof raw === 'object' &&
        Array.isArray((raw as { rules?: unknown }).rules)
      ? ((raw as { rules: unknown[] }).rules as unknown[])
      : null;

  if (entries === null) {
    console.warn('Pattern pack is not an array of rules; failing closed (deny-by-default)');
    return { rules, rejected: [{ id: '__pack__', reason: 'invalid_pack_shape' }] };
  }

  for (const entry of entries) {
    const parsed = PatternPackRuleSchema.safeParse(entry);
    if (!parsed.success) {
      const id =
        entry !== null && typeof entry === 'object' && 'id' in entry
          ? String((entry as { id: unknown }).id)
          : '__unknown__';
      rejected.push({ id, reason: 'invalid_rule_schema' });
      console.warn('Pattern pack rule rejected (invalid schema); failing closed', { id });
      continue;
    }

    try {
      rules.push({
        id: parsed.data.id,
        regex: new RegExp(parsed.data.pattern, parsed.data.flags ?? 'i'),
        tier: parsed.data.tier,
        confidence: parsed.data.confidence ?? DEFAULT_PATTERN_CONFIDENCE,
      });
    } catch (error: unknown) {
      rejected.push({ id: parsed.data.id, reason: 'invalid_regex' });
      console.warn('Pattern pack rule rejected (invalid regex); failing closed', {
        id: parsed.data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { rules, rejected };
}

/** Parse a router_rules-style JSON document into a compiled pack. */
export function parsePatternPackJson(raw: string): CompiledPatternPack {
  try {
    return compilePatternPack(JSON.parse(raw));
  } catch (error: unknown) {
    console.warn('Pattern pack JSON parse failed; failing closed (deny-by-default)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { rules: [], rejected: [{ id: '__pack__', reason: 'invalid_json' }] };
  }
}

export interface PatternPackMatch {
  readonly rule: CompiledPatternRule;
  readonly confidence: number;
}

/**
 * First-match-wins over compiled rules (pack order = operator priority).
 * Returns null when no rule matches (deny-by-default).
 */
export function matchPatternPack(
  pack: CompiledPatternPack,
  promptText: string,
): PatternPackMatch | null {
  if (!promptText) {
    return null;
  }
  for (const rule of pack.rules) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(promptText)) {
      return { rule, confidence: rule.confidence };
    }
  }
  return null;
}

// ─── Sandwich resolver ───────────────────────────────────────────────────────

export interface DegradedRouteInput {
  readonly failure: NeuralFailureKind;
  readonly fleet: readonly ModelProfile[];
  /** Cheap tool-use cue estimate (0–1) from estimateCheapToolUseRequirement. */
  readonly toolUseEstimate: number;
  /** Cluster id from the low_intensity stage cluster match, when available. */
  readonly clusterId: string | null;
  readonly learnedStore?: LearnedRouteStore | null;
  readonly patternPack?: CompiledPatternPack | null;
  /** Context-fit aware safe default model selected by the pipeline. */
  readonly safeDefaultModel: ModelProfile | undefined;
  readonly config: DegradedRouteConfig;
  /** Prompt text for the pattern pack overlay only — never stored. */
  readonly promptText: string;
}

export interface DegradedRouteResolution {
  readonly routePath: RoutePath;
  readonly confidence: number;
  readonly reasonCode: string;
  readonly model: ModelProfile | undefined;
  readonly patternRuleId: string | null;
}

function firstHealthyModelOfTier(
  fleet: readonly ModelProfile[],
  tier: Tier,
): ModelProfile | undefined {
  return fleet.find((model) => model.tier === tier && model.healthy !== false);
}

/**
 * True when a cheaper-tier suggestion (learned or pattern) may be honored.
 * Frontier suggestions are always safe (upgrade). Cheaper tiers require the
 * cheap tool-use estimate below the configured ceiling so a cheap overlay can
 * never alone override a predicted capability shortfall.
 */
function cheaperTierSuggestionAllowed(
  tier: Tier,
  toolUseEstimate: number,
  ceiling: number,
): boolean {
  if (tier === 'frontier-cloud') {
    return true;
  }
  return toolUseEstimate <= ceiling;
}

/**
 * Resolve the degraded sandwich after a neural failure.
 * Order: learned → pattern (heuristic) → safe default. Never throws.
 */
export function resolveDegradedRoute(input: DegradedRouteInput): DegradedRouteResolution {
  const { config } = input;

  // 1. Learned map (exact-key: cluster id on the degraded path; fingerprint
  //    keys are recorded on neural success for future exact matches).
  const learnedEntry = input.learnedStore?.lookup({
    requirementFingerprint: null,
    clusterId: input.clusterId,
  }) ?? null;

  if (learnedEntry && learnedEntry.confidence >= config.learned_min_confidence) {
    if (
      cheaperTierSuggestionAllowed(
        learnedEntry.tier,
        input.toolUseEstimate,
        config.pattern_tool_use_ceiling,
      )
    ) {
      const model = firstHealthyModelOfTier(input.fleet, learnedEntry.tier);
      if (model) {
        return {
          routePath: 'learned',
          confidence: learnedEntry.confidence,
          reasonCode: DEGRADED_REASON_LEARNED,
          model,
          patternRuleId: null,
        };
      }
    }
  }

  // 2. Operator pattern pack (deny-by-default; fail-closed rules never match).
  const patternMatch = input.patternPack
    ? matchPatternPack(input.patternPack, input.promptText)
    : null;

  if (patternMatch) {
    if (
      cheaperTierSuggestionAllowed(
        patternMatch.rule.tier,
        input.toolUseEstimate,
        config.pattern_tool_use_ceiling,
      )
    ) {
      const model = firstHealthyModelOfTier(input.fleet, patternMatch.rule.tier);
      if (model) {
        return {
          routePath: 'heuristic',
          confidence: patternMatch.confidence,
          reasonCode: degradedPatternReasonCode(patternMatch.rule.id),
          model,
          patternRuleId: patternMatch.rule.id,
        };
      }
    }
  }

  // 3. Safe default — context-fit aware economical/frontier from the pipeline.
  return {
    routePath: 'safe_default',
    confidence: 0,
    reasonCode: DEGRADED_REASON_SAFE_DEFAULT,
    model: input.safeDefaultModel,
    patternRuleId: null,
  };
}
