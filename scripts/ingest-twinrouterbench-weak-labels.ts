#!/usr/bin/env node
/**
 * TwinRouterBench static-track → weak label-pack JSONL — SP-190, GitHub #102.
 *
 * Maps privacy-safe static-track records (tier labels + token estimates; no prompt
 * text) into label-pack rows. These are **weak** supervision signals: verified
 * target tier is a routing-floor proxy, not a SWE-Gym / FC-RewardBench verifier
 * grade. Mark rows with `exclude_from_holdout_ece` and document exclusion from
 * holdout ECE (see PROVENANCE.md).
 *
 * CI fixture: `tests/eval/corpus/label-packs/twinrouterbench-weak/ci-fixture.jsonl`
 * (or generate from `tests/eval/corpus/twinrouterbench/ci-subset.json`).
 */

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
import {
  isTwinRouterBenchStaticTrack,
  parseTwinRouterBenchStaticTrack,
  type TwinRouterBenchStaticRecord,
  type TwinRouterBenchStaticTrack,
} from './eval/twinrouterbench-adapter.js';

/** Documented weak-label source id (not verifier-grade). */
export const TWINROUTERBENCH_WEAK_LABEL_SOURCE = 'twinrouterbench-weak' as const;

/**
 * Outcome signals that mark rows as weak tier proxies.
 * Calibration dry-run (SP-191) should exclude these from holdout ECE.
 */
export const TWINROUTERBENCH_WEAK_OUTCOME_SIGNALS = [
  'weak_tier_proxy',
  'exclude_from_holdout_ece',
] as const;

export class TwinRouterBenchWeakIngestError extends Error {
  override readonly name = 'TwinRouterBenchWeakIngestError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface TwinRouterBenchWeakIngestOptions {
  readonly limit?: number;
}

