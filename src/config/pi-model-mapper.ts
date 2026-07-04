/**
 * Pi model registry → ModelProfile mapper.
 *
 * Maps pi `Model` objects (provider + id) to router fleet entries using
 * pattern-based lookup for known families. Unknown models receive conservative
 * economical-cloud defaults.
 */

import type {
  ModelCapabilities,
  ModelPerformance,
  ModelPricing,
  ModelProfile,
  Tier,
} from '../domain/types/entities.js';

/** Pi registry `Model.cost` shape — per-token USD rates. */
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
}

interface ModelFamilyDefaults {
  readonly tier: Tier;
  readonly capabilities: ModelCapabilities;
  readonly performance?: ModelPerformance;
  readonly pricing: ModelPricing;
  readonly endpoint?: string;
}

interface ModelPatternRule {
  readonly pattern: RegExp;
  readonly defaults: ModelFamilyDefaults;
}

const LOCAL_PROVIDERS = new Set(['lmstudio', 'ollama']);

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

/** Ordered rules — first match wins. */
const MODEL_PATTERN_RULES: readonly ModelPatternRule[] = [
  { pattern: /claude[-_.]?opus|claude[-_.]?sonnet|opus|sonnet/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /claude[-_.]?haiku|haiku/i, defaults: ECONOMICAL_DEFAULTS },
  { pattern: /gpt[-_.]?5\.5|gpt-5-5/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /gpt[-_.]?5\.1|gpt[-_.]?5[-_.]?mini|gpt[-_.]?mini/i, defaults: ECONOMICAL_DEFAULTS },
  { pattern: /gemini[-_.]?2\.5[-_.]?pro|gemini-2-5-pro/i, defaults: FRONTIER_DEFAULTS },
  { pattern: /gemini.*flash|gemini-flash/i, defaults: ECONOMICAL_DEFAULTS },
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
 * Registry cost → USD per 1M tokens: average of input and output rates scaled to 1M.
 * Matches `computeCostPer1MTokens` in litellm-fetch (SP-045/SP-046).
 * Returns undefined when both input and output rates are zero (use pattern default).
 */
function deriveFallbackCostPer1M(cost: PiRegistryCost): number | undefined {
  const { input, output } = cost;
  if (input === 0 && output === 0) {
    return undefined;
  }

  const inputPer1M = input * 1_000_000;
  const outputPer1M = output * 1_000_000;
  return (inputPer1M + outputPer1M) / 2;
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

function buildProfile(input: PiModelInput, defaults: ModelFamilyDefaults): ModelProfile {
  const provider = input.provider.trim();
  const registryKey = `${normalizeProvider(provider)}/${input.id}`;

  const profile: ModelProfile = {
    id: input.id,
    tier: defaults.tier,
    provider,
    capabilities: { ...defaults.capabilities },
    pricing: {
      registry_key: defaults.pricing.registry_key ?? registryKey,
      fallback_cost_per_1m: resolveFallbackCost(input, defaults),
    },
  };

  const withPerformance =
    defaults.performance !== undefined
      ? { ...profile, performance: { ...defaults.performance } }
      : profile;

  if (defaults.endpoint !== undefined) {
    return { ...withPerformance, endpoint: defaults.endpoint };
  }

  return withPerformance;
}

/**
 * Map a pi model registry entry to a router ModelProfile.
 */
export function mapPiModelToProfile(input: PiModelInput): ModelProfile {
  const provider = normalizeProvider(input.provider);

  if (LOCAL_PROVIDERS.has(provider)) {
    // Local models stay free — registry cost must not override zero-tier pricing.
    const localInput: PiModelInput = {
      provider: input.provider,
      id: input.id,
      ...(input.name !== undefined ? { name: input.name } : {}),
    };
    return buildProfile(localInput, LOCAL_DEFAULTS);
  }

  const matched = matchPatternRules(input.id);
  if (matched) {
    return buildProfile(input, matched);
  }

  return buildProfile(input, UNKNOWN_DEFAULTS);
}

/**
 * Map an array of pi registry models to a router fleet catalog.
 */
export function mapFleetFromRegistry(models: readonly PiModelInput[]): ModelProfile[] {
  return models.map(mapPiModelToProfile);
}
