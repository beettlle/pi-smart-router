/**
 * TwinRouterBench static track adapter — SP-153, GitHub #79 (part 3).
 *
 * Converts TwinRouterBench-compatible static track fixtures (step-level router-visible
 * prefixes with execution-verified target tiers) into pi-smart-router eval trace
 * fixtures for the three-track harness (SP-152).
 */

import { z } from 'zod';

import {
  EVAL_FIXTURE_SCHEMA_VERSION,
  EvalTierSchema,
  FrozenCatalogSchema,
  cheapestModelForTier,
  estimateStepCostUsd,
  loadEvalTraceFixture,
  tierAtLeast,
  validateEvalTraceFixture,
  type EvalTraceFixture,
  type EvalTraceStep,
  type EvalTier,
  type FrozenCatalog,
} from './fixture-schema.js';

/** TwinRouterBench static track schema version. */
export const TWINROUTERBENCH_STATIC_SCHEMA_VERSION = '1.0.0' as const;

export const TwinRouterBenchBenchmarkSourceSchema = z.enum([
  'swe-bench-verified',
  'terminal-bench',
  'custom',
]);

export type TwinRouterBenchBenchmarkSource = z.infer<
  typeof TwinRouterBenchBenchmarkSourceSchema
>;

/**
 * Single static-track record: one intermediate agent prefix with a verified target tier
 * from downgrade-and-cascade protocol (gemini-research §9).
 */
export const TwinRouterBenchStaticRecordSchema = z.object({
  trace_id: z.string().min(1),
  session_id_hash: z.string().min(8),
  step_index: z.number().int().nonnegative(),
  turn_type: z.string().min(1),
  prefix_hash: z.string().min(8),
  prefix_token_estimate: z.number().int().nonnegative(),
  verified_target_tier: EvalTierSchema,
  verified_target_model_id: z.string().min(1),
  verified_tool_progression: z.boolean(),
  downgrade_cascade_verified: z.boolean(),
  benchmark_source: TwinRouterBenchBenchmarkSourceSchema,
  /**
   * Optional baseline routing under test. When omitted, adapter assumes economical-cloud
   * as the downgrade-first candidate for static-track smoke fixtures.
   */
  baseline_tier: EvalTierSchema.optional(),
  baseline_model_id: z.string().min(1).optional(),
  baseline_reason_code: z.string().min(1).optional(),
});

export type TwinRouterBenchStaticRecord = z.infer<typeof TwinRouterBenchStaticRecordSchema>;

/** Root TwinRouterBench static track document (one or more prefix records per file). */
export const TwinRouterBenchStaticTrackSchema = z.object({
  schema_version: z.literal(TWINROUTERBENCH_STATIC_SCHEMA_VERSION),
  track: z.literal('static'),
  frozen_catalog: FrozenCatalogSchema,
  records: z.array(TwinRouterBenchStaticRecordSchema).min(1),
});

export type TwinRouterBenchStaticTrack = z.infer<typeof TwinRouterBenchStaticTrackSchema>;

export class TwinRouterBenchAdapterError extends Error {
  override readonly name = 'TwinRouterBenchAdapterError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Parse a TwinRouterBench static track payload. */
export function parseTwinRouterBenchStaticTrack(raw: unknown): TwinRouterBenchStaticTrack {
  const result = TwinRouterBenchStaticTrackSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new TwinRouterBenchAdapterError(`Invalid TwinRouterBench static track: ${detail}`);
  }
  return result.data;
}

/** True when JSON looks like a TwinRouterBench static track file. */
export function isTwinRouterBenchStaticTrack(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  return obj.track === 'static' && obj.schema_version === TWINROUTERBENCH_STATIC_SCHEMA_VERSION;
}

function resolveBaselineRouting(
  record: TwinRouterBenchStaticRecord,
  catalog: FrozenCatalog,
): { tier: EvalTier; model_id: string; reason_code: string } {
  if (record.baseline_tier && record.baseline_model_id) {
    return {
      tier: record.baseline_tier,
      model_id: record.baseline_model_id,
      reason_code: record.baseline_reason_code ?? 'twinrouterbench_baseline',
    };
  }

  const economical = cheapestModelForTier(catalog, 'economical-cloud');
  return {
    tier: economical.tier,
    model_id: economical.model_id,
    reason_code: 'downgrade_first_candidate',
  };
}

