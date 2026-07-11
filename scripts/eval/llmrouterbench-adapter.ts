/**
 * LLMRouterBench subset adapter — SP-192, GitHub #103.
 *
 * Thin helpers for mapping LLMRouterBench BaselineRecord-shaped rows onto the
 * TwinRouterBench static-track / frozen-catalog eval schema. Does not modify
 * twinrouterbench-adapter load paths (harness consumers stay unchanged).
 */

import { z } from 'zod';

import type { TwinRouterBenchBenchmarkSource } from './twinrouterbench-adapter.js';
import type { EvalTier, FrozenCatalog } from './fixture-schema.js';

/** Schema version for LLMRouterBench subset documents (maps into TwinRouterBench static). */
export const LLMROUTERBENCH_SUBSET_SCHEMA_VERSION = '1.0.0' as const;

/** Pinned Hugging Face dataset revision (PROVENANCE.md). */
export const LLMROUTERBENCH_HF_REVISION =
  '0e5af1b84bf73437a01a1849c0f1d2468baa93fc' as const;

/** Pinned GitHub commit for BaselineRecord schema / README. */
export const LLMROUTERBENCH_GIT_COMMIT =
  'c77cb0506949d8f959e97967d2fefca0e8ff1b05' as const;

/** Max records for the vendored CI subset. */
export const CI_SUBSET_MAX_RECORDS = 20 as const;

/**
 * Upstream dataset_id values treated as code/tool workloads.
 * Chat-only / math / knowledge / affective / ArenaHard are excluded.
 */
export const CODE_TOOL_DATASETS: ReadonlySet<string> = new Set([
  'humaneval',
  'mbpp',
  'livecodebench',
  'swe-bench',
  'swe_bench',
  'studenteval',
  'tau2',
  'tau-bench',
  'tau2-bench',
]);

/** Explicit chat-only / MT-Bench-style ids (always skipped when prefer-code-tool). */
export const CHAT_ONLY_DATASETS: ReadonlySet<string> = new Set([
  'mtbench',
  'mt-bench',
  'mt_bench',
  'arenahard',
  'arena-hard',
  'dailydialog',
  'emorynlp',
  'meld',
]);

/** Default frozen catalog — same IDs as TwinRouterBench / SP-153. */
export const DEFAULT_LRB_FROZEN_CATALOG: FrozenCatalog = {
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

/** Upstream model_name → frozen catalog model_id. Unlisted → unmappable (skip). */
export const UPSTREAM_MODEL_TO_CATALOG: Readonly<
  Record<string, { model_id: string; tier: EvalTier }>
> = {
  'Claude-sonnet-4': { model_id: 'claude-sonnet-4', tier: 'frontier-cloud' },
  'Claude-v4': { model_id: 'claude-sonnet-4', tier: 'frontier-cloud' },
  'claude-sonnet-4': { model_id: 'claude-sonnet-4', tier: 'frontier-cloud' },
  'gpt-4o-mini': { model_id: 'gpt-4o-mini', tier: 'economical-cloud' },
  'GPT-4o-mini': { model_id: 'gpt-4o-mini', tier: 'economical-cloud' },
  'Llama-3.1-8B-Instruct': { model_id: 'ollama/llama3.2:3b', tier: 'zero-tier' },
  'Llama-3.1-it': { model_id: 'ollama/llama3.2:3b', tier: 'zero-tier' },
  'ollama/llama3.2:3b': { model_id: 'ollama/llama3.2:3b', tier: 'zero-tier' },
};

/** Compact upstream BaselineRecord row (JSONL). */
export const UpstreamLrbRowSchema = z.object({
  dataset_id: z.string().min(1),
  split: z.string().min(1).default('test'),
  model_name: z.string().min(1),
  record_index: z.number().int().nonnegative(),
  origin_query: z.string().optional(),
  prompt: z.string().optional(),
  score: z.number(),
  cost: z.number().optional(),
  prompt_tokens: z.number().int().nonnegative().optional(),
  completion_tokens: z.number().int().nonnegative().optional(),
});

export type UpstreamLrbRow = z.infer<typeof UpstreamLrbRowSchema>;

export class LLMRouterBenchAdapterError extends Error {
  override readonly name = 'LLMRouterBenchAdapterError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Normalize dataset_id for set membership (lowercase, underscores). */
export function normalizeDatasetId(datasetId: string): string {
  return datasetId.trim().toLowerCase().replace(/\s+/g, '_');
}

/** True when dataset is an in-scope code or tool slice. */
export function isCodeToolDataset(datasetId: string): boolean {
  const id = normalizeDatasetId(datasetId);
  return CODE_TOOL_DATASETS.has(id);
}

/** True when dataset is explicitly chat-only / MT-Bench-style. */
export function isChatOnlyDataset(datasetId: string): boolean {
  const id = normalizeDatasetId(datasetId);
  return CHAT_ONLY_DATASETS.has(id);
}

/** Map upstream model_name to frozen catalog entry; undefined if unmappable. */
export function mapUpstreamModel(
  modelName: string,
): { model_id: string; tier: EvalTier } | undefined {
  return UPSTREAM_MODEL_TO_CATALOG[modelName];
}

/** Map dataset_id → TwinRouterBench benchmark_source enum. */
export function mapBenchmarkSource(datasetId: string): TwinRouterBenchBenchmarkSource {
  const id = normalizeDatasetId(datasetId);
  if (id === 'swe-bench' || id === 'swe_bench') {
    return 'swe-bench-verified';
  }
  return 'custom';
}

/** Tool-use datasets get tool_result turn_type; code stays main_loop. */
export function turnTypeForDataset(datasetId: string): string {
  const id = normalizeDatasetId(datasetId);
  if (id === 'tau2' || id === 'tau-bench' || id === 'tau2-bench') {
    return 'tool_result';
  }
  return 'main_loop';
}

/** Success threshold — upstream scores are typically 0/1; never invent. */
export function scoreIndicatesSuccess(score: number): boolean {
  return Number.isFinite(score) && score >= 0.5;
}

export function buildTraceId(row: UpstreamLrbRow): string {
  const id = normalizeDatasetId(row.dataset_id);
  return `lrb:${id}:${row.split}:${row.record_index}:${row.model_name}`;
}
