#!/usr/bin/env node
/**
 * TwinRouterBench CI corpus over-routing breakdown — SP-202, GitHub #112.
 *
 * Scores the vendored static-track corpus (or any fixture / static-track JSON)
 * and breaks over-routing into stage (turn_type) / reason_code / min_tier /
 * selected tier. Offline only — does not edit absolute release gates or move
 * the corpus into hard `release:functional-smoke`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  cheapestModelForTier,
  tierRank,
  type EvalTier,
  type EvalTraceFixture,
} from './fixture-schema.js';
import {
  aggregateHarnessMetrics,
  scoreFixtureHarness,
  type HarnessAggregateMetrics,
} from './harness-tracks.js';
import {
  isTwinRouterBenchStaticTrack,
  loadEvalFixtureDocument,
  parseTwinRouterBenchStaticTrack,
  type TwinRouterBenchStaticTrack,
} from './twinrouterbench-adapter.js';

/** Default vendored TwinRouterBench CI corpus directory (ci-subset.json). */
export const DEFAULT_TWINROUTERBENCH_CORPUS_PATH = resolve(
  'tests/eval/corpus/twinrouterbench/ci-subset.json',
);

/** Absolute gate max cited by soft-report (#95 / #112); not loaded from config. */
export const ARCHIVED_OVER_ROUTING_RATE_MAX = 0.15 as const;

export const OVERROUTING_ANALYSIS_VERSION = '1.0.0' as const;

export interface CountBucket {
  readonly key: string;
  readonly count: number;
  readonly share_of_over_routing: number;
}

export interface OverRoutingStepRow {
  readonly fixture_id: string;
  readonly step_index: number;
  readonly stage: string;
  readonly reason_code: string;
  readonly min_tier: EvalTier;
  readonly selected_tier: EvalTier;
  readonly over_routed: boolean;
}

export interface SoftReportArchive {
  /** mean_over_routing_rate from harness aggregate (matches corpus soft-report). */
  readonly mean_over_routing_rate: number;
  readonly absolute_max: typeof ARCHIVED_OVER_ROUTING_RATE_MAX;
  readonly exceeds_absolute_max: boolean;
  readonly fixture_count: number;
  readonly step_count: number;
  readonly over_routing_steps: number;
  /** Step-weighted rate (over_routing_steps / step_count). */
  readonly step_over_routing_rate: number;
}

export interface OverRoutingAnalysis {
  readonly analysis_version: typeof OVERROUTING_ANALYSIS_VERSION;
  readonly source: 'twinrouterbench';
  readonly corpus_path: string;
  readonly offline: true;
  readonly soft_report: SoftReportArchive;
  readonly by_stage: readonly CountBucket[];
  readonly by_reason_code: readonly CountBucket[];
  readonly by_min_tier: readonly CountBucket[];
  readonly by_selected_tier: readonly CountBucket[];
  readonly by_min_to_selected: readonly CountBucket[];
  readonly by_benchmark_source: readonly CountBucket[];
  readonly steps?: readonly OverRoutingStepRow[];
}

export interface AnalyzeOverRoutingOptions {
  readonly corpusPath?: string;
  readonly includeSteps?: boolean;
}

function roundRate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function safeShare(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return roundRate(count / total);
}

