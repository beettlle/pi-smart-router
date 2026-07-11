#!/usr/bin/env node
/**
 * SWE-Gym verifier-style labels → privacy-safe label-pack JSONL — SP-189, GitHub #102.
 *
 * Accepts offline JSONL rows with a binary verifier outcome (`resolved` or `success`)
 * and optional numeric features. Never copies `messages` / prompt / content into the
 * pack. Skips unmappable rows; never invents outcomes.
 *
 * Upstream pins: see `tests/eval/corpus/label-packs/PROVENANCE.md`.
 * CI uses the tiny synthetic fixture under `tests/eval/corpus/label-packs/swe-gym/`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  LABEL_PACK_SCHEMA_VERSION,
  formatLabelPackJsonl,
  parseLabelPackRow,
  type LabelPackRow,
  type LabelPackTier,
} from './lib/label-pack-schema.js';
import { P_SUCCESS_FEATURE_NAMES } from '../src/domain/routing/p-success-classifier.js';

/** Pinned HF revision for SWE-Gym task corpus (documented in PROVENANCE.md). */
export const SWE_GYM_PINNED_REVISION =
  'bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb' as const;

/** Pinned HF revision for OpenHands verifier trajectories (resolved labels). */
export const SWE_GYM_VERIFIER_TRAJECTORIES_PINNED_REVISION =
  'd47f6cab996d3a5f7ba517c0be57595f4f6201ce' as const;

export const SWE_GYM_LABEL_SOURCE = 'swe-gym' as const;

export class SweGymIngestError extends Error {
  override readonly name = 'SweGymIngestError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface SweGymIngestOptions {
  readonly limit?: number;
  readonly defaultTier?: LabelPackTier;
}

export interface SweGymIngestResult {
  readonly rows: readonly LabelPackRow[];
  readonly accepted: number;
  readonly skipped: number;
  readonly limited: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Extract binary verifier outcome; null when missing or non-boolean (never invent). */
export function extractVerifierSuccess(record: Record<string, unknown>): boolean | null {
  if (typeof record.resolved === 'boolean') {
    return record.resolved;
  }
  if (typeof record.success === 'boolean') {
    return record.success;
  }
  if (typeof record.success_label === 'boolean') {
    return record.success_label;
  }
  return null;
}

function hashSampleId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

function stableSampleId(record: Record<string, unknown>, lineIndex: number): string {
  if (typeof record.sample_id === 'string' && record.sample_id.trim().length > 0) {
    return record.sample_id.trim();
  }
  if (typeof record.instance_id === 'string' && record.instance_id.trim().length > 0) {
    return `swe-gym:${record.instance_id.trim()}`;
  }
  // Derive from non-text metadata only (never from message bodies).
  const meta = JSON.stringify({
    i: lineIndex,
    resolved: record.resolved,
    success: record.success,
    repo: typeof record.repo === 'string' ? record.repo : undefined,
  });
  return `swe-gym:${hashSampleId(meta)}`;
}

/**
 * Derive privacy-safe numeric features from verifier-style rows.
 * Uses precomputed `features` when present; otherwise length/role stats from
 * `messages` without retaining any message text.
 */
export function deriveSweGymFeatures(
  record: Record<string, unknown>,
): Record<string, number> | null {
  if (isPlainObject(record.features)) {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(record.features)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      }
    }
    if (Object.keys(out).length > 0) {
      return out;
    }
  }

  const messages = record.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  let totalChars = 0;
  let toolLike = 0;
  for (const entry of messages) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const content = entry.content;
    if (typeof content === 'string') {
      totalChars += content.length;
    }
    const role = typeof entry.role === 'string' ? entry.role.toLowerCase() : '';
    if (role.includes('tool') || role === 'function') {
      toolLike += 1;
    }
  }

  const messageCount = messages.length;
  return {
    prompt_length_norm: clamp01(totalChars / 8_000),
    estimated_input_tokens_norm: clamp01(totalChars / 4 / 2_000),
    triage_cyclomatic_score: clamp01(messageCount / 40),
    requirement_reasoning: 0.7,
    requirement_code_gen: 0.85,
    requirement_tool_use: clamp01(toolLike / Math.max(1, messageCount)),
    has_tool_context: toolLike > 0 ? 1 : 0,
    compaction_flag: 0,
    routing_latency_norm: 0,
    economical_tier: 1,
    turn_count_norm: clamp01(messageCount / 40),
  };
}

function optionalTier(record: Record<string, unknown>): LabelPackTier | undefined {
  const tier = record.tier;
  if (tier === 'zero-tier' || tier === 'economical-cloud' || tier === 'frontier-cloud') {
    return tier;
  }
  return undefined;
}

/**
 * Convert one upstream verifier-style row into a label-pack row.
 * Returns null when the row is unmappable (missing outcome or features).
 */
