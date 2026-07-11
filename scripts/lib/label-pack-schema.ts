/**
 * Privacy-safe public label-pack schema — SP-189, GitHub #102.
 *
 * Pack rows carry numeric feature vectors + binary outcomes only.
 * Raw prompt / message / content keys are rejected (same taint rules as
 * `scripts/calibration-aggregate.ts`). Usable by ingest converters and
 * later calibration dry-run (SP-191).
 */

import { readFileSync } from 'node:fs';

import { z } from 'zod';

import {
  CALIBRATION_CONTRIB_REJECT_KEYS,
  CONTRIB_TAINTED_KEY_PATTERN,
} from '../calibration-aggregate.js';
import { P_SUCCESS_FEATURE_NAMES } from '../../src/domain/routing/p-success-classifier.js';

export const LABEL_PACK_SCHEMA_VERSION = 1 as const;

/** Known routing tiers allowed as optional pack metadata. */
export const LABEL_PACK_TIERS = [
  'zero-tier',
  'economical-cloud',
  'frontier-cloud',
] as const;

export type LabelPackTier = (typeof LABEL_PACK_TIERS)[number];

/**
 * Feature keys that contain taint substrings but are length/norm scalars
 * (never raw text). Mirrors P(success) export feature names.
 */
export const LABEL_PACK_FEATURE_KEY_ALLOWLIST: ReadonlySet<string> = new Set([
  ...P_SUCCESS_FEATURE_NAMES,
]);

export class LabelPackError extends Error {
  override readonly name = 'LabelPackError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const finiteNumber = z.number().finite();

/** Numeric feature map — values must be finite numbers; keys privacy-checked. */
export const LabelPackFeaturesSchema = z
  .record(z.string(), finiteNumber)
  .refine((features) => Object.keys(features).length > 0, {
    message: 'features must contain at least one numeric entry',
  });

export const LabelPackRowSchema = z
  .object({
    schema_version: z.literal(LABEL_PACK_SCHEMA_VERSION),
    sample_id: z.string().min(1),
    source: z.string().min(1),
    features: LabelPackFeaturesSchema,
    success: z.boolean(),
    tier: z.enum(LABEL_PACK_TIERS).optional(),
    cluster_id: z.string().min(1).optional(),
    outcome_signals: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type LabelPackRow = z.infer<typeof LabelPackRowSchema>;

export interface LabelPackLoadResult {
  readonly rows: readonly LabelPackRow[];
  readonly accepted: number;
  readonly rejected: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllowlistedFeatureKey(key: string): boolean {
  return LABEL_PACK_FEATURE_KEY_ALLOWLIST.has(key);
}

function isTaintedKey(key: string): boolean {
  if (isAllowlistedFeatureKey(key)) {
    return false;
  }
  return (
    (CALIBRATION_CONTRIB_REJECT_KEYS as readonly string[]).includes(key) ||
    CONTRIB_TAINTED_KEY_PATTERN.test(key)
  );
}

/**
 * Collect forbidden key paths. Under `features.`, only allowlisted
 * length-norm names may contain taint substrings; all other keys use
 * contrib reject/taint rules.
 */
export function collectLabelPackForbiddenKeys(
  value: unknown,
  path = '',
  found: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectLabelPackForbiddenKeys(value[i], `${path}[${i}]`, found);
    }
    return found;
  }

  if (!isPlainObject(value)) {
    return found;
  }

  const underFeatures = path === 'features' || path.startsWith('features.');

  for (const [key, nested] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key;

    if (underFeatures) {
      if (isTaintedKey(key) && !isAllowlistedFeatureKey(key)) {
        found.push(keyPath);
      }
    } else if (isTaintedKey(key)) {
      found.push(keyPath);
    }

    collectLabelPackForbiddenKeys(nested, keyPath, found);
  }

  return found;
}

/** Fail closed when a pack row (or candidate) contains prompt/message/secret keys. */
export function assertLabelPackRecordSafe(
  record: unknown,
  context?: string,
): asserts record is Record<string, unknown> {
  if (!isPlainObject(record)) {
    const suffix = context ? ` (${context})` : '';
    throw new LabelPackError(`Label-pack record must be a JSON object${suffix}`);
  }

  const forbidden = collectLabelPackForbiddenKeys(record);
  if (forbidden.length > 0) {
    const suffix = context ? ` (${context})` : '';
    throw new LabelPackError(
      `Tainted label-pack record rejected${suffix}: forbidden keys ${forbidden.join(', ')}`,
    );
  }
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/** Validate one pack row: taint scan then Zod shape. */
export function parseLabelPackRow(raw: unknown, context?: string): LabelPackRow {
  assertLabelPackRecordSafe(raw, context);
  const parsed = LabelPackRowSchema.safeParse(raw);
  if (!parsed.success) {
    const suffix = context ? ` (${context})` : '';
    throw new LabelPackError(
      `Invalid label-pack row${suffix}: ${formatZodIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

/** Parse one JSONL line into a validated pack row (blank → null). */
export function parseLabelPackLine(line: string, context?: string): LabelPackRow | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const suffix = context ? ` (${context})` : '';
    throw new LabelPackError(`Invalid JSON in label-pack line${suffix}`, {
      cause: error,
    });
  }

  return parseLabelPackRow(parsed, context);
}

/** Load and validate a JSONL label-pack document (fail-closed on any bad row). */
export function loadLabelPackJsonl(text: string, sourceLabel = 'label-pack'): LabelPackLoadResult {
  const lines = text.split(/\r?\n/);
  const rows: LabelPackRow[] = [];
  let rejected = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) {
      continue;
    }
    try {
      const row = parseLabelPackLine(line, `${sourceLabel}:${i + 1}`);
      if (row !== null) {
        rows.push(row);
      }
    } catch (error) {
      rejected += 1;
      throw error instanceof LabelPackError
        ? error
        : new LabelPackError(`Failed to load label-pack row (${sourceLabel}:${i + 1})`, {
            cause: error,
          });
    }
  }

  return { rows, accepted: rows.length, rejected };
}

/** Read a JSONL file from disk and validate every row. */
export function loadLabelPackFile(filePath: string): LabelPackLoadResult {
  const text = readFileSync(filePath, 'utf8');
  return loadLabelPackJsonl(text, filePath);
}

/** Serialize validated rows to JSONL (re-checks taint before write). */
export function formatLabelPackJsonl(rows: readonly LabelPackRow[]): string {
  const lines: string[] = [];
  for (const row of rows) {
    const validated = parseLabelPackRow(row);
    const serialized = JSON.stringify(validated);
    // Defense in depth: serialized artifact must not embed common prompt keys.
    if (
      /"prompt"\s*:/.test(serialized) ||
      /"messages"\s*:/.test(serialized) ||
      /"prompt_text"\s*:/.test(serialized)
    ) {
      throw new LabelPackError(
        `Refusing to serialize label-pack row ${validated.sample_id}: prompt leakage detected`,
      );
    }
    lines.push(serialized);
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

/** True when serialized pack text contains raw prompt/message payload keys. */
export function serializedPackContainsPromptLeakage(serialized: string): boolean {
  return (
    /"prompt"\s*:/.test(serialized) ||
    /"messages"\s*:/.test(serialized) ||
    /"prompt_text"\s*:/.test(serialized) ||
    /"content"\s*:/.test(serialized)
  );
}