function toSortedBuckets(counts: ReadonlyMap<string, number>, totalOver: number): CountBucket[] {
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      count,
      share_of_over_routing: safeShare(count, totalOver),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function isOverRouted(selected: EvalTier, minTier: EvalTier): boolean {
  return tierRank(selected) > tierRank(minTier);
}

/** Collect over-routing step rows from validated eval fixtures. */
export function collectOverRoutingSteps(
  fixtures: readonly EvalTraceFixture[],
): OverRoutingStepRow[] {
  const rows: OverRoutingStepRow[] = [];

  for (const fixture of fixtures) {
    for (const step of fixture.session.steps) {
      const overRouted = isOverRouted(step.actual.tier, step.step_outcome.min_tier);
      rows.push({
        fixture_id: fixture.fixture_id,
        step_index: step.step_index,
        stage: step.turn_type,
        reason_code: step.actual.reason_code,
        min_tier: step.step_outcome.min_tier,
        selected_tier: step.actual.tier,
        over_routed: overRouted,
      });
    }
  }

  return rows;
}

/**
 * Benchmark-source counts for TwinRouterBench static-track records that would
 * over-route under the adapter's resolved baseline (explicit or downgrade-first).
 */
export function collectBenchmarkSourceOverRouting(
  track: TwinRouterBenchStaticTrack,
): Map<string, number> {
  const counts = new Map<string, number>();
  const catalog = track.frozen_catalog;

  for (const record of track.records) {
    // Mirror twinrouterbench-adapter resolveBaselineRouting defaults.
    const selected: EvalTier =
      record.baseline_tier ?? cheapestModelForTier(catalog, 'economical-cloud').tier;

    if (isOverRouted(selected, record.verified_target_tier)) {
      bump(counts, record.benchmark_source);
    }
  }

  return counts;
}

/** Build a deterministic over-routing breakdown from fixtures (+ optional static track). */
export function buildOverRoutingAnalysis(
  fixtures: readonly EvalTraceFixture[],
  options: {
    readonly corpusPath: string;
    readonly includeSteps?: boolean;
    readonly staticTrack?: TwinRouterBenchStaticTrack;
    readonly aggregate?: HarnessAggregateMetrics;
  },
): OverRoutingAnalysis {
  const rows = collectOverRoutingSteps(fixtures);
  const overRows = rows.filter((r) => r.over_routed);
  const overCount = overRows.length;
  const stepCount = rows.length;

  const byStage = new Map<string, number>();
  const byReason = new Map<string, number>();
  const byMin = new Map<string, number>();
  const bySelected = new Map<string, number>();
  const byPair = new Map<string, number>();

  for (const row of overRows) {
    bump(byStage, row.stage);
    bump(byReason, row.reason_code);
    bump(byMin, row.min_tier);
    bump(bySelected, row.selected_tier);
    bump(byPair, `${row.min_tier}->${row.selected_tier}`);
  }

  const aggregate =
    options.aggregate ?? aggregateHarnessMetrics(fixtures.map((f) => scoreFixtureHarness(f)));

  const benchCounts = options.staticTrack
    ? collectBenchmarkSourceOverRouting(options.staticTrack)
    : new Map<string, number>();

  const meanOver = aggregate.tracks.capability.mean_over_routing_rate;

  return {
    analysis_version: OVERROUTING_ANALYSIS_VERSION,
    source: 'twinrouterbench',
    corpus_path: options.corpusPath,
    offline: true,
    soft_report: {
      mean_over_routing_rate: meanOver,
      absolute_max: ARCHIVED_OVER_ROUTING_RATE_MAX,
      exceeds_absolute_max: meanOver > ARCHIVED_OVER_ROUTING_RATE_MAX,
      fixture_count: aggregate.fixture_count,
      step_count: stepCount,
      over_routing_steps: overCount,
      step_over_routing_rate: safeShare(overCount, stepCount),
    },
    by_stage: toSortedBuckets(byStage, overCount),
    by_reason_code: toSortedBuckets(byReason, overCount),
    by_min_tier: toSortedBuckets(byMin, overCount),
    by_selected_tier: toSortedBuckets(bySelected, overCount),
    by_min_to_selected: toSortedBuckets(byPair, overCount),
    by_benchmark_source: toSortedBuckets(benchCounts, overCount),
    ...(options.includeSteps ? { steps: rows } : {}),
  };
}

/** Load corpus JSON and build the breakdown. */
export function analyzeTwinRouterBenchOverRouting(
  options: AnalyzeOverRoutingOptions = {},
): OverRoutingAnalysis {
  const corpusPath = resolve(options.corpusPath ?? DEFAULT_TWINROUTERBENCH_CORPUS_PATH);
  const raw = JSON.parse(readFileSync(corpusPath, 'utf8')) as unknown;
  const fixtures = loadEvalFixtureDocument(raw);
  const staticTrack = isTwinRouterBenchStaticTrack(raw)
    ? parseTwinRouterBenchStaticTrack(raw)
    : undefined;

  return buildOverRoutingAnalysis(fixtures, {
    corpusPath,
    includeSteps: options.includeSteps ?? false,
    ...(staticTrack ? { staticTrack } : {}),
  });
}

/** Compact JSON for CLI / unit-test assertions (deterministic field order). */
export function formatOverRoutingAnalysisJson(
  analysis: OverRoutingAnalysis,
): Record<string, unknown> {
  return {
    analysis_version: analysis.analysis_version,
    source: analysis.source,
    corpus_path: analysis.corpus_path,
    offline: analysis.offline,
    soft_report: { ...analysis.soft_report },
    by_stage: analysis.by_stage.map((b) => ({ ...b })),
    by_reason_code: analysis.by_reason_code.map((b) => ({ ...b })),
    by_min_tier: analysis.by_min_tier.map((b) => ({ ...b })),
    by_selected_tier: analysis.by_selected_tier.map((b) => ({ ...b })),
    by_min_to_selected: analysis.by_min_to_selected.map((b) => ({ ...b })),
    by_benchmark_source: analysis.by_benchmark_source.map((b) => ({ ...b })),
    ...(analysis.steps ? { steps: analysis.steps.map((s) => ({ ...s })) } : {}),
  };
}

/** Human-readable summary lines for smoke / authoring. */
export function formatOverRoutingAnalysisText(analysis: OverRoutingAnalysis): string {
  const sr = analysis.soft_report;
  const lines = [
    `TwinRouterBench over-routing analysis ${analysis.analysis_version}`,
    `corpus: ${analysis.corpus_path}`,
    `soft_report.mean_over_routing_rate: ${sr.mean_over_routing_rate} (absolute_max ${sr.absolute_max}; exceeds=${sr.exceeds_absolute_max})`,
    `steps: ${sr.over_routing_steps}/${sr.step_count} over-routed (step_rate ${sr.step_over_routing_rate}); fixtures=${sr.fixture_count}`,
    '',
    'by_stage (turn_type):',
    ...analysis.by_stage.map((b) => `  ${b.key}: ${b.count} (${b.share_of_over_routing})`),
    'by_reason_code:',
    ...analysis.by_reason_code.map((b) => `  ${b.key}: ${b.count} (${b.share_of_over_routing})`),
    'by_min_tier:',
    ...analysis.by_min_tier.map((b) => `  ${b.key}: ${b.count} (${b.share_of_over_routing})`),
    'by_selected_tier:',
    ...analysis.by_selected_tier.map((b) => `  ${b.key}: ${b.count} (${b.share_of_over_routing})`),
    'by_min_to_selected:',
    ...analysis.by_min_to_selected.map((b) => `  ${b.key}: ${b.count} (${b.share_of_over_routing})`),
  ];

  if (analysis.by_benchmark_source.length > 0) {
    lines.push('by_benchmark_source:');
    for (const b of analysis.by_benchmark_source) {
      lines.push(`  ${b.key}: ${b.count} (${b.share_of_over_routing})`);
    }
  }

  return lines.join('\n');
}

function parseArgs(argv: readonly string[]): AnalyzeOverRoutingOptions & {
  help?: boolean;
  text?: boolean;
} {
  let corpusPath = DEFAULT_TWINROUTERBENCH_CORPUS_PATH;
  let includeSteps = false;
  let text = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--corpus' || arg === '--fixtures') && argv[i + 1]) {
      corpusPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--include-steps') {
      includeSteps = true;
    } else if (arg === '--text') {
      text = true;
    } else if (arg === '--help' || arg === '-h') {
      return { corpusPath, includeSteps, text, help: true };
    }
  }

  return { corpusPath, includeSteps, text };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(`Usage: routing:analyze-overrouting [--corpus PATH] [--include-steps] [--text]

Break down TwinRouterBench over-routing by stage / reason_code / min_tier / selected tier.
Default corpus: tests/eval/corpus/twinrouterbench/ci-subset.json
Offline only — does not change absolute gates or harden corpus into release:functional-smoke.
Related: #112, soft-feed #95.`);
    process.exit(0);
  }

  const analysis = analyzeTwinRouterBenchOverRouting({
    ...(parsed.corpusPath !== undefined ? { corpusPath: parsed.corpusPath } : {}),
    ...(parsed.includeSteps ? { includeSteps: true } : {}),
  });

  if (parsed.text) {
    console.log(formatOverRoutingAnalysisText(analysis));
  } else {
    console.log(JSON.stringify(formatOverRoutingAnalysisJson(analysis), null, 2));
  }
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
  process.argv[1]?.endsWith('analyze-twinrouterbench-overrouting.ts');

if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
