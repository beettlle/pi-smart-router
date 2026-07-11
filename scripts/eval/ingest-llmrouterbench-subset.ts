#!/usr/bin/env node
/**
 * LLMRouterBench → static-track subset converter — SP-192, GitHub #103.
 *
 * Reads BaselineRecord-shaped JSONL (or a tiny synthetic sample) and writes
 * `TwinRouterBenchStaticTrack` JSON for frozen-catalog eval consumers.
 *
 * Offline / CI-safe: no network. Never invents scores or costs.
 * Skips chat-only datasets and unmappable models.
 * See `tests/eval/corpus/llmrouterbench/PROVENANCE.md`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CI_SUBSET_MAX_RECORDS,
  DEFAULT_LRB_FROZEN_CATALOG,
  LLMROUTERBENCH_GIT_COMMIT,
  LLMROUTERBENCH_HF_REVISION,
  UpstreamLrbRowSchema,
  buildTraceId,
  isChatOnlyDataset,
  isCodeToolDataset,
  mapBenchmarkSource,
  mapUpstreamModel,
  normalizeDatasetId,
  scoreIndicatesSuccess,
  turnTypeForDataset,
  type UpstreamLrbRow,
} from './llmrouterbench-adapter.js';
import {
  TWINROUTERBENCH_STATIC_SCHEMA_VERSION,
  loadTwinRouterBenchStaticTrack,
  type TwinRouterBenchStaticRecord,
  type TwinRouterBenchStaticTrack,
} from './twinrouterbench-adapter.js';
import type { FrozenCatalog } from './fixture-schema.js';

export {
  CI_SUBSET_MAX_RECORDS,
  DEFAULT_LRB_FROZEN_CATALOG,
  LLMROUTERBENCH_GIT_COMMIT,
  LLMROUTERBENCH_HF_REVISION,
  CODE_TOOL_DATASETS,
  CHAT_ONLY_DATASETS,
  UPSTREAM_MODEL_TO_CATALOG,
  isCodeToolDataset,
  isChatOnlyDataset,
  mapUpstreamModel,
  mapBenchmarkSource,
  normalizeDatasetId,
  type UpstreamLrbRow,
} from './llmrouterbench-adapter.js';

export type ConvertSkipReason =
  | 'non_code_tool_workload'
  | 'chat_only_workload'
  | 'unmappable_model'
  | 'invalid_score'
  | 'schema_invalid';

export class LLMRouterBenchIngestError extends Error {
  override readonly name = 'LLMRouterBenchIngestError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashSessionId(row: Pick<UpstreamLrbRow, 'dataset_id' | 'split' | 'record_index'>): string {
  const id = normalizeDatasetId(row.dataset_id);
  return sha256Hex(`lrb-session:${id}:${row.split}:${row.record_index}`);
}

export function hashPrefix(row: Pick<UpstreamLrbRow, 'origin_query' | 'prompt'>): string {
  const canonical = {
    origin_query: row.origin_query ?? '',
    prompt: row.prompt ?? '',
  };
  return sha256Hex(JSON.stringify(canonical));
}

export function estimatePrefixTokens(row: UpstreamLrbRow): number {
  if (row.prompt_tokens !== undefined && Number.isFinite(row.prompt_tokens)) {
    return row.prompt_tokens;
  }
  const chars = (row.origin_query ?? '').length + (row.prompt ?? '').length;
  return Math.ceil(chars / 4);
}

export interface ConvertedLrbRow {
  readonly record: TwinRouterBenchStaticRecord;
}

export interface ConvertLrbResult {
  readonly records: TwinRouterBenchStaticRecord[];
  readonly skipped: Array<{ line: number; reason: ConvertSkipReason; detail?: string }>;
  readonly parsed_rows: number;
}

/**
 * Convert a single validated upstream row into a static-track record.
 * Never invents score/cost; skips unmappable models.
 */
export function convertUpstreamRow(
  row: UpstreamLrbRow,
): { ok: true; draft: ConvertedLrbRow } | { ok: false; reason: ConvertSkipReason; detail?: string } {
  if (!Number.isFinite(row.score)) {
    return { ok: false, reason: 'invalid_score', detail: String(row.score) };
  }

  const mapped = mapUpstreamModel(row.model_name);
  if (!mapped) {
    return { ok: false, reason: 'unmappable_model', detail: row.model_name };
  }

  const success = scoreIndicatesSuccess(row.score);
  const isTool = turnTypeForDataset(row.dataset_id) === 'tool_result';

  const record: TwinRouterBenchStaticRecord = {
    trace_id: buildTraceId(row),
    session_id_hash: hashSessionId(row),
    step_index: 0,
    turn_type: turnTypeForDataset(row.dataset_id),
    prefix_hash: hashPrefix(row),
    prefix_token_estimate: estimatePrefixTokens(row),
    verified_target_tier: mapped.tier,
    verified_target_model_id: mapped.model_id,
    verified_tool_progression: success && isTool,
    downgrade_cascade_verified: success,
    benchmark_source: mapBenchmarkSource(row.dataset_id),
  };

  return { ok: true, draft: { record } };
}

