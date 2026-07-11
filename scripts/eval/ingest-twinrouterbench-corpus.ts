#!/usr/bin/env node
/**
 * TwinRouterBench question_bank → static-track converter — SP-186, GitHub #101.
 *
 * Reads upstream `data/static/question_bank.jsonl` (or a tiny sample) and writes
 * `TwinRouterBenchStaticTrack` JSON for `scripts/eval/twinrouterbench-adapter.ts`.
 *
 * Offline / CI-safe: no network. Never invents verified tiers or scores.
 * See `tests/eval/corpus/twinrouterbench/PROVENANCE.md` for pin + tier map.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  TWINROUTERBENCH_STATIC_SCHEMA_VERSION,
  loadTwinRouterBenchStaticTrack,
  type TwinRouterBenchBenchmarkSource,
  type TwinRouterBenchStaticRecord,
  type TwinRouterBenchStaticTrack,
} from './twinrouterbench-adapter.js';
import type { EvalTier, FrozenCatalog } from './fixture-schema.js';

/** Pinned TwinRouterBench commit documented in PROVENANCE.md. */
export const TWINROUTERBENCH_PINNED_COMMIT =
  '430acecac71141de77afd8e5e13690d236d58e93' as const;

/**
 * Max records for the vendored CI subset (`tests/eval/corpus/twinrouterbench/ci-subset.json`).
 * Keep ≤50 so PR CI stays small; full corpus remains optional via converter without --limit.
 */
export const CI_SUBSET_MAX_RECORDS = 50 as const;

/**
 * Upstream `benchmark` values treated as code/tool workloads for CI subset selection.
 * Chat-only / summarization (e.g. mtrag, qmsum) are skipped when `--prefer-code-tool` is set.
 */
export const CODE_TOOL_BENCHMARKS: ReadonlySet<string> = new Set([
  'swebench',
  'bfcl',
  'pinchbench',
]);

/** Stable order for stratified CI subset quotas (insertion order of CODE_TOOL_BENCHMARKS). */
export const CODE_TOOL_BENCHMARK_ORDER: readonly string[] = [...CODE_TOOL_BENCHMARKS];

/** Upstream public tiers → our EvalTier (4→3 collapse; see PROVENANCE.md). */
export const UPSTREAM_TIER_TO_EVAL_TIER: Readonly<Record<string, EvalTier>> = {
  low: 'zero-tier',
  mid: 'economical-cloud',
  mid_high: 'frontier-cloud',
  high: 'frontier-cloud',
};

/** Upstream target_tier_id must match PUBLIC_TIERS order (0..3). */
export const UPSTREAM_TIER_TO_ID: Readonly<Record<string, number>> = {
  low: 0,
  mid: 1,
  mid_high: 2,
  high: 3,
};

/** Default frozen catalog — same IDs as SP-153 TwinRouterBench sample fixtures. */
export const DEFAULT_TRB_FROZEN_CATALOG: FrozenCatalog = {
  catalog_id: 'pi-smart-router-v0.5.0-eval',
  checkpoint_date: '2026-07-01',
  models: [
    {
      model_id: 'ollama/llama3.2:3b',
      tier: 'zero-tier',
      cost_per_1m_input_usd: 0,
      capability_score: 0.35,
    },
    {
      model_id: 'gpt-4o-mini',
      tier: 'economical-cloud',
      cost_per_1m_input_usd: 0.15,
      capability_score: 0.72,
    },
    {
      model_id: 'claude-sonnet-4',
      tier: 'frontier-cloud',
      cost_per_1m_input_usd: 3.0,
      capability_score: 0.95,
    },
  ],
};

const MODEL_ID_FOR_TIER: Readonly<Record<EvalTier, string>> = {
  'zero-tier': 'ollama/llama3.2:3b',
  'economical-cloud': 'gpt-4o-mini',
  'frontier-cloud': 'claude-sonnet-4',
};

const UpstreamTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const UpstreamMessageSchema = z.object({
  role: z.string().min(1),
  content: z
    .union([z.string(), z.null(), z.array(z.unknown())])
    .optional(),
});