export interface TwinRouterBenchWeakIngestResult {
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

function isLabelPackTier(value: unknown): value is LabelPackTier {
  return value === 'zero-tier' || value === 'economical-cloud' || value === 'frontier-cloud';
}

/**
 * Weak binary label: cheap-path adequacy from verified target tier.
 * frontier-cloud → false (needs frontier); zero/economical → true.
 * Returns null when tier is missing (never invent).
 */
export function weakSuccessFromTargetTier(tier: unknown): boolean | null {
  if (!isLabelPackTier(tier)) {
    return null;
  }
  return tier !== 'frontier-cloud';
}

/** Map turn_type → coarse tool-context / complexity hints (no text). */
function turnTypeHints(turnType: string): {
  hasTool: number;
  toolUse: number;
  reasoning: number;
} {
  const t = turnType.toLowerCase();
  if (t.includes('tool')) {
    return { hasTool: 1, toolUse: 0.85, reasoning: 0.5 };
  }
  if (t.includes('plan') || t.includes('reason')) {
    return { hasTool: 0, toolUse: 0.3, reasoning: 0.85 };
  }
  return { hasTool: 0, toolUse: 0.45, reasoning: 0.55 };
}

export function deriveWeakFeaturesFromStaticRecord(
  record: TwinRouterBenchStaticRecord,
): Record<string, number> {
  const tokens = record.prefix_token_estimate;
  const hints = turnTypeHints(record.turn_type);
  const economical =
    record.verified_target_tier === 'zero-tier' ||
    record.verified_target_tier === 'economical-cloud'
      ? 1
      : 0;

  return {
    prompt_length_norm: clamp01(tokens / 8_000),
    estimated_input_tokens_norm: clamp01(tokens / 4_000),
    triage_cyclomatic_score: clamp01((record.step_index + 1) / 20),
    requirement_reasoning: hints.reasoning,
    requirement_code_gen: record.benchmark_source === 'swe-bench-verified' ? 0.8 : 0.5,
    requirement_tool_use: hints.toolUse,
    has_tool_context: hints.hasTool,
    compaction_flag: 0,
    routing_latency_norm: 0,
    economical_tier: economical,
  };
}

/**
 * Convert one TwinRouterBench static record into a weak pack row.
 * Returns null when the tier label is unmappable.
 */
export function convertTwinRouterBenchStaticRecord(
  record: TwinRouterBenchStaticRecord,
): LabelPackRow | null {
  const success = weakSuccessFromTargetTier(record.verified_target_tier);
  if (success === null) {
    return null;
  }

  const features = deriveWeakFeaturesFromStaticRecord(record);
  for (const name of P_SUCCESS_FEATURE_NAMES) {
    if (features[name] === undefined) {
      features[name] = 0;
    }
  }

  const candidate: LabelPackRow = {
    schema_version: LABEL_PACK_SCHEMA_VERSION,
    sample_id: `twinrouterbench-weak:${record.trace_id}`,
    source: TWINROUTERBENCH_WEAK_LABEL_SOURCE,
    features,
    success,
    tier: record.verified_target_tier,
    outcome_signals: [
      ...TWINROUTERBENCH_WEAK_OUTCOME_SIGNALS,
      `target_tier:${record.verified_target_tier}`,
      record.downgrade_cascade_verified
        ? 'downgrade_cascade_verified'
        : 'downgrade_cascade_unverified',
    ],
  };

  return parseLabelPackRow(candidate, `twinrouterbench-weak:${record.trace_id}`);
}

/** Convert a parsed static track document into weak pack rows. */
export function ingestTwinRouterBenchWeakTrack(
  track: TwinRouterBenchStaticTrack,
  options: TwinRouterBenchWeakIngestOptions = {},
): TwinRouterBenchWeakIngestResult {
  const rows: LabelPackRow[] = [];
  let skipped = 0;
  let limited = false;
  const limit = options.limit;

  for (const record of track.records) {
    if (limit !== undefined && rows.length >= limit) {
      limited = true;
      break;
    }
    const row = convertTwinRouterBenchStaticRecord(record);
    if (row === null) {
      skipped += 1;
      continue;
    }
    rows.push(row);
  }

  return { rows, accepted: rows.length, skipped, limited };
}

/**
 * Convert a flattened weak-label JSONL line (already privacy-safe features + tier).
 * Used by the tiny CI fixture that does not vendor TwinRouterBench prompts.
 */
export function convertTwinRouterBenchWeakFlatRow(
  raw: unknown,
  lineIndex: number,
): LabelPackRow | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const tier = raw.verified_target_tier ?? raw.tier;
  const success =
    typeof raw.success === 'boolean' ? raw.success : weakSuccessFromTargetTier(tier);
  if (success === null) {
    return null;
  }

  let features: Record<string, number> | null = null;
  if (isPlainObject(raw.features)) {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw.features)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      }
    }
    if (Object.keys(out).length > 0) {
      features = out;
    }
  }

  if (features === null) {
    // Minimal structural features from token estimate when present.
    const tokens =
      typeof raw.prefix_token_estimate === 'number' && Number.isFinite(raw.prefix_token_estimate)
        ? raw.prefix_token_estimate
        : null;
    if (tokens === null) {
      return null;
    }
    features = {
      prompt_length_norm: clamp01(tokens / 8_000),
      estimated_input_tokens_norm: clamp01(tokens / 4_000),
      triage_cyclomatic_score: 0.3,
      requirement_reasoning: 0.55,
      requirement_code_gen: 0.6,
      requirement_tool_use: 0.5,
      has_tool_context: 0,
      compaction_flag: 0,
      routing_latency_norm: 0,
      economical_tier: success ? 1 : 0,
    };
  }

  for (const name of P_SUCCESS_FEATURE_NAMES) {
    if (features[name] === undefined) {
      features[name] = 0;
    }
  }

  const sampleId =
    typeof raw.sample_id === 'string' && raw.sample_id.trim().length > 0
      ? raw.sample_id.trim()
      : typeof raw.trace_id === 'string' && raw.trace_id.trim().length > 0
        ? `twinrouterbench-weak:${raw.trace_id.trim()}`
        : `twinrouterbench-weak:line-${lineIndex + 1}`;

  const candidate: LabelPackRow = {
    schema_version: LABEL_PACK_SCHEMA_VERSION,
    sample_id: sampleId,
    source: TWINROUTERBENCH_WEAK_LABEL_SOURCE,
    features,
    success,
    ...(isLabelPackTier(tier) ? { tier } : {}),
    outcome_signals: [...TWINROUTERBENCH_WEAK_OUTCOME_SIGNALS],
  };

  return parseLabelPackRow(candidate, `twinrouterbench-weak-flat:${lineIndex + 1}`);
}

