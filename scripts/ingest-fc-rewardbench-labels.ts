#!/usr/bin/env node
/**
 * FC-RewardBench tool-call correct/incorrect → privacy-safe label-pack JSONL — SP-190, GitHub #102.
 *
 * Accepts offline JSONL preference pairs (`chosen_output` / `rejected_output`) or flattened
 * rows with an explicit binary label. Never copies conversation / tools / call text into the
 * pack. Skips unmappable rows; never invents outcomes.
 *
 * Upstream pins: see `tests/eval/corpus/label-packs/PROVENANCE.md`.
 * CI uses the tiny synthetic fixture under `tests/eval/corpus/label-packs/fc-rewardbench/`.
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

/** Pinned HF revision for ibm-research/fc-reward-bench (documented in PROVENANCE.md). */
export const FC_REWARDBENCH_PINNED_REVISION =
  '269929c3329e603e87ed3203de42896cc03ddbf3' as const;

export const FC_REWARDBENCH_LABEL_SOURCE = 'fc-rewardbench' as const;

export class FcRewardBenchIngestError extends Error {
  override readonly name = 'FcRewardBenchIngestError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface FcRewardBenchIngestOptions {
  readonly limit?: number;
  readonly defaultTier?: LabelPackTier;
}

export interface FcRewardBenchIngestResult {
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

function hashSampleId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

/** JSON-serialize for length stats only — never retained in pack output. */
function serializedLength(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === 'string') {
    return value.length;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function conversationCharStats(conversation: unknown): {
  chars: number;
  turns: number;
} {
  if (!Array.isArray(conversation)) {
    return { chars: 0, turns: 0 };
  }
  let chars = 0;
  for (const entry of conversation) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const content = entry.content;
    if (typeof content === 'string') {
      chars += content.length;
    } else {
      chars += serializedLength(content);
    }
  }
  return { chars, turns: conversation.length };
}

/**
 * Derive privacy-safe numeric features from an FC-RewardBench-style row.
 * Prefers precomputed `features`; otherwise length/count stats only (no text retained).
 */
export function deriveFcRewardBenchFeatures(
  record: Record<string, unknown>,
  arm: 'chosen' | 'rejected' | 'flat',
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

  const { chars, turns } = conversationCharStats(record.conversation);
  const toolCount = Array.isArray(record.tools) ? record.tools.length : 0;

  let callChars = 0;
  if (arm === 'chosen') {
    callChars = serializedLength(record.chosen_output);
  } else if (arm === 'rejected') {
    callChars = serializedLength(record.rejected_output);
  } else {
    callChars =
      serializedLength(record.chosen_output) ||
      serializedLength(record.rejected_output) ||
      serializedLength(record.tool_call) ||
      serializedLength(record.output);
  }

  // Need at least some structural signal to map.
  if (chars === 0 && toolCount === 0 && callChars === 0) {
    return null;
  }

  const totalChars = chars + callChars;
  // Only emit allowlisted P(success) feature keys (taint pattern rejects
  // names containing tool_call / content / prompt substrings).
  return {
    prompt_length_norm: clamp01(chars / 4_000),
    estimated_input_tokens_norm: clamp01(totalChars / 4 / 1_500),
    triage_cyclomatic_score: clamp01((toolCount + turns + callChars / 500) / 20),
    requirement_reasoning: 0.55,
    requirement_code_gen: 0.35,
    requirement_tool_use: clamp01(0.7 + toolCount / 20),
    has_tool_context: toolCount > 0 || callChars > 0 ? 1 : 0,
    compaction_flag: 0,
    routing_latency_norm: 0,
    economical_tier: 1,
  };
}

/** Extract binary correct/incorrect label from a flattened row; null when missing. */
export function extractFcRewardBenchSuccess(
  record: Record<string, unknown>,
): boolean | null {
  if (typeof record.success === 'boolean') {
    return record.success;
  }
  if (typeof record.correct === 'boolean') {
    return record.correct;
  }
  if (typeof record.label === 'string') {
    const label = record.label.trim().toLowerCase();
    if (label === 'correct' || label === 'chosen' || label === 'positive') {
      return true;
    }
    if (label === 'incorrect' || label === 'rejected' || label === 'negative') {
      return false;
    }
  }
  return null;
}

function optionalTier(record: Record<string, unknown>): LabelPackTier | undefined {
  const tier = record.tier;
  if (tier === 'zero-tier' || tier === 'economical-cloud' || tier === 'frontier-cloud') {
    return tier;
  }
  return undefined;
}

function stableSampleId(
  record: Record<string, unknown>,
  lineIndex: number,
  arm: 'chosen' | 'rejected' | 'flat',
): string {
  if (typeof record.sample_id === 'string' && record.sample_id.trim().length > 0) {
    const base = record.sample_id.trim();
    return arm === 'flat' ? base : `${base}:${arm}`;
  }
  if (typeof record.test_id === 'string' && record.test_id.trim().length > 0) {
    return `fc-rewardbench:${record.test_id.trim()}:${arm}`;
  }
  const meta = JSON.stringify({
    i: lineIndex,
    arm,
    test_category:
      typeof record.test_category === 'string' ? record.test_category : undefined,
    error_type: typeof record.error_type === 'string' ? record.error_type : undefined,
  });
  return `fc-rewardbench:${hashSampleId(meta)}`;
}

function buildPackRow(
  record: Record<string, unknown>,
  lineIndex: number,
  arm: 'chosen' | 'rejected' | 'flat',
  success: boolean,
  options: FcRewardBenchIngestOptions,
): LabelPackRow | null {
  const features = deriveFcRewardBenchFeatures(record, arm);
  if (features === null) {
    return null;
  }

  for (const name of P_SUCCESS_FEATURE_NAMES) {
    if (features[name] === undefined) {
      features[name] = 0;
    }
  }

  const outcomeSignals: string[] =
    arm === 'chosen'
      ? ['tool_call_correct']
      : arm === 'rejected'
        ? [
            'tool_call_incorrect',
            ...(typeof record.error_type === 'string' && record.error_type.trim().length > 0
              ? [`error_type:${record.error_type.trim().slice(0, 64)}`]
              : []),
          ]
        : [success ? 'tool_call_correct' : 'tool_call_incorrect'];

  const candidate: LabelPackRow = {
    schema_version: LABEL_PACK_SCHEMA_VERSION,
    sample_id: stableSampleId(record, lineIndex, arm),
    source: FC_REWARDBENCH_LABEL_SOURCE,
    features,
    success,
    tier: optionalTier(record) ?? options.defaultTier,
    outcome_signals: outcomeSignals,
  };

  return parseLabelPackRow(candidate, `fc-rewardbench:${lineIndex + 1}:${arm}`);
}

/**
 * Convert one upstream FC-RewardBench-style row into zero or more label-pack rows.
 * Preference pairs emit chosen (success) + rejected (failure). Flattened labeled rows
 * emit a single row. Returns [] when unmappable (never invents labels).
 */
export function convertFcRewardBenchRow(
  raw: unknown,
  lineIndex: number,
  options: FcRewardBenchIngestOptions = {},
): LabelPackRow[] {
  if (!isPlainObject(raw)) {
    return [];
  }

  const hasChosen = raw.chosen_output !== undefined && raw.chosen_output !== null;
  const hasRejected = raw.rejected_output !== undefined && raw.rejected_output !== null;

  if (hasChosen || hasRejected) {
    const out: LabelPackRow[] = [];
    if (hasChosen) {
      const chosen = buildPackRow(raw, lineIndex, 'chosen', true, options);
      if (chosen !== null) {
        out.push(chosen);
      }
    }
    if (hasRejected) {
      const rejected = buildPackRow(raw, lineIndex, 'rejected', false, options);
      if (rejected !== null) {
        out.push(rejected);
      }
    }
    return out;
  }

  const success = extractFcRewardBenchSuccess(raw);
  if (success === null) {
    return [];
  }

  const flat = buildPackRow(raw, lineIndex, 'flat', success, options);
  return flat === null ? [] : [flat];
}

/** Convert FC-RewardBench-style JSONL text into validated label-pack rows. */
export function ingestFcRewardBenchJsonl(
  text: string,
  options: FcRewardBenchIngestOptions = {},
): FcRewardBenchIngestResult {
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
      const converted = convertFcRewardBenchRow(parsed, i, options);
      if (converted.length === 0) {
        skipped += 1;
        continue;
      }
      for (const row of converted) {
        if (limit !== undefined && rows.length >= limit) {
          limited = true;
          break;
        }
        rows.push(row);
      }
      if (limited) {
        break;
      }
    } catch {
      skipped += 1;
    }
  }

  return { rows, accepted: rows.length, skipped, limited };
}