export function convertSweGymVerifierRow(
  raw: unknown,
  lineIndex: number,
  options: SweGymIngestOptions = {},
): LabelPackRow | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const success = extractVerifierSuccess(raw);
  if (success === null) {
    return null;
  }

  const features = deriveSweGymFeatures(raw);
  if (features === null) {
    return null;
  }

  // Ensure core P(success) dims exist when deriving from messages.
  for (const name of P_SUCCESS_FEATURE_NAMES) {
    if (features[name] === undefined) {
      features[name] = 0;
    }
  }

  const candidate: LabelPackRow = {
    schema_version: LABEL_PACK_SCHEMA_VERSION,
    sample_id: stableSampleId(raw, lineIndex),
    source: SWE_GYM_LABEL_SOURCE,
    features,
    success,
    tier: optionalTier(raw) ?? options.defaultTier,
    outcome_signals: [success ? 'verifier_resolved' : 'verifier_failed'],
  };

  // Validate via schema (rejects any accidental prompt leakage in candidate).
  return parseLabelPackRow(candidate, `swe-gym:${lineIndex + 1}`);
}

/** Convert verifier-style JSONL text into validated label-pack rows. */
export function ingestSweGymVerifierJsonl(
  text: string,
  options: SweGymIngestOptions = {},
): SweGymIngestResult {
  const lines = text.split(/\r?\n/);
  const rows: LabelPackRow[] = [];
  let skipped = 0;
  let limited = false;
  const limit = options.limit;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) {
      continue;
    }

    if (limit !== undefined && rows.length >= limit) {
      limited = true;
      break;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }

    try {
      const row = convertSweGymVerifierRow(parsed, i, options);
      if (row === null) {
        skipped += 1;
        continue;
      }
      rows.push(row);
    } catch {
      skipped += 1;
    }
  }

  return { rows, accepted: rows.length, skipped, limited };
}

export function ingestSweGymVerifierFile(
  inputPath: string,
  options: SweGymIngestOptions = {},
): SweGymIngestResult {
  const text = readFileSync(inputPath, 'utf8');
  return ingestSweGymVerifierJsonl(text, options);
}

export interface SweGymCliArgs {
  readonly input: string;
  readonly output?: string;
  readonly limit?: number;
  readonly help?: boolean;
}

export function parseSweGymIngestArgs(argv: readonly string[]): SweGymCliArgs {
  let input: string | undefined;
  let output: string | undefined;
  let limit: number | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--input' && argv[i + 1]) {
      input = argv[++i];
    } else if (arg === '--output' && argv[i + 1]) {
      output = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[++i]!, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new SweGymIngestError(`Invalid --limit ${argv[i]!}; expected positive integer`);
      }
      limit = parsed;
    } else if (!arg.startsWith('-') && input === undefined) {
      input = arg;
    } else {
      throw new SweGymIngestError(`Unknown argument: ${arg}`);
    }
  }

  if (help) {
    return { input: input ?? '', help: true };
  }
  if (!input) {
    throw new SweGymIngestError('Missing --input path');
  }
  return { input, output, limit };
}

export function sweGymIngestUsage(): string {
  return `Usage: ingest-swe-gym-labels --input verifier.jsonl [--output pack.jsonl] [--limit N]

Converts SWE-Gym verifier-style success/fail rows into privacy-safe label-pack JSONL.
Skips unmappable rows; never invents outcomes; never writes prompt/message text.
Pins: SWE-Gym ${SWE_GYM_PINNED_REVISION}; verifier trajectories ${SWE_GYM_VERIFIER_TRAJECTORIES_PINNED_REVISION}.
`;
}

export function runSweGymIngestCli(argv: readonly string[]): number {
  let args: SweGymCliArgs;
  try {
    args = parseSweGymIngestArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error(sweGymIngestUsage());
    return 1;
  }

  if (args.help) {
    process.stdout.write(sweGymIngestUsage());
    return 0;
  }

  const inputPath = resolve(args.input);
  const result = ingestSweGymVerifierFile(inputPath, { limit: args.limit });
  const jsonl = formatLabelPackJsonl(result.rows);

  if (args.output) {
    writeFileSync(resolve(args.output), jsonl, 'utf8');
  } else {
    process.stdout.write(jsonl);
  }

  console.error(
    `ingest-swe-gym-labels: accepted=${result.accepted} skipped=${result.skipped}` +
      (result.limited ? ' (limit reached)' : ''),
  );
  return 0;
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  process.argv[1]?.endsWith('ingest-swe-gym-labels.ts') ||
  process.argv[1]?.endsWith('ingest-swe-gym-labels.js');

if (isMain) {
  process.exitCode = runSweGymIngestCli(process.argv.slice(2));
}