/** Flatten upstream message content (string or multimodal text parts) to a single string. */
export function flattenMessageContent(
  content: string | null | undefined | readonly unknown[],
): string {
  if (content === null || content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  const parts: string[] = [];
  for (const part of content) {
    const parsed = UpstreamTextPartSchema.safeParse(part);
    if (parsed.success) {
      parts.push(parsed.data.text);
    } else if (typeof part === 'string') {
      parts.push(part);
    }
  }
  return parts.join('\n');
}

/** Minimal upstream question_bank row schema (required conversion fields). */
export const UpstreamQuestionBankRowSchema = z.object({
  id: z.string().min(1),
  instance_id: z.string().min(1),
  step_index: z.number().int(),
  messages: z.array(UpstreamMessageSchema).min(1),
  target_tier: z.string().min(1),
  target_tier_id: z.number().int().optional(),
  benchmark: z.string().min(1),
  scenario: z.string().optional(),
  pipeline_stage: z.string().min(1),
});

export type UpstreamQuestionBankRow = z.infer<typeof UpstreamQuestionBankRowSchema>;

export class TwinRouterBenchIngestError extends Error {
  override readonly name = 'TwinRouterBenchIngestError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * Split `limit` across code/tool benchmarks for a diversified CI subset.
 * Remainder goes to earlier benchmarks in {@link CODE_TOOL_BENCHMARK_ORDER}.
 */
export function allocateCodeToolQuotas(limit: number): ReadonlyMap<string, number> {
  if (limit < 1) {
    throw new TwinRouterBenchIngestError(`Invalid quota limit ${limit}; expected positive integer`);
  }
  const benches = CODE_TOOL_BENCHMARK_ORDER;
  const base = Math.floor(limit / benches.length);
  const rem = limit % benches.length;
  const map = new Map<string, number>();
  for (let i = 0; i < benches.length; i++) {
    map.set(benches[i]!, base + (i < rem ? 1 : 0));
  }
  return map;
}

export type ConvertSkipReason =
  | 'unmappable_tier'
  | 'tier_id_mismatch'
  | 'unsupported_pipeline_stage'
  | 'schema_invalid'
  | 'non_code_tool_workload';

/** True when upstream row is a code/tool workload (SWE-bench / BFCL / agent-like). */
export function isCodeToolWorkload(
  row: Pick<UpstreamQuestionBankRow, 'benchmark'> | { benchmark: string },
): boolean {
  return CODE_TOOL_BENCHMARKS.has(row.benchmark);
}

export interface ConvertedQuestionBankRow {
  readonly record: TwinRouterBenchStaticRecord;
  /** Upstream step_index before 0-based reindex within session. */
  readonly upstream_step_index: number;
  readonly instance_id: string;
  /** Message roles for turn_type after reindex. */
  readonly message_roles: readonly string[];
}

export interface ConvertQuestionBankResult {
  readonly records: TwinRouterBenchStaticRecord[];
  readonly skipped: Array<{ line: number; reason: ConvertSkipReason; detail?: string }>;
  readonly parsed_rows: number;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Session hash from instance_id (see PROVENANCE.md). */
export function hashSessionId(instanceId: string): string {
  return sha256Hex(`trb-session:${instanceId}`);
}

/** Prefix hash from messages (roles + content only). */
export function hashPrefixMessages(
  messages: ReadonlyArray<{ role: string; content?: string | null | undefined | readonly unknown[] }>,
): string {
  const canonical = messages.map((m) => ({
    role: m.role,
    content: flattenMessageContent(m.content),
  }));
  return sha256Hex(JSON.stringify(canonical));
}

export function estimatePrefixTokens(
  messages: ReadonlyArray<{ role: string; content?: string | null | undefined | readonly unknown[] }>,
): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.role.length + flattenMessageContent(m.content).length;
  }
  return Math.ceil(chars / 4);
}

export function mapBenchmarkSource(benchmark: string): TwinRouterBenchBenchmarkSource {
  if (benchmark === 'swebench') {
    return 'swe-bench-verified';
  }
  return 'custom';
}

export function mapUpstreamTier(targetTier: string): EvalTier | undefined {
  return UPSTREAM_TIER_TO_EVAL_TIER[targetTier];
}

export function verificationFlagsForPipelineStage(pipelineStage: string):
  | { downgrade_cascade_verified: boolean; verified_tool_progression: boolean }
  | undefined {
  switch (pipelineStage) {
    case 'ground_truth_ready':
    case 'mixed_model_validated':
      return { downgrade_cascade_verified: true, verified_tool_progression: true };
    case 'degradation_search_done':
      return { downgrade_cascade_verified: true, verified_tool_progression: false };
    default:
      return undefined;
  }
}

export function inferTurnType(
  messages: ReadonlyArray<{ role: string }>,
  reindexedStep: number,
): string {
  if (reindexedStep === 0) {
    return 'main_loop';
  }
  const last = messages[messages.length - 1];
  if (last?.role === 'tool' || messages.some((m) => m.role === 'tool')) {
    return 'tool_result';
  }
  return 'main_loop';
}

/**
 * Convert a single validated upstream row into a static-track record draft
 * (step_index still upstream-ordered; caller reindexes per session).
 */
export function convertUpstreamRow(
  row: UpstreamQuestionBankRow,
): { ok: true; draft: ConvertedQuestionBankRow } | { ok: false; reason: ConvertSkipReason; detail?: string } {
  const evalTier = mapUpstreamTier(row.target_tier);
  if (!evalTier) {
    return { ok: false, reason: 'unmappable_tier', detail: row.target_tier };
  }

  const expectedId = UPSTREAM_TIER_TO_ID[row.target_tier];
  if (
    row.target_tier_id !== undefined &&
    expectedId !== undefined &&
    row.target_tier_id !== expectedId
  ) {
    return {
      ok: false,
      reason: 'tier_id_mismatch',
      detail: `target_tier=${row.target_tier} target_tier_id=${row.target_tier_id}`,
    };
  }

  const flags = verificationFlagsForPipelineStage(row.pipeline_stage);
  if (!flags) {
    return {
      ok: false,
      reason: 'unsupported_pipeline_stage',
      detail: row.pipeline_stage,
    };
  }

  const sessionIdHash = hashSessionId(row.instance_id);
  const prefixHash = hashPrefixMessages(row.messages);
  const prefixTokenEstimate = estimatePrefixTokens(row.messages);
  const messageRoles = row.messages.map((m) => m.role);

  const record: TwinRouterBenchStaticRecord = {
    trace_id: row.id,
    session_id_hash: sessionIdHash,
    // Placeholder; reindexed in assembleStaticTrack.
    step_index: row.step_index,
    turn_type: inferTurnType(
      messageRoles.map((role) => ({ role })),
      0,
    ),
    prefix_hash: prefixHash,
    prefix_token_estimate: prefixTokenEstimate,
    verified_target_tier: evalTier,
    verified_target_model_id: MODEL_ID_FOR_TIER[evalTier],
    verified_tool_progression: flags.verified_tool_progression,
    downgrade_cascade_verified: flags.downgrade_cascade_verified,
    benchmark_source: mapBenchmarkSource(row.benchmark),
  };

  return {
    ok: true,
    draft: {
      record,
      upstream_step_index: row.step_index,
      instance_id: row.instance_id,
      message_roles: messageRoles,
    },
  };
}

/**
 * Group drafts by session, sort by upstream step_index, reindex to contiguous 0..n-1.
 */
export function assembleStaticTrack(
  drafts: readonly ConvertedQuestionBankRow[],
  frozenCatalog: FrozenCatalog = DEFAULT_TRB_FROZEN_CATALOG,
): TwinRouterBenchStaticTrack {
  if (drafts.length === 0) {
    throw new TwinRouterBenchIngestError(
      'No convertible rows: cannot build TwinRouterBench static track (need ≥1 record)',
    );
  }

  const bySession = new Map<string, ConvertedQuestionBankRow[]>();
  for (const draft of drafts) {
    const key = draft.record.session_id_hash;
    const group = bySession.get(key) ?? [];
    group.push(draft);
    bySession.set(key, group);
  }

  const records: TwinRouterBenchStaticRecord[] = [];

  for (const group of bySession.values()) {
    const sorted = [...group].sort((a, b) => a.upstream_step_index - b.upstream_step_index);
    for (let i = 0; i < sorted.length; i++) {
      const draft = sorted[i]!;
      const turnType = inferTurnType(
        draft.message_roles.map((role) => ({ role })),
        i,
      );
      records.push({
        ...draft.record,
        step_index: i,
        turn_type: turnType,
      });
    }
  }

  return {
    schema_version: TWINROUTERBENCH_STATIC_SCHEMA_VERSION,
    track: 'static',
    frozen_catalog: frozenCatalog,
    records,
  };
}

export interface ParseJsonlOptions {
  /** Max successfully converted drafts to keep (before assemble). */
  readonly limit?: number;
  /** When true, first schema-invalid line throws (default). */
  readonly failOnSchemaMismatch?: boolean;
  /**
   * When true, skip chat-only / non-code benchmarks (mtrag, qmsum, …) and keep
   * swebench / bfcl / pinchbench only — used for CI subset selection.
   */
  readonly preferCodeTool?: boolean;
}

/**
 * Parse question_bank JSONL text into convertible drafts.
 * Schema-invalid lines fail by default; unmappable rows are skipped.
 */
export function convertQuestionBankJsonl(
  jsonlText: string,
  options: ParseJsonlOptions = {},
): ConvertQuestionBankResult {
  const failOnSchemaMismatch = options.failOnSchemaMismatch !== false;
  const limit = options.limit;
  const preferCodeTool = options.preferCodeTool === true;
  const codeToolQuotas =
    preferCodeTool && limit !== undefined ? allocateCodeToolQuotas(limit) : undefined;
  const codeToolTaken = new Map<string, number>();
  const lines = jsonlText.split(/\r?\n/);
  const drafts: ConvertedQuestionBankRow[] = [];
  const skipped: ConvertQuestionBankResult['skipped'] = [];
  let parsedRows = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0) {
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (failOnSchemaMismatch) {
        throw new TwinRouterBenchIngestError(
          `Schema mismatch at line ${i + 1}: invalid JSON (${detail})`,
        );
      }
      skipped.push({ line: i + 1, reason: 'schema_invalid', detail });
      continue;
    }

    const parsed = UpstreamQuestionBankRowSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ');
      if (failOnSchemaMismatch) {
        throw new TwinRouterBenchIngestError(
          `Schema mismatch at line ${i + 1}: ${detail}`,
        );
      }
      skipped.push({ line: i + 1, reason: 'schema_invalid', detail });
      continue;
    }

    parsedRows += 1;

    if (preferCodeTool && !isCodeToolWorkload(parsed.data)) {
      skipped.push({
        line: i + 1,
        reason: 'non_code_tool_workload',
        detail: parsed.data.benchmark,
      });
      continue;
    }

    if (codeToolQuotas) {
      const bench = parsed.data.benchmark;
      const quota = codeToolQuotas.get(bench) ?? 0;
      const taken = codeToolTaken.get(bench) ?? 0;
      if (taken >= quota) {
        continue;
      }
    }

    const converted = convertUpstreamRow(parsed.data);
    if (!converted.ok) {
      skipped.push({
        line: i + 1,
        reason: converted.reason,
        ...(converted.detail ? { detail: converted.detail } : {}),
      });
      continue;
    }

    drafts.push(converted.draft);
    if (codeToolQuotas) {
      const bench = parsed.data.benchmark;
      codeToolTaken.set(bench, (codeToolTaken.get(bench) ?? 0) + 1);
    }
    if (limit !== undefined && drafts.length >= limit) {
      break;
    }
  }

  if (parsedRows === 0 && skipped.length === 0) {
    throw new TwinRouterBenchIngestError('Empty question_bank input (no JSONL rows)');
  }

  const limited = limit !== undefined ? drafts.slice(0, limit) : drafts;
  const records =
    limited.length === 0 ? [] : assembleStaticTrack(limited).records;

  return { records, skipped, parsed_rows: parsedRows };
}

