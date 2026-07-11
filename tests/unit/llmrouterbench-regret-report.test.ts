import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildLlmRouterBenchRegretReport,
  formatLlmRouterBenchRegretReportJson,
  LLMROUTERBENCH_REGRET_REPORT_VERSION,
} from '../../scripts/eval/llmrouterbench-regret-report.js';
import {
  CI_SUBSET_MAX_RECORDS,
  LLMROUTERBENCH_GIT_COMMIT,
  LLMROUTERBENCH_HF_REVISION,
} from '../../scripts/eval/llmrouterbench-adapter.js';

const CI_SUBSET_PATH = join('tests', 'eval', 'corpus', 'llmrouterbench', 'ci-subset.json');

describe('llmrouterbench-regret-report (SP-193)', () => {
  it('builds a deterministic offline regret/CS summary on the CI subset', () => {
    const report = buildLlmRouterBenchRegretReport({ subsetPath: CI_SUBSET_PATH });
    const json = formatLlmRouterBenchRegretReportJson(report);

    expect(json.report_version).toBe(LLMROUTERBENCH_REGRET_REPORT_VERSION);
    expect(json.source).toBe('llmrouterbench');
    expect(json.offline).toBe(true);
    expect(json.downloads_corpus).toBe(false);
    expect(json.hf_revision).toBe(LLMROUTERBENCH_HF_REVISION);
    expect(json.git_commit).toBe(LLMROUTERBENCH_GIT_COMMIT);
    expect(json.ci_subset_max_records).toBe(CI_SUBSET_MAX_RECORDS);
    expect(json.catalog_id).toBe('pi-smart-router-v0.5.0-eval');
    expect(json.checkpoint_date).toBe('2026-07-01');
    expect(json.fixture_count).toBe(5);
    expect(typeof json.actual_total_cost_usd).toBe('number');
    expect(typeof json.hindsight_optimal_total_cost_usd).toBe('number');
    expect(typeof json.cumulative_regret_usd).toBe('number');
    expect(typeof json.mean_cost_savings_ratio).toBe('number');
    expect(typeof json.mean_cost_savings_vs_frontier).toBe('number');
    expect(typeof json.mean_quality_retention).toBe('number');
    expect(Number.isFinite(json.cumulative_regret_usd as number)).toBe(true);
    expect(Number.isFinite(json.mean_cost_savings_ratio as number)).toBe(true);
    expect(Number.isFinite(json.mean_cost_savings_vs_frontier as number)).toBe(true);
    expect((json.mean_cost_savings_ratio as number) >= 0).toBe(true);
  });

  it('is deterministic across repeated runs on the same fixture', () => {
    const a = formatLlmRouterBenchRegretReportJson(
      buildLlmRouterBenchRegretReport({ subsetPath: CI_SUBSET_PATH }),
    );
    const b = formatLlmRouterBenchRegretReportJson(
      buildLlmRouterBenchRegretReport({ subsetPath: CI_SUBSET_PATH }),
    );

    expect(a.cumulative_regret_usd).toBe(b.cumulative_regret_usd);
    expect(a.mean_cost_savings_ratio).toBe(b.mean_cost_savings_ratio);
    expect(a.mean_cost_savings_vs_frontier).toBe(b.mean_cost_savings_vs_frontier);
    expect(a.actual_total_cost_usd).toBe(b.actual_total_cost_usd);
    expect(a.hindsight_optimal_total_cost_usd).toBe(b.hindsight_optimal_total_cost_usd);
    expect(a.mean_quality_retention).toBe(b.mean_quality_retention);
    expect(a.fixture_count).toBe(b.fixture_count);
  });

  it('never claims corpus download and stays under CI subset max', () => {
    const report = buildLlmRouterBenchRegretReport({ subsetPath: CI_SUBSET_PATH });

    expect(report.downloads_corpus).toBe(false);
    expect(report.offline).toBe(true);
    expect(report.fixture_count).toBeLessThanOrEqual(CI_SUBSET_MAX_RECORDS);
  });
});
