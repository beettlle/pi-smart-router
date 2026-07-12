/**
 * Dogfood Track B export → TwinRouterBench-style harness fixtures — SP-203 / #111.
 *
 * Maps privacy-safe dogfood export rows (telemetry-contrib-shaped routing fields
 * plus explicit outcome labels) into eval trace fixtures for the three-track harness.
 *
 * Required outcome fields (never invented):
 * - `success_label` (boolean) — step outcome success
 * - `min_tier` — hindsight-optimal tier label
 * - `min_model_id` — model id for that tier
 *
 * When any required label is missing/null, refuse the export (caller skips Track B).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import {
  EVAL_FIXTURE_SCHEMA_VERSION,
  EvalTierSchema,
  FrozenCatalogSchema,
  estimateStepCostUsd,
  validateEvalTraceFixture,
  type EvalTraceFixture,
  type EvalTraceStep,
  type FrozenCatalog,
} from './fixture-schema.js';

/** Dogfood Track B export document schema version. */
export const DOGFOOD_TRACK_B_SCHEMA_VERSION = '1.0.0' as const;

/**
 * Outcome fields that must be present and non-null on every row.
 * Adapter never invents these from routing tier / signals alone.
 */
export const DOGFOOD_TRACK_B_REQUIRED_OUTCOME_FIELDS = [
  'success_label',
  'min_tier',
  'min_model_id',
] as const;

export type DogfoodTrackBRequiredOutcomeField =
  (typeof DOGFOOD_TRACK_B_REQUIRED_OUTCOME_FIELDS)[number];

/**
 * Single privacy-safe dogfood export row with harness outcome labels.
 *
 * Routing fields align with telemetry-contrib scalars. Outcome labels are
 * stricter than contrib (`success_label` may be null there) — Track B requires
 * boolean success + min_tier / min_model_id so the harness can score without
 * inventing labels.
 */
export const DogfoodTrackBRecordSchema = z.object({
  session_id_hash: z.string().min(8),
  step_index: z.number().int().nonnegative(),
  turn_type: z.string().min(1),
  /** Optional stable prefix id; derived deterministically when omitted. */
  prefix_hash: z.string().min(8).optional(),
  prefix_token_estimate: z.number().int().nonnegative().optional(),
  tier: EvalTierSchema,
  selected_model_id: z.string().min(1),
  reason_code: z.string().min(1),
  estimated_cost_usd: z.number().nonnegative().nullable().optional(),
  estimated_input_tokens: z.number().int().nonnegative().nullable().optional(),
  /** Required outcome label — must be boolean (null/missing → refuse). */
  success_label: z.boolean(),
  /** Required hindsight-optimal tier — never inferred from `tier`. */
  min_tier: EvalTierSchema,
  /** Required model for min_tier. */
  min_model_id: z.string().min(1),
  verified_tool_progression: z.boolean().optional(),
});

export type DogfoodTrackBRecord = z.infer<typeof DogfoodTrackBRecordSchema>;

/** Root dogfood Track B export document. */
export const DogfoodTrackBExportSchema = z.object({
  schema_version: z.literal(DOGFOOD_TRACK_B_SCHEMA_VERSION),
  track: z.literal('dogfood-track-b'),
  frozen_catalog: FrozenCatalogSchema,
  records: z.array(DogfoodTrackBRecordSchema).min(1),
});

export type DogfoodTrackBExport = z.infer<typeof DogfoodTrackBExportSchema>;