export interface ParseJsonlOptions {
  readonly limit?: number;
  readonly failOnSchemaMismatch?: boolean;
  /** When true (CI default path), keep code/tool datasets only. */
  readonly preferCodeTool?: boolean;
}

/**
 * Parse LLMRouterBench JSONL into static-track records.
 * Schema-invalid lines fail by default; unmappable / chat-only rows are skipped.
 */
export function convertLrbJsonl(
  jsonlText: string,
  options: ParseJsonlOptions = {},
): ConvertLrbResult {
  const failOnSchemaMismatch = options.failOnSchemaMismatch !== false;
  const limit = options.limit;
  const preferCodeTool = options.preferCodeTool === true;
  const lines = jsonlText.split(/\r?\n/);
  const drafts: ConvertedLrbRow[] = [];
  const skipped: ConvertLrbResult['skipped'] = [];
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
        throw new LLMRouterBenchIngestError(
          `Schema mismatch at line ${i + 1}: invalid JSON (${detail})`,
        );
      }
      skipped.push({ line: i + 1, reason: 'schema_invalid', detail });
      continue;
    }

    const parsed = UpstreamLrbRowSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ');
      if (failOnSchemaMismatch) {
        throw new LLMRouterBenchIngestError(`Schema mismatch at line ${i + 1}: ${detail}`);
      }
      skipped.push({ line: i + 1, reason: 'schema_invalid', detail });
      continue;
    }

    parsedRows += 1;
    const row = parsed.data;

    if (preferCodeTool) {
      if (isChatOnlyDataset(row.dataset_id) || !isCodeToolDataset(row.dataset_id)) {
        skipped.push({
          line: i + 1,
          reason: isChatOnlyDataset(row.dataset_id) ? 'chat_only_workload' : 'non_code_tool_workload',
          detail: row.dataset_id,
        });
        continue;
      }
    }

    const converted = convertUpstreamRow(row);
    if (!converted.ok) {
      skipped.push({
        line: i + 1,
        reason: converted.reason,
        ...(converted.detail ? { detail: converted.detail } : {}),
      });
      continue;
    }

    drafts.push(converted.draft);
    if (limit !== undefined && drafts.length >= limit) {
      break;
    }
  }

  if (parsedRows === 0 && skipped.length === 0) {
    throw new LLMRouterBenchIngestError('Empty LLMRouterBench input (no JSONL rows)');
  }

  const limited = limit !== undefined ? drafts.slice(0, limit) : drafts;
  return {
    records: limited.map((d) => d.record),
    skipped,
    parsed_rows: parsedRows,
  };
}

/** Build a full TwinRouterBench-compatible static-track document. */
export function ingestLrbToStaticTrack(
  jsonlText: string,
  options: ParseJsonlOptions & { frozenCatalog?: FrozenCatalog } = {},
): TwinRouterBenchStaticTrack {
  const { frozenCatalog = DEFAULT_LRB_FROZEN_CATALOG, ...parseOpts } = options;
  const result = convertLrbJsonl(jsonlText, parseOpts);
  if (result.records.length === 0) {
    throw new LLMRouterBenchIngestError(
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
        throw new LLMRouterBenchIngestError(`Invalid --limit ${argv[i + 1]!}; expected positive integer`);
      }
      limit = n;
      i += 1;
    } else if (arg === '--prefer-code-tool') {
      preferCodeTool = true;
    } else {
      throw new LLMRouterBenchIngestError(`Unknown argument: ${arg}`);
    }
  }

  return { inputPath, outputPath, limit, preferCodeTool, help };
}

export function ingestCliUsage(): string {
  return `Usage: ingest-llmrouterbench-subset --input rows.jsonl --output static-track.json [--limit N] [--prefer-code-tool]

Converts LLMRouterBench BaselineRecord JSONL (HF pin ${LLMROUTERBENCH_HF_REVISION},
git schema ${LLMROUTERBENCH_GIT_COMMIT}) into TwinRouterBenchStaticTrack JSON.
Skips unmappable models and (with --prefer-code-tool) non-code/tool / chat-only datasets.
Never invents scores or costs. CI subset bound: ≤${CI_SUBSET_MAX_RECORDS} records.
See tests/eval/corpus/llmrouterbench/PROVENANCE.md.`;
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
    track = ingestLrbToStaticTrack(jsonlText, {
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
      ...(parsed.preferCodeTool ? { preferCodeTool: true } : {}),
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  loadTwinRouterBenchStaticTrack(track);
  writeFileSync(parsed.outputPath, `${JSON.stringify(track, null, 2)}\n`, 'utf8');
  console.log(
    `ingest-llmrouterbench-subset: wrote ${track.records.length} record(s) → ${parsed.outputPath}`,
  );
  return 0;
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  process.argv[1]?.endsWith('ingest-llmrouterbench-subset.ts') ||
  process.argv[1]?.endsWith('ingest-llmrouterbench-subset.js');

if (isMain) {
  process.exitCode = runIngestCli(process.argv.slice(2));
}