/** Build a full static-track document from JSONL text. */
export function ingestQuestionBankToStaticTrack(
  jsonlText: string,
  options: ParseJsonlOptions & { frozenCatalog?: FrozenCatalog } = {},
): TwinRouterBenchStaticTrack {
  const { frozenCatalog = DEFAULT_TRB_FROZEN_CATALOG, ...parseOpts } = options;
  const result = convertQuestionBankJsonl(jsonlText, parseOpts);
  if (result.records.length === 0) {
    throw new TwinRouterBenchIngestError(
      `No convertible rows after filtering (${result.skipped.length} skipped, ${result.parsed_rows} parsed)`,
    );
  }
  return {
    schema_version: TWINROUTERBENCH_STATIC_SCHEMA_VERSION,
    track: 'static',
    frozen_catalog: frozenCatalog,
    records: result.records,
  };
}

export interface IngestCliArgs {
  readonly inputPath?: string | undefined;
  readonly outputPath?: string | undefined;
  readonly limit?: number | undefined;
  readonly preferCodeTool?: boolean | undefined;
  readonly help?: boolean | undefined;
}

export function parseIngestCliArgs(argv: readonly string[]): IngestCliArgs {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let limit: number | undefined;
  let preferCodeTool = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--input' && argv[i + 1]) {
      inputPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--output' && argv[i + 1]) {
      outputPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--limit' && argv[i + 1]) {
      const n = Number.parseInt(argv[i + 1]!, 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new TwinRouterBenchIngestError(`Invalid --limit ${argv[i + 1]!}; expected positive integer`);
      }
      limit = n;
      i += 1;
    } else if (arg === '--prefer-code-tool') {
      preferCodeTool = true;
    } else {
      throw new TwinRouterBenchIngestError(`Unknown argument: ${arg}`);
    }
  }

  return { inputPath, outputPath, limit, preferCodeTool, help };
}

