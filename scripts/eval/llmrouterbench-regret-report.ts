#!/usr/bin/env node
/**
 * LLMRouterBench offline regret / cost-savings report — SP-193, GitHub #103.
 *
 * Loads the SP-192 pinned code/tool subset (TwinRouterBench static-track JSON)
 * and prints cumulative regret + cost-savings vs the frozen catalog. Reuses
 * counterfactual-replay / harness-tracks via run-harness loaders.
 *
 * Offline only — never downloads the full Hugging Face corpus. PR CI stays on
 * TwinRouterBench smoke (`routing:eval-harness:corpus-smoke`).
 */

import { resolve } from 'node:path';

import {
  aggregateHarnessMetrics,
  formatHarnessMetricsJson,
  type HarnessAggregateMetrics,
} from './harness-tracks.js';
import { runHarnessOnFile } from './run-harness.js';
import {
  CI_SUBSET_MAX_RECORDS,
  LLMROUTERBENCH_GIT_COMMIT,
  LLMROUTERBENCH_HF_REVISION,
} from './llmrouterbench-adapter.js';

/** Default vendored CI subset from SP-192. */
export const DEFAULT_LLMROUTERBENCH_SUBSET_PATH = resolve(
  'tests/eval/corpus/llmrouterbench/ci-subset.json',
);

export const LLMROUTERBENCH_REGRET_REPORT_VERSION = '1.0.0' as const;

export interface LlmRouterBenchRegretReport {
  readonly report_version: typeof LLMROUTERBENCH_REGRET_REPORT_VERSION;
  readonly source: 'llmrouterbench';
  readonly subset_path: string;
  readonly offline: true;
  readonly downloads_corpus: false;
  readonly hf_revision: typeof LLMROUTERBENCH_HF_REVISION;
  readonly git_commit: typeof LLMROUTERBENCH_GIT_COMMIT;
  readonly ci_subset_max_records: typeof CI_SUBSET_MAX_RECORDS;
  readonly catalog_id: string;
  readonly checkpoint_date: string;
  readonly fixture_count: number;
  readonly actual_total_cost_usd: number;
  readonly hindsight_optimal_total_cost_usd: number;
  readonly cumulative_regret_usd: number;
  readonly mean_cost_savings_ratio: number;
  readonly mean_cost_savings_vs_frontier: number;
  readonly mean_quality_retention: number;
  readonly harness: Record<string, unknown>;
}

export interface LlmRouterBenchRegretReportOptions {
  readonly subsetPath: string;
  readonly includeFixtures?: boolean;
}

/** Score the pinned LLMRouterBench subset and build a regret/CS summary. */
export function buildLlmRouterBenchRegretReport(
  options: Partial<LlmRouterBenchRegretReportOptions> = {},
): LlmRouterBenchRegretReport {
  const subsetPath = resolve(options.subsetPath ?? DEFAULT_LLMROUTERBENCH_SUBSET_PATH);
  const includeFixtures = options.includeFixtures ?? false;

  const fixtureResults = runHarnessOnFile(subsetPath);
  const aggregate: HarnessAggregateMetrics = aggregateHarnessMetrics(fixtureResults);
  const harnessJson = formatHarnessMetricsJson(aggregate, { includeFixtures });

  return {
    report_version: LLMROUTERBENCH_REGRET_REPORT_VERSION,
    source: 'llmrouterbench',
    subset_path: subsetPath,
    offline: true,
    downloads_corpus: false,
    hf_revision: LLMROUTERBENCH_HF_REVISION,
    git_commit: LLMROUTERBENCH_GIT_COMMIT,
    ci_subset_max_records: CI_SUBSET_MAX_RECORDS,
    catalog_id: aggregate.catalog_id,
    checkpoint_date: aggregate.checkpoint_date,
    fixture_count: aggregate.fixture_count,
    actual_total_cost_usd: aggregate.tracks.cost.total_actual_cost_usd,
    hindsight_optimal_total_cost_usd: aggregate.tracks.cost.total_hindsight_cost_usd,
    cumulative_regret_usd: aggregate.tracks.cost.total_cumulative_regret_usd,
    mean_cost_savings_ratio: aggregate.tracks.cost.mean_cost_savings_ratio,
    mean_cost_savings_vs_frontier: aggregate.tracks.cost.mean_cost_savings_vs_frontier,
    mean_quality_retention: aggregate.tracks.capability.mean_quality_retention,
    harness: harnessJson,
  };
}

/** Compact JSON for CLI / unit-test assertions (deterministic summary fields). */
export function formatLlmRouterBenchRegretReportJson(
  report: LlmRouterBenchRegretReport,
): Record<string, unknown> {
  return {
    report_version: report.report_version,
    source: report.source,
    subset_path: report.subset_path,
    offline: report.offline,
    downloads_corpus: report.downloads_corpus,
    hf_revision: report.hf_revision,
    git_commit: report.git_commit,
    ci_subset_max_records: report.ci_subset_max_records,
    catalog_id: report.catalog_id,
    checkpoint_date: report.checkpoint_date,
    fixture_count: report.fixture_count,
    actual_total_cost_usd: report.actual_total_cost_usd,
    hindsight_optimal_total_cost_usd: report.hindsight_optimal_total_cost_usd,
    cumulative_regret_usd: report.cumulative_regret_usd,
    mean_cost_savings_ratio: report.mean_cost_savings_ratio,
    mean_cost_savings_vs_frontier: report.mean_cost_savings_vs_frontier,
    mean_quality_retention: report.mean_quality_retention,
    harness: report.harness,
  };
}

function parseArgs(argv: readonly string[]): LlmRouterBenchRegretReportOptions & {
  help?: boolean;
} {
  let subsetPath = DEFAULT_LLMROUTERBENCH_SUBSET_PATH;
  let includeFixtures = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--subset' && argv[i + 1]) {
      subsetPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--include-fixtures') {
      includeFixtures = true;
    } else if (arg === '--help' || arg === '-h') {
      return { subsetPath, includeFixtures, help: true };
    }
  }

  return { subsetPath, includeFixtures };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(`Usage: routing:llmrouterbench-regret [--subset PATH] [--include-fixtures]

Offline regret / cost-savings report on the SP-192 LLMRouterBench code/tool subset.
Uses the frozen catalog embedded in the subset JSON — never invents model costs.
Does not download the full HF corpus. PR CI stays on TwinRouterBench smoke.`);
    process.exit(0);
  }

  const report = buildLlmRouterBenchRegretReport({
    subsetPath: parsed.subsetPath,
    ...(parsed.includeFixtures ? { includeFixtures: true } : {}),
  });
  console.log(JSON.stringify(formatLlmRouterBenchRegretReportJson(report), null, 2));
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
  process.argv[1]?.endsWith('llmrouterbench-regret-report.ts');

if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