export class DogfoodTrackBAdapterError extends Error {
  override readonly name = 'DogfoodTrackBAdapterError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export type DogfoodTrackBAdaptResult =
  | { readonly ok: true; readonly fixtures: EvalTraceFixture[]; readonly record_count: number }
  | { readonly ok: false; readonly reason: string };

function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

/**
 * Detect missing required outcome labels on a raw row (before zod), so skip
 * reasons can say "incomplete labels" rather than a generic schema error.
 */
export function missingDogfoodOutcomeLabels(raw: unknown): DogfoodTrackBRequiredOutcomeField[] {
  if (typeof raw !== 'object' || raw === null) {
    return [...DOGFOOD_TRACK_B_REQUIRED_OUTCOME_FIELDS];
  }
  const row = raw as Record<string, unknown>;
  const missing: DogfoodTrackBRequiredOutcomeField[] = [];
  for (const field of DOGFOOD_TRACK_B_REQUIRED_OUTCOME_FIELDS) {
    const value = row[field];
    if (field === 'success_label') {
      if (typeof value !== 'boolean') {
        missing.push(field);
      }
    } else if (typeof value !== 'string' || value.length === 0) {
      missing.push(field);
    }
  }
  return missing;
}

/** True when JSON looks like a dogfood Track B export document. */
export function isDogfoodTrackBExport(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  return obj.track === 'dogfood-track-b' && obj.schema_version === DOGFOOD_TRACK_B_SCHEMA_VERSION;
}

function derivePrefixHash(sessionIdHash: string, stepIndex: number): string {
  return createHash('sha256')
    .update(`dogfood-track-b:${sessionIdHash}:${stepIndex}`)
    .digest('hex')
    .slice(0, 24);
}

function recordToStep(record: DogfoodTrackBRecord, catalog: FrozenCatalog): EvalTraceStep {
  const tokenEstimate =
    record.prefix_token_estimate ??
    (typeof record.estimated_input_tokens === 'number' ? record.estimated_input_tokens : 0);
  const costUsd =
    typeof record.estimated_cost_usd === 'number'
      ? record.estimated_cost_usd
      : estimateStepCostUsd(catalog, record.selected_model_id, tokenEstimate);

  return {
    step_index: record.step_index,
    turn_type: record.turn_type,
    prefix_hash: record.prefix_hash ?? derivePrefixHash(record.session_id_hash, record.step_index),
    prefix_token_estimate: tokenEstimate,
    actual: {
      tier: record.tier,
      model_id: record.selected_model_id,
      cost_usd: costUsd,
      reason_code: record.reason_code,
    },
    step_outcome: {
      success: record.success_label,
      min_tier: record.min_tier,
      min_model_id: record.min_model_id,
      verified_tool_progression: record.verified_tool_progression ?? true,
    },
  };
}

function fixtureIdForSession(sessionIdHash: string): string {
  return `dogfood-track-b-${sessionIdHash.slice(0, 12)}`;
}

/** Convert a validated dogfood Track B export into eval harness fixtures. */
export function adaptDogfoodTrackBExport(doc: DogfoodTrackBExport): EvalTraceFixture[] {
  const bySession = new Map<string, DogfoodTrackBRecord[]>();

  for (const record of doc.records) {
    const group = bySession.get(record.session_id_hash) ?? [];
    group.push(record);
    bySession.set(record.session_id_hash, group);
  }

  const fixtures: EvalTraceFixture[] = [];

  for (const [sessionIdHash, records] of bySession) {
    const sorted = [...records].sort((a, b) => a.step_index - b.step_index);

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]!.step_index !== i) {
        throw new DogfoodTrackBAdapterError(
          `Session ${sessionIdHash}: steps must be contiguous from 0; expected ${i}, got ${sorted[i]!.step_index}`,
        );
      }
    }

    const steps = sorted.map((record) => recordToStep(record, doc.frozen_catalog));
    const finalTurnIndex = sorted[sorted.length - 1]!.step_index;
    const taskSuccess = steps.every((s) => s.step_outcome.success);

    const fixture: EvalTraceFixture = {
      schema_version: EVAL_FIXTURE_SCHEMA_VERSION,
      fixture_id: fixtureIdForSession(sessionIdHash),
      frozen_catalog: doc.frozen_catalog,
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

/**
 * Parse a dogfood Track B export payload.
 * Throws {@link DogfoodTrackBAdapterError} on schema failure.
 */
export function parseDogfoodTrackBExport(raw: unknown): DogfoodTrackBExport {
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { records?: unknown }).records)) {
    const records = (raw as { records: unknown[] }).records;
    for (let i = 0; i < records.length; i++) {
      const missing = missingDogfoodOutcomeLabels(records[i]);
      if (missing.length > 0) {
        throw new DogfoodTrackBAdapterError(
          `Record ${i}: incomplete outcome labels (missing ${missing.join(', ')}); ` +
            'required success_label, min_tier, min_model_id — no dogfood labels invented',
        );
      }
    }
  }

  const result = DogfoodTrackBExportSchema.safeParse(raw);
  if (!result.success) {
    throw new DogfoodTrackBAdapterError(
      `Invalid dogfood Track B export: ${formatZodIssues(result.error)}`,
    );
  }
  return result.data;
}

/** Parse + adapt; returns fixtures or a skip reason (never invents labels). */
export function tryAdaptDogfoodTrackBExport(raw: unknown): DogfoodTrackBAdaptResult {
  try {
    const doc = parseDogfoodTrackBExport(raw);
    const fixtures = adaptDogfoodTrackBExport(doc);
    return { ok: true, fixtures, record_count: doc.records.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

/** Load a dogfood Track B JSON export from disk and adapt to harness fixtures. */
export function loadDogfoodTrackBExport(filePath: string): DogfoodTrackBAdaptResult {
  const abs = resolve(filePath);
  let rawText: string;
  try {
    rawText = readFileSync(abs, 'utf8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `Track B dogfood export unreadable at ${abs}: ${detail}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `Track B dogfood export is not valid JSON at ${abs}: ${detail}`,
    };
  }

  return tryAdaptDogfoodTrackBExport(parsed);
}
