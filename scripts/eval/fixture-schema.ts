/**
 * Eval harness fixture schema — SP-151, GitHub #79 (part 1).
 *
 * Defines the JSON shape for multi-turn agent trace fixtures with step-level
 * routing decisions. Fixtures pin a frozen model catalog + checkpoint date so
 * published QR/CS numbers are reproducible (routing-roadmap §5 frozen catalog rule).
 */

import { z } from 'zod';

/** Current fixture schema version. Bump when breaking fields change. */
export const EVAL_FIXTURE_SCHEMA_VERSION = '1.0.0' as const;

/** Documented tier ordering for capability and cost comparisons. */
export const TIER_CAPABILITY_ORDER = [
  'zero-tier',
  'economical-cloud',
  'frontier-cloud',
] as const;

export const EvalTierSchema = z.enum([
  'zero-tier',
  'economical-cloud',
  'frontier-cloud',
]);

export type EvalTier = z.infer<typeof EvalTierSchema>;

/**
 * Frozen model catalog entry — prices and capability floor at checkpoint date.
 * Published eval numbers must cite `catalog_id` + `checkpoint_date`.
 */
export const FrozenCatalogModelSchema = z.object({
  model_id: z.string().min(1),
  tier: EvalTierSchema,
  cost_per_1m_input_usd: z.number().nonnegative(),
  /** Optional capability score in [0, 1] for downstream capability track (SP-152). */
  capability_score: z.number().min(0).max(1).optional(),
});

export type FrozenCatalogModel = z.infer<typeof FrozenCatalogModelSchema>;

/**
 * Frozen catalog metadata for reproducible offline eval.
 *
 * - `catalog_id`: stable identifier (e.g. git tag or digest label)
 * - `checkpoint_date`: ISO-8601 calendar date when prices/profiles were snapshotted
 */
export const FrozenCatalogSchema = z.object({
  catalog_id: z.string().min(1),
  checkpoint_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  models: z.array(FrozenCatalogModelSchema).min(1),
});

export type FrozenCatalog = z.infer<typeof FrozenCatalogSchema>;

/** Step-level routing decision recorded in a trace fixture. */
export const EvalRoutingDecisionSchema = z.object({
  tier: EvalTierSchema,
  model_id: z.string().min(1),
  cost_usd: z.number().nonnegative(),
  reason_code: z.string().min(1),
});

export type EvalRoutingDecision = z.infer<typeof EvalRoutingDecisionSchema>;

/**
 * Per-step outcome label for counterfactual replay.
 *
 * `min_tier` is the hindsight-optimal (cheapest) tier that would succeed at this
 * step given verified tool progression. Used for cumulative regret computation.
 */
export const EvalStepOutcomeSchema = z.object({
  success: z.boolean(),
  min_tier: EvalTierSchema,
  min_model_id: z.string().min(1),
  /** True when AST-style tool-call validation confirms progression at this step. */
  verified_tool_progression: z.boolean(),
});

export type EvalStepOutcome = z.infer<typeof EvalStepOutcomeSchema>;

/**
 * Optional explicit counterfactual scenario (e.g. "cheap at step k").
 * When omitted, replay derives scenarios from `step_outcome` + frozen catalog.
 */
export const EvalCounterfactualSchema = z.object({
  scenario: z.enum(['cheap_at_step_k', 'hindsight_optimal']),
  tier: EvalTierSchema,
  model_id: z.string().min(1),
  would_succeed: z.boolean(),
  cost_usd: z.number().nonnegative(),
});

export type EvalCounterfactual = z.infer<typeof EvalCounterfactualSchema>;

/**
 * Single step in a multi-turn agent trace.
 *
 * `prefix_hash` is a stable step-level prefix identifier (TwinRouterBench-style)
 * for deduplication and prefix-cache continuity analysis without raw prompt text.
 */
export const EvalTraceStepSchema = z.object({
  step_index: z.number().int().nonnegative(),
  turn_type: z.string().min(1),
  prefix_hash: z.string().min(8),
  prefix_token_estimate: z.number().int().nonnegative(),
  actual: EvalRoutingDecisionSchema,
  step_outcome: EvalStepOutcomeSchema,
  counterfactuals: z.array(EvalCounterfactualSchema).optional(),
});

export type EvalTraceStep = z.infer<typeof EvalTraceStepSchema>;

export const EvalSessionSchema = z.object({
  session_id_hash: z.string().min(8),
  steps: z.array(EvalTraceStepSchema).min(1),
});

export type EvalSession = z.infer<typeof EvalSessionSchema>;