/** Ingest either a TwinRouterBench static-track JSON file or weak flat JSONL. */
export function ingestTwinRouterBenchWeakFile(
  inputPath: string,
  options: TwinRouterBenchWeakIngestOptions = {},
): TwinRouterBenchWeakIngestResult {
  const text = readFileSync(inputPath, 'utf8');
  const trimmed = text.trim();

  // Prefer a single-document static-track JSON when the whole file parses as one object.
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isTwinRouterBenchStaticTrack(parsed)) {
        const track = parseTwinRouterBenchStaticTrack(parsed);
        return ingestTwinRouterBenchWeakTrack(track, options);
      }
    } catch {
      // Multi-line JSONL also starts with `{` — fall through to line parser.
    }
  }

  // Flat JSONL weak fixture.
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
      const row = convertTwinRouterBenchWeakFlatRow(parsed, i);
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

export interface TwinRouterBenchWeakCliArgs {
  readonly input: string;
  readonly output?: string;
  readonly limit?: number;
  readonly help?: boolean;
}

export function parseTwinRouterBenchWeakIngestArgs(
  argv: readonly string[],
): TwinRouterBenchWeakCliArgs {
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
        throw new TwinRouterBenchWeakIngestError(
          `Invalid --limit ${argv[i]!}; expected positive integer`,
        );
      }
      limit = parsed;
    } else if (!arg.startsWith('-') && input === undefined) {
      input = arg;
    } else {
      throw new TwinRouterBenchWeakIngestError(`Unknown argument: ${arg}`);
    }
  }

  if (help) {
    return { input: input ?? '', help: true };
  }
  if (!input) {
    throw new TwinRouterBenchWeakIngestError('Missing --input path');
  }
  return {
    input,
    ...(output !== undefined ? { output } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export function twinRouterBenchWeakIngestUsage(): string {
  return `Usage: ingest-twinrouterbench-weak-labels --input track.json|weak.jsonl [--output pack.jsonl] [--limit N]

Converts TwinRouterBench static-track tier labels into **weak** privacy-safe label-pack JSONL.
Weakness: verified_target_tier is a routing-floor proxy ≠ verifier grade — exclude from holdout ECE.
Never copies prompt/prefix text (corpus uses hashes + token estimates only).
`;
}

export function runTwinRouterBenchWeakIngestCli(argv: readonly string[]): number {
  let args: TwinRouterBenchWeakCliArgs;
  try {
    args = parseTwinRouterBenchWeakIngestArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error(twinRouterBenchWeakIngestUsage());
    return 1;
  }

  if (args.help) {
    process.stdout.write(twinRouterBenchWeakIngestUsage());
    return 0;
  }

  const inputPath = resolve(args.input);
  const result = ingestTwinRouterBenchWeakFile(
    inputPath,
    args.limit !== undefined ? { limit: args.limit } : {},
  );
  const jsonl = formatLabelPackJsonl(result.rows);

  if (args.output) {
    writeFileSync(resolve(args.output), jsonl, 'utf8');
  } else {
    process.stdout.write(jsonl);
  }

  console.error(
    `ingest-twinrouterbench-weak-labels: accepted=${result.accepted} skipped=${result.skipped}` +
      (result.limited ? ' (limit reached)' : ''),
  );
  return 0;
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  process.argv[1]?.endsWith('ingest-twinrouterbench-weak-labels.ts') ||
  process.argv[1]?.endsWith('ingest-twinrouterbench-weak-labels.js');

if (isMain) {
  process.exitCode = runTwinRouterBenchWeakIngestCli(process.argv.slice(2));
}
