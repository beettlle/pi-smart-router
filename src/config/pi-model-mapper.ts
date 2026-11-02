/**
 * Pi model registry → ModelProfile mapper.
 *
 * Maps pi `Model` objects (provider + id) to router fleet entries using
 * pattern-based lookup for known families. When `config/benchmark-profiles.json`
 * contains a row for the model id (SP-134/136 ingest output), or a fleet alias
 * pointing at such a row (SP-174), capability vectors are grounded in benchmark
 * scores instead of regex defaults. Unknown models or missing benchmark rows
 * receive conservative pattern defaults. Mapped profiles include
 * `capability_source` (`benchmark` | `pattern_default`) for explain/telemetry.
 *
 * Mixed capability-source fairness (SP-312 / #193): raw ingest scores live on a
 * compressed scale (~0.5–0.85) while pattern defaults sit at 0.7–0.95, so a
 * benchmark-grounded model ranked below every ungrounded same-tier model purely
 * because of its capability source. Grounded vectors are therefore rescaled per
 * dimension against the max of their own pattern-family cohort, anchored at the
 * matched family default: the best-measured grounded model in a family ties the
 * ungrounded family default, and every other grounded model ranks below it in
 * proportion to its measured distance from the best — remaining differences are
 * explained by benchmark standing, not capability source. The transform is
 * strictly monotonic per dimension, so grounded relative order is preserved.
 * The rescale is lift-only: a grounded model is never pushed below its measured
 * scores, so families whose pattern default sits below the measured cohort
 * scale (e.g. UNKNOWN_DEFAULTS rows like gpt-5.3-codex) keep their raw scores
 * instead of regressing. See `withBenchmarkCapabilities`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import type {
  ModelCapabilities,
  ModelLimits,
  ModelPerformance,
  ModelPricing,
  ModelProfile,
  Tier,
} from '../domain/types/entities.js';

/** Checked-in ingest artifact from `npm run routing:ingest-benchmarks` (SP-134). */
export const DEFAULT_BENCHMARK_PROFILES_PATH = resolve('config', 'benchmark-profiles.json');

/** Whether HyDRA capabilities came from the ingest artifact (or alias) vs regex defaults. */
export type CapabilitySource = 'benchmark' | 'pattern_default';

/** ModelProfile plus operator-visible capability provenance (SP-174). */
export interface MappedModelProfile extends ModelProfile {
  readonly capability_source: CapabilitySource;
  /**
   * Context limits carried from the pi model registry (`Model.contextWindow` /
   * `Model.maxTokens`) — SP-299 / #177. Kept separate from `limits` (YAML
   * overrides) so `resolveLimits` can rank them below LiteLLM catalog data
   * and above tier defaults.
   */
  readonly pi_registry_limits?: ModelLimits;
}

const benchmarkCapabilitiesSchema = z.object({
  reasoning: z.number().min(0).max(1),
  code_gen: z.number().min(0).max(1),
  tool_use: z.number().min(0).max(1),
});

const benchmarkModelRowSchema = z.object({
  model_id: z.string().min(1),
  capabilities: benchmarkCapabilitiesSchema,
});

const benchmarkProfilesArtifactSchema = z.object({
  version: z.literal(1),
  aliases: z.record(z.string().min(1), z.string().min(1)).optional(),
  models: z.array(benchmarkModelRowSchema).min(1),
});

interface BenchmarkProfilesCache {
  readonly capabilitiesByModelId: ReadonlyMap<string, ModelCapabilities>;
  readonly aliases: ReadonlyMap<string, string>;
  /**
   * SP-312: canonical model_id → per-dimension max across the pattern-family
   * cohort its benchmark row belongs to (family = first matching
   * `MODEL_PATTERN_RULES` entry, else UNKNOWN_DEFAULTS). Anchors the fairness
   * rescale in `withBenchmarkCapabilities`.
   */
  readonly cohortMaxByModelId: ReadonlyMap<string, ModelCapabilities>;
}

let benchmarkProfilesPathOverride: string | null | undefined;
let benchmarkProfilesCache: BenchmarkProfilesCache | null | undefined;

/**
 * Test hook — override benchmark artifact path (null disables benchmark grounding).
 */
export function setBenchmarkProfilesPathForTests(filePath: string | null): void {
  benchmarkProfilesPathOverride = filePath;
  benchmarkProfilesCache = undefined;
}