export const EvalTraceOutcomeSchema = z.object({
  task_success: z.boolean(),
  final_turn_index: z.number().int().nonnegative(),
});

export type EvalTraceOutcome = z.infer<typeof EvalTraceOutcomeSchema>;

/** Root eval trace fixture document. */
export const EvalTraceFixtureSchema = z.object({
  schema_version: z.literal(EVAL_FIXTURE_SCHEMA_VERSION),
  fixture_id: z.string().min(1),
  frozen_catalog: FrozenCatalogSchema,
  session: EvalSessionSchema,
  outcome: EvalTraceOutcomeSchema,
});

export type EvalTraceFixture = z.infer<typeof EvalTraceFixtureSchema>;

export class EvalFixtureValidationError extends Error {
  override readonly name = 'EvalFixtureValidationError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Parse and validate a fixture payload; throws on schema violations. */
export function parseEvalTraceFixture(raw: unknown): EvalTraceFixture {
  const result = EvalTraceFixtureSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new EvalFixtureValidationError(`Invalid eval trace fixture: ${detail}`);
  }
  return result.data;
}

/** Return tier rank (higher = more capable / expensive). */
export function tierRank(tier: EvalTier): number {
  return TIER_CAPABILITY_ORDER.indexOf(tier);
}

/** True when `a` is at least as capable as `b`. */
export function tierAtLeast(a: EvalTier, b: EvalTier): boolean {
  return tierRank(a) >= tierRank(b);
}

/** Lookup a model entry from the frozen catalog; throws if missing. */
export function lookupCatalogModel(
  catalog: FrozenCatalog,
  modelId: string,
): FrozenCatalogModel {
  const model = catalog.models.find((m) => m.model_id === modelId);
  if (!model) {
    throw new EvalFixtureValidationError(
      `Model ${modelId} not found in frozen catalog ${catalog.catalog_id}`,
    );
  }
  return model;
}

/** Cheapest model in catalog for the given tier. */
export function cheapestModelForTier(
  catalog: FrozenCatalog,
  tier: EvalTier,
): FrozenCatalogModel {
  const candidates = catalog.models.filter((m) => m.tier === tier);
  if (candidates.length === 0) {
    throw new EvalFixtureValidationError(`No models for tier ${tier} in catalog ${catalog.catalog_id}`);
  }
  return candidates.reduce((best, cur) =>
    cur.cost_per_1m_input_usd < best.cost_per_1m_input_usd ? cur : best,
  );
}

/** Estimate step cost from token estimate and catalog model pricing. */
export function estimateStepCostUsd(
  catalog: FrozenCatalog,
  modelId: string,
  prefixTokenEstimate: number,
): number {
  const model = lookupCatalogModel(catalog, modelId);
  return (prefixTokenEstimate / 1_000_000) * model.cost_per_1m_input_usd;
}

/** Validate step indices are contiguous starting at 0. */
export function assertContiguousSteps(steps: readonly EvalTraceStep[]): void {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]!.step_index !== i) {
      throw new EvalFixtureValidationError(
        `Steps must be contiguous from 0; expected index ${i}, got ${steps[i]!.step_index}`,
      );
    }
  }
}

/** Full fixture validation including cross-field consistency checks. */
export function validateEvalTraceFixture(fixture: EvalTraceFixture): EvalTraceFixture {
  assertContiguousSteps(fixture.session.steps);

  for (const step of fixture.session.steps) {
    lookupCatalogModel(fixture.frozen_catalog, step.actual.model_id);
    lookupCatalogModel(fixture.frozen_catalog, step.step_outcome.min_model_id);

    if (!tierAtLeast(step.actual.tier, step.step_outcome.min_tier) && step.step_outcome.success) {
      throw new EvalFixtureValidationError(
        `Step ${step.step_index}: actual tier ${step.actual.tier} is below hindsight min_tier ${step.step_outcome.min_tier} but step_outcome.success is true`,
      );
    }

    const minModel = lookupCatalogModel(fixture.frozen_catalog, step.step_outcome.min_model_id);
    if (minModel.tier !== step.step_outcome.min_tier) {
      throw new EvalFixtureValidationError(
        `Step ${step.step_index}: min_model_id tier mismatch (${minModel.tier} vs ${step.step_outcome.min_tier})`,
      );
    }
  }

  return fixture;
}

/** Parse raw JSON and run full validation. */
export function loadEvalTraceFixture(raw: unknown): EvalTraceFixture {
  return validateEvalTraceFixture(parseEvalTraceFixture(raw));
}