function recordToStep(record: TwinRouterBenchStaticRecord, catalog: FrozenCatalog): EvalTraceStep {
  const baseline = resolveBaselineRouting(record, catalog);
  const costUsd = estimateStepCostUsd(catalog, baseline.model_id, record.prefix_token_estimate);
  const targetAdequate =
    tierAtLeast(baseline.tier, record.verified_target_tier) && record.downgrade_cascade_verified;

  return {
    step_index: record.step_index,
    turn_type: record.turn_type,
    prefix_hash: record.prefix_hash,
    prefix_token_estimate: record.prefix_token_estimate,
    actual: {
      tier: baseline.tier,
      model_id: baseline.model_id,
      cost_usd: costUsd,
      reason_code: baseline.reason_code,
    },
    step_outcome: {
      success: targetAdequate,
      min_tier: record.verified_target_tier,
      min_model_id: record.verified_target_model_id,
      verified_tool_progression: record.verified_tool_progression,
    },
  };
}

function fixtureIdForSession(sessionIdHash: string, records: readonly TwinRouterBenchStaticRecord[]): string {
  const sources = [...new Set(records.map((r) => r.benchmark_source))].sort().join('+');
  const shortSession = sessionIdHash.slice(0, 12);
  return `trb-static-${sources}-${shortSession}`;
}

/** Group static records by session and convert each group to an eval trace fixture. */
export function adaptTwinRouterBenchStaticTrack(track: TwinRouterBenchStaticTrack): EvalTraceFixture[] {
  const bySession = new Map<string, TwinRouterBenchStaticRecord[]>();

  for (const record of track.records) {
    const group = bySession.get(record.session_id_hash) ?? [];
    group.push(record);
    bySession.set(record.session_id_hash, group);
  }

  const fixtures: EvalTraceFixture[] = [];

  for (const [sessionIdHash, records] of bySession) {
    const sorted = [...records].sort((a, b) => a.step_index - b.step_index);

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]!.step_index !== i) {
        throw new TwinRouterBenchAdapterError(
          `Session ${sessionIdHash}: static track steps must be contiguous from 0; expected ${i}, got ${sorted[i]!.step_index}`,
        );
      }
    }

    const steps = sorted.map((record) => recordToStep(record, track.frozen_catalog));
    const finalTurnIndex = sorted[sorted.length - 1]!.step_index;
    const taskSuccess = steps.every((s) => s.step_outcome.success);

    const fixture: EvalTraceFixture = {
      schema_version: EVAL_FIXTURE_SCHEMA_VERSION,
      fixture_id: fixtureIdForSession(sessionIdHash, sorted),
      frozen_catalog: track.frozen_catalog,
      session: {
        session_id_hash: sessionIdHash,
        steps,
      },
      outcome: {
        task_success: taskSuccess,
        final_turn_index: finalTurnIndex,
      },
    };

    fixtures.push(validateEvalTraceFixture(fixture));
  }

  return fixtures;
}

/** Parse TwinRouterBench static track JSON and return validated eval fixtures. */
export function loadTwinRouterBenchStaticTrack(raw: unknown): EvalTraceFixture[] {
  const track = parseTwinRouterBenchStaticTrack(raw);
  return adaptTwinRouterBenchStaticTrack(track);
}

/**
 * Load eval fixtures from either native eval trace JSON or TwinRouterBench static track.
 * Native fixtures pass through `loadEvalTraceFixture`; static track files expand to one or more fixtures.
 */
export function loadEvalFixtureDocument(raw: unknown): EvalTraceFixture[] {
  if (isTwinRouterBenchStaticTrack(raw)) {
    return loadTwinRouterBenchStaticTrack(raw);
  }
  return [loadEvalTraceFixture(raw)];
}