export function ingestCliUsage(): string {
  return `Usage: ingest-twinrouterbench-corpus --input question_bank.jsonl --output static-track.json [--limit N] [--prefer-code-tool]

Converts TwinRouterBench upstream JSONL (pin ${TWINROUTERBENCH_PINNED_COMMIT}) into
TwinRouterBenchStaticTrack JSON. Skips unmappable tiers; fails on schema mismatch.
--prefer-code-tool keeps swebench/bfcl/pinchbench only (CI subset selection).
CI subset bound: ≤${CI_SUBSET_MAX_RECORDS} records (see PROVENANCE.md).
See tests/eval/corpus/twinrouterbench/PROVENANCE.md.`;
}

export function runIngestCli(argv: readonly string[]): number {
  let parsed: IngestCliArgs;
  try {
    parsed = parseIngestCliArgs(argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(ingestCliUsage());
    return 1;
  }

  if (parsed.help) {
    console.log(ingestCliUsage());
    return 0;
  }

  if (!parsed.inputPath || !parsed.outputPath) {
    console.error('Missing required --input and/or --output');
    console.error(ingestCliUsage());
    return 1;
  }

  const jsonlText = readFileSync(parsed.inputPath, 'utf8');
  let track: TwinRouterBenchStaticTrack;
  try {
    track = ingestQuestionBankToStaticTrack(jsonlText, {
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
      ...(parsed.preferCodeTool ? { preferCodeTool: true } : {}),
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  // Validate via adapter before write.
  loadTwinRouterBenchStaticTrack(track);

  writeFileSync(parsed.outputPath, `${JSON.stringify(track, null, 2)}\n`, 'utf8');
  console.log(
    `ingest-twinrouterbench-corpus: wrote ${track.records.length} record(s) → ${parsed.outputPath}`,
  );
  return 0;
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  process.argv[1]?.endsWith('ingest-twinrouterbench-corpus.ts') ||
  process.argv[1]?.endsWith('ingest-twinrouterbench-corpus.js');

if (isMain) {
  process.exitCode = runIngestCli(process.argv.slice(2));
}