/** Test hook — clear cached benchmark artifact between cases. */
export function resetBenchmarkProfilesCacheForTests(): void {
  benchmarkProfilesPathOverride = undefined;
  benchmarkProfilesCache = undefined;
}

function resolveBenchmarkProfilesPath(): string | null {
  if (benchmarkProfilesPathOverride === null) {
    return null;
  }
  return benchmarkProfilesPathOverride ?? DEFAULT_BENCHMARK_PROFILES_PATH;
}

function loadBenchmarkProfilesCache(): BenchmarkProfilesCache | null {
  if (benchmarkProfilesCache !== undefined) {
    return benchmarkProfilesCache;
  }

  const filePath = resolveBenchmarkProfilesPath();
  if (filePath === null || !existsSync(filePath)) {
    benchmarkProfilesCache = null;
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const result = benchmarkProfilesArtifactSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(result.error.message);
    }

    const capabilitiesByModelId = new Map<string, ModelCapabilities>();
    for (const row of result.data.models) {
      capabilitiesByModelId.set(row.model_id, { ...row.capabilities });
    }
    const aliases = new Map<string, string>(
      Object.entries(result.data.aliases ?? {}),
    );
    benchmarkProfilesCache = {
      capabilitiesByModelId,
      aliases,
      cohortMaxByModelId: computeFamilyCohortMax(result.data.models),
    };
    return benchmarkProfilesCache;
  } catch (err: unknown) {
    console.warn('benchmark profiles artifact invalid; using regex capability defaults', {
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    benchmarkProfilesCache = null;
    return null;
  }
}

/**
 * Resolve a scoped-fleet model id to the canonical ingest `model_id` via aliases.
 * Returns the input id when no alias exists.
 */
export function resolveBenchmarkModelId(modelId: string): string {
  const cache = loadBenchmarkProfilesCache();
  if (cache === null) {
    return modelId;
  }
  return cache.aliases.get(modelId) ?? modelId;
}

/** A resolved benchmark row: capabilities plus the canonical row id (SP-312). */
interface GroundedBenchmarkRow {
  readonly capabilities: ModelCapabilities;
  readonly rowId: string;
}

function lookupBenchmarkRow(modelId: string): GroundedBenchmarkRow | undefined {
  const cache = loadBenchmarkProfilesCache();
  if (cache === null) {
    return undefined;
  }
  const direct = cache.capabilitiesByModelId.get(modelId);
  if (direct !== undefined) {
    return { capabilities: direct, rowId: modelId };
  }
  const canonical = cache.aliases.get(modelId);
  if (canonical === undefined) {
    return undefined;
  }
  const capabilities = cache.capabilitiesByModelId.get(canonical);
  return capabilities === undefined ? undefined : { capabilities, rowId: canonical };
}

function lookupBenchmarkCapabilities(modelId: string): ModelCapabilities | undefined {
  return lookupBenchmarkRow(modelId)?.capabilities;
}

/**
 * Per-dimension max of the pattern-family cohort the model's benchmark row
 * belongs to (SP-312). Exported for fairness audits and tests.
 */
export function getBenchmarkFamilyCohortMax(modelId: string): ModelCapabilities | undefined {
  const cache = loadBenchmarkProfilesCache();
  if (cache === null) {
    return undefined;
  }
  const row = lookupBenchmarkRow(modelId);
  if (row === undefined) {
    return undefined;
  }
  const max = cache.cohortMaxByModelId.get(row.rowId);
  return max === undefined ? undefined : { ...max };
}

/**
 * SP-312 / #193 — rescale a grounded capability vector onto the pattern-default
 * scale of its model family. Per dimension:
 * `score × max(1, familyDefault / cohortMax)`, where `cohortMax` is the max
 * across the pattern-family cohort the benchmark row belongs to. Properties:
 * - Strictly monotonic in the raw score → grounded relative order preserved.
 * - The cohort-best grounded model reaches the family default exactly (ties
 *   ungrounded same-tier models) whenever the family default sits above the
 *   measured cohort scale.
 * - Lift-only: never pushes a grounded model below its measured scores, so
 *   rows whose family default is below the cohort scale (e.g. UNKNOWN_DEFAULTS
 *   rows) are not penalized for being benchmarked.
 * A degenerate cohort (max ≤ 0) cannot differentiate — keep the raw score
 * rather than divide by zero.
 */
export function scaleBenchmarkCapabilitiesToFamily(
  grounded: ModelCapabilities,
  familyDefault: ModelCapabilities,
  familyCohortMax: ModelCapabilities,
): ModelCapabilities {
  const scale = (score: number, defaultScore: number, cohortMaxScore: number): number =>
    cohortMaxScore > 0 ? score * Math.max(1, defaultScore / cohortMaxScore) : score;
  return {
    reasoning: scale(grounded.reasoning, familyDefault.reasoning, familyCohortMax.reasoning),
    code_gen: scale(grounded.code_gen, familyDefault.code_gen, familyCohortMax.code_gen),
    tool_use: scale(grounded.tool_use, familyDefault.tool_use, familyCohortMax.tool_use),
  };
}

/**
 * Whether capabilities for this model id resolve from the benchmark artifact
 * (direct row or fleet alias) vs pattern/family defaults.
 */
export function getCapabilitySource(modelId: string): CapabilitySource {
  return lookupBenchmarkCapabilities(modelId) !== undefined ? 'benchmark' : 'pattern_default';
}

interface ModelFamilyDefaults {
  readonly tier: Tier;
  readonly capabilities: ModelCapabilities;
  readonly performance?: ModelPerformance;
  readonly pricing: ModelPricing;
  readonly endpoint?: string;
}

function withBenchmarkCapabilities(
  defaults: ModelFamilyDefaults,
  modelId: string,
): { readonly defaults: ModelFamilyDefaults; readonly capability_source: CapabilitySource } {
  const row = lookupBenchmarkRow(modelId);
  if (row === undefined) {
    return { defaults, capability_source: 'pattern_default' };
  }

  // SP-312 / #193: rescale grounded scores onto the family-default scale so a
  // benchmark-grounded model no longer loses to an ungrounded same-tier model
  // purely because of capability source (see header comment).
  const cache = loadBenchmarkProfilesCache();
  const cohortMax = cache?.cohortMaxByModelId.get(row.rowId);
  const capabilities =
    cohortMax === undefined
      ? { ...row.capabilities }
      : scaleBenchmarkCapabilitiesToFamily(row.capabilities, defaults.capabilities, cohortMax);

  return {
    defaults: {
      ...defaults,
      capabilities,
    },
    capability_source: 'benchmark',
  };
}

/** Pi registry `Model.cost` shape — per-1M-token USD rates (SP-298). */
export interface PiRegistryCost {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

export interface PiModelInput {
  readonly provider: string;
  readonly id: string;
  readonly name?: string;
  readonly cost?: PiRegistryCost;
  /** Pi registry `Model.contextWindow` — total input token window (SP-299 / #177). */
  readonly contextWindow?: number;
  /** Pi registry `Model.maxTokens` — max output tokens (SP-299 / #177). */
  readonly maxTokens?: number;
}

interface ModelPatternRule {
  readonly pattern: RegExp;
  readonly defaults: ModelFamilyDefaults;
}

const LOCAL_PROVIDERS = new Set(['lmstudio', 'ollama']);

/** Conservative context limits when YAML and LiteLLM registry have no entry (SP-092). */
export const DEFAULT_MODEL_LIMITS: Readonly<Record<Tier, ModelLimits>> = {
  'zero-tier': { max_input_tokens: 32_768, max_output_tokens: 4_096 },
  'economical-cloud': { max_input_tokens: 128_000, max_output_tokens: 8_192 },
  'frontier-cloud': { max_input_tokens: 200_000, max_output_tokens: 16_384 },
};

export function getDefaultLimitsForTier(tier: Tier): ModelLimits {
  return { ...DEFAULT_MODEL_LIMITS[tier] };
}

const LOCAL_DEFAULTS: ModelFamilyDefaults = {
  tier: 'zero-tier',
  capabilities: { reasoning: 0.3, code_gen: 0.6, tool_use: 0.1 },
  performance: {
    latency_p50_ms: 120,
    verbosity_factor: 0.9,
    cache_friendly: true,
  },
  pricing: {
    registry_key: 'local/free',
    fallback_cost_per_1m: 0.0,
  },
  endpoint: 'http://localhost:1234/v1',
};

const FRONTIER_DEFAULTS: ModelFamilyDefaults = {
  tier: 'frontier-cloud',
  capabilities: { reasoning: 0.95, code_gen: 0.95, tool_use: 0.95 },
  performance: {
    latency_p50_ms: 450,
    verbosity_factor: 1.2,
    cache_friendly: true,
  },
  pricing: {
    fallback_cost_per_1m: 3.0,
  },
};

const ECONOMICAL_DEFAULTS: ModelFamilyDefaults = {
  tier: 'economical-cloud',
  capabilities: { reasoning: 0.7, code_gen: 0.75, tool_use: 0.7 },
  performance: {
    latency_p50_ms: 280,
    verbosity_factor: 0.95,
    cache_friendly: true,
  },
  pricing: {
    fallback_cost_per_1m: 0.8,
  },
};

const UNKNOWN_DEFAULTS: ModelFamilyDefaults = {
  tier: 'economical-cloud',
  capabilities: { reasoning: 0.6, code_gen: 0.65, tool_use: 0.6 },
  performance: {
    latency_p50_ms: 350,
    verbosity_factor: 1.0,
    cache_friendly: true,
  },
  pricing: {
    fallback_cost_per_1m: 1.0,
  },
};

/**
 * Default virtual subscription-quota cost for Cursor frontier models (SP-096 / #70).
 * `fallback_cost_per_1m` stays 0 (no per-token API billing); `quota_cost_per_1m`
 * is used only for frugality scoring and telemetry so economical API models are
 * not dominated solely because subscription registry cost is zero.
 */
export const DEFAULT_CURSOR_QUOTA_COST_PER_1M = 3.0;

/**
 * Opaque pi/Cursor fleet placeholder id `default` — SP-098 / #70.
 * Without an explicit rule this id fell through to UNKNOWN_DEFAULTS (economical-cloud)
 * and won turn_envelope lowest-cost selection for tool_result turns.
 */
const OPAQUE_FLEET_DEFAULT_ID = 'default';

/**
 * Cursor opaque-auto models (`cursor/auto`, etc.) — SP-086 / #40.
 * Frontier tier: Cursor picks the underlying model; HyDRA needs high capability
 * scores so these are not dominated by mapped economical Gemini/OpenAI models.
 * Registry `fallback_cost_per_1m` is zero (subscription billing); virtual quota
 * cost (SP-096) drives frugality scoring and telemetry.
 */
const CURSOR_AUTO_DEFAULTS: ModelFamilyDefaults = {
  tier: 'frontier-cloud',
  capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.95 },
  performance: {
    latency_p50_ms: 350,
    verbosity_factor: 1.0,
    cache_friendly: false,
  },
  pricing: {
    fallback_cost_per_1m: 0.0,
    quota_cost_per_1m: DEFAULT_CURSOR_QUOTA_COST_PER_1M,
  },
};

/**
 * Cursor Composer coding models (`composer-latest`, `composer-*`) — SP-086 / #40.
 * Frontier tier with strong code_gen; zero API fallback with virtual quota cost (SP-096).
 */
const COMPOSER_DEFAULTS: ModelFamilyDefaults = {
  tier: 'frontier-cloud',
  capabilities: { reasoning: 0.85, code_gen: 0.95, tool_use: 0.9 },
  performance: {
    latency_p50_ms: 400,
    verbosity_factor: 1.05,
    cache_friendly: false,
  },
  pricing: {
    fallback_cost_per_1m: 0.0,
    quota_cost_per_1m: DEFAULT_CURSOR_QUOTA_COST_PER_1M,
  },
};

/** Ordered rules — first match wins. */
const MODEL_PATTERN_RULES: readonly ModelPatternRule[] = [
  { pattern: /claude[-_.]?opus|claude[-_.]?sonnet|opus|sonnet/i, defaults: FRONTIER_DEFAULTS },
  // SP-310 / #193: Fable is a frontier Claude family (claude-fable-5-1).
  { pattern: /claude[-_.]?fable/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /claude[-_.]?haiku|haiku/i, defaults: ECONOMICAL_DEFAULTS },
  // SP-310 / #193: any other Claude id is a current/future flagship family —
  // frontier, not UNKNOWN_DEFAULTS. Must stay after the Haiku rule so
  // claude-haiku-* keeps economical defaults. Anchored to the start of the id
  // (or a provider/ prefix) so unrelated ids merely containing 'claude'
  // (e.g. openai-claude-bridge) do not inherit frontier defaults.
  { pattern: /(?:^|\/)claude/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /gpt[-_.]?5\.(?:[5-9]|\d{2,})|gpt-5-[5-9]/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /gpt[-_.]?5\.1|gpt[-_.]?5[-_.]?mini|gpt[-_.]?mini/i, defaults: ECONOMICAL_DEFAULTS },
  { pattern: /gemini[-_.]?2\.5[-_.]?pro|gemini-2-5-pro/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /gemini[-_.]?3.*pro/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /gemini.*pro/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /gemini.*flash|gemini-flash/i, defaults: ECONOMICAL_DEFAULTS },
  // SP-310 / #193: lite variants stay economical even at major >= 4 — keep
  // ahead of the generic Gemini 4+ frontier rule.
  { pattern: /gemini.*lite/i, defaults: ECONOMICAL_DEFAULTS },
  // SP-310 / #193: Gemini major version >= 4 (gemini-4-argon, gemini-4-pro)
  // is frontier. Placed after the flash/lite rules so gemini-4-flash and
  // gemini-4-lite stay economical.
  { pattern: /gemini[-_.]?(?:[4-9]|\d{2,})/i, defaults: FRONTIER_DEFAULTS },
  // Peak-pricing vendor families (SP-244 / #165) — recognize Z.ai GLM and
  // DeepSeek ids explicitly instead of UNKNOWN_DEFAULTS so the peak/off-peak
  // adapters (SP-243) pair with sensible economical-tier capability defaults.
  { pattern: /^glm[-_.]?\d/i, defaults: ECONOMICAL_DEFAULTS },
  { pattern: /deepseek/i, defaults: ECONOMICAL_DEFAULTS },
  { pattern: /^composer[-_]/i, defaults: COMPOSER_DEFAULTS },
  { pattern: /^cursor\//i, defaults: CURSOR_AUTO_DEFAULTS },
];

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

function matchPatternRules(id: string): ModelFamilyDefaults | undefined {
  for (const rule of MODEL_PATTERN_RULES) {
    if (rule.pattern.test(id)) {
      return rule.defaults;
    }
  }
  return undefined;
}

/**
 * SP-312: group benchmark rows by their matched pattern family (UNKNOWN_DEFAULTS
 * when no rule matches) and return, per canonical row id, the per-dimension max
 * across that family cohort. Called lazily from `loadBenchmarkProfilesCache`,
 * so the pattern-rule consts are already initialized at call time.
 */
function computeFamilyCohortMax(
  models: readonly { readonly model_id: string; readonly capabilities: ModelCapabilities }[],
): ReadonlyMap<string, ModelCapabilities> {
  const cohortMaxByFamily = new Map<ModelFamilyDefaults, ModelCapabilities>();
  const familyByModelId = new Map<string, ModelFamilyDefaults>();
  for (const row of models) {
    const family = matchPatternRules(row.model_id) ?? UNKNOWN_DEFAULTS;
    familyByModelId.set(row.model_id, family);
    const existing = cohortMaxByFamily.get(family);
    cohortMaxByFamily.set(family, {
      reasoning: Math.max(existing?.reasoning ?? 0, row.capabilities.reasoning),
      code_gen: Math.max(existing?.code_gen ?? 0, row.capabilities.code_gen),
      tool_use: Math.max(existing?.tool_use ?? 0, row.capabilities.tool_use),
    });
  }
  const cohortMaxByModelId = new Map<string, ModelCapabilities>();
  for (const [modelId, family] of familyByModelId) {
    const max = cohortMaxByFamily.get(family);
    if (max !== undefined) {
      cohortMaxByModelId.set(modelId, max);
    }
  }
  return cohortMaxByModelId;
}

/**
 * Registry cost → USD per 1M tokens: average of input and output rates.
 * Pi registry `Model.cost` rates are already denominated per 1M tokens
 * (SP-298), so no scaling is applied — unlike LiteLLM per-token rates handled
 * by `computeCostPer1MTokens` in litellm-fetch (SP-045/SP-046).
 * Returns undefined when both input and output rates are zero (use pattern
 * default), or when either rate is negative — negative values are vendor
 * unknown/sentinel rates, not valid pricing, so cost stays unknown (SP-298).
 */
function deriveFallbackCostPer1M(cost: PiRegistryCost): number | undefined {
  const { input, output } = cost;
  if (input === 0 && output === 0) {
    return undefined;
  }
  if (input < 0 || output < 0) {
    return undefined;
  }

  return (input + output) / 2;
}

function resolveFallbackCost(
  input: PiModelInput,
  defaults: ModelFamilyDefaults,
): number {
  if (input.cost === undefined) {
    return defaults.pricing.fallback_cost_per_1m;
  }

  const fromRegistry = deriveFallbackCostPer1M(input.cost);
  return fromRegistry ?? defaults.pricing.fallback_cost_per_1m;
}

/**
 * Pi registry contextWindow/maxTokens → ModelLimits (SP-299 / #177).
 * Non-positive or non-finite registry values are vendor sentinels, not real
 * limits — ignored so tier defaults still apply.
 */
function derivePiRegistryLimits(input: PiModelInput): ModelLimits | undefined {
  const limits: { max_input_tokens?: number; max_output_tokens?: number } = {};
  const { contextWindow, maxTokens } = input;
  if (contextWindow !== undefined && Number.isFinite(contextWindow) && contextWindow > 0) {
    limits.max_input_tokens = Math.floor(contextWindow);
  }
  if (maxTokens !== undefined && Number.isFinite(maxTokens) && maxTokens > 0) {
    limits.max_output_tokens = Math.floor(maxTokens);
  }
  return Object.keys(limits).length > 0 ? limits : undefined;
}

function buildProfile(
  input: PiModelInput,
  defaults: ModelFamilyDefaults,
  capability_source: CapabilitySource,
): MappedModelProfile {
  const provider = input.provider.trim();
  const registryKey = `${normalizeProvider(provider)}/${input.id}`;

  const profile: MappedModelProfile = {
    id: input.id,
    tier: defaults.tier,
    provider,
    capabilities: { ...defaults.capabilities },
    pricing: {
      registry_key: defaults.pricing.registry_key ?? registryKey,
      fallback_cost_per_1m: resolveFallbackCost(input, defaults),
      ...(defaults.pricing.quota_cost_per_1m !== undefined
        ? { quota_cost_per_1m: defaults.pricing.quota_cost_per_1m }
        : {}),
    },
    capability_source,
  };

  const withPerformance =
    defaults.performance !== undefined
      ? { ...profile, performance: { ...defaults.performance } }
      : profile;

  const piRegistryLimits = derivePiRegistryLimits(input);
  const withLimits =
    piRegistryLimits !== undefined
      ? { ...withPerformance, pi_registry_limits: piRegistryLimits }
      : withPerformance;

  if (defaults.endpoint !== undefined) {
    return { ...withLimits, endpoint: defaults.endpoint };
  }

  return withLimits;
}

/**
 * Map a pi model registry entry to a router ModelProfile.
 * Includes `capability_source` for operators (benchmark vs pattern_default).
 */
export function mapPiModelToProfile(input: PiModelInput): MappedModelProfile {
  const provider = normalizeProvider(input.provider);

  if (LOCAL_PROVIDERS.has(provider)) {
    // Local models stay free — registry cost must not override zero-tier pricing.
    const localInput: PiModelInput = {
      provider: input.provider,
      id: input.id,
      ...(input.name !== undefined ? { name: input.name } : {}),
    };
    const grounded = withBenchmarkCapabilities(LOCAL_DEFAULTS, input.id);
    return buildProfile(localInput, grounded.defaults, grounded.capability_source);
  }

  if (input.id === OPAQUE_FLEET_DEFAULT_ID) {
    const grounded = withBenchmarkCapabilities(CURSOR_AUTO_DEFAULTS, input.id);
    return buildProfile(input, grounded.defaults, grounded.capability_source);
  }

  const matched = matchPatternRules(input.id);
  if (matched) {
    const grounded = withBenchmarkCapabilities(matched, input.id);
    return buildProfile(input, grounded.defaults, grounded.capability_source);
  }

  const grounded = withBenchmarkCapabilities(UNKNOWN_DEFAULTS, input.id);
  return buildProfile(input, grounded.defaults, grounded.capability_source);
}

/**
 * Map an array of pi registry models to a router fleet catalog.
 */
export function mapFleetFromRegistry(models: readonly PiModelInput[]): MappedModelProfile[] {
  return models.map(mapPiModelToProfile);
}