export function ingestFcRewardBenchFile(
  inputPath: string,
  options: FcRewardBenchIngestOptions = {},
): FcRewardBenchIngestResult {
  const text = readFileSync(inputPath, 'utf8');
  return ingestFcRewardBenchJsonl(text, options);
}

export interface FcRewardBenchCliArgs {
  readonly input: string;
  readonly output?: string;
  readonly limit?: number;
  readonly help?: boolean;
}

export function parseFcRewardBenchIngestArgs(argv: readonly string[]): FcRewardBenchCliArgs {
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
        throw new FcRewardBenchIngestError(
          `Invalid --limit ${argv[i]!}; expected positive integer`,
        );
      }
      limit = parsed;
    } else if (!arg.startsWith('-') && input === undefined) {
      input = arg;
    } else {
      throw new FcRewardBenchIngestError(`Unknown argument: ${arg}`);
    }
  }

  if (help) {
    return { input: input ?? '', help: true };
  }
  if (!input) {
    throw new FcRewardBenchIngestError('Missing --input path');
  }
  return {
    input,
    ...(output !== undefined ? { output } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export function fcRewardBenchIngestUsage(): string {
  return `Usage: ingest-fc-rewardbench-labels --input pairs.jsonl [--output pack.jsonl] [--limit N]

Converts FC-RewardBench tool-call correct/incorrect pairs into privacy-safe label-pack JSONL.
Preference pairs emit two rows (chosen=success, rejected=failure). Skips unmappable rows;
never invents outcomes; never writes conversation/tools/call text.
Pin: ibm-research/fc-reward-bench @ ${FC_REWARDBENCH_PINNED_REVISION}.
`;
}

export function runFcRewardBenchIngestCli(argv: readonly string[]): number {
  let args: FcRewardBenchCliArgs;
  try {
    args = parseFcRewardBenchIngestArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error(fcRewardBenchIngestUsage());
    return 1;
  }

  if (args.help) {
    process.stdout.write(fcRewardBenchIngestUsage());
    return 0;
  }

  const inputPath = resolve(args.input);
  const result = ingestFcRewardBenchFile(
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
    `ingest-fc-rewardbench-labels: accepted=${result.accepted} skipped=${result.skipped}` +
      (result.limited ? ' (limit reached)' : ''),
  );
  return 0;
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  process.argv[1]?.endsWith('ingest-fc-rewardbench-labels.ts') ||
  process.argv[1]?.endsWith('ingest-fc-rewardbench-labels.js');

if (isMain) {
  process.exitCode = runFcRewardBenchIngestCli(process.argv.slice(2));
}
