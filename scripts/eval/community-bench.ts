#!/usr/bin/env node
/**
 * Community bench CLI — SP-194 / SP-195 / GitHub #105.
 *
 * Offline smoke (vendored TwinRouterBench subset, no network):
 *
 *   npm run routing:community-bench -- \\
 *     --output /tmp/community-bench-report.json \\
 *     --email-file /tmp/community-bench-report.txt
 *
 * Optional Track C (vendored LLMRouterBench subset, no network):
 *
 *   npm run routing:community-bench -- --llmrouterbench
 *
 * Default corpus: tests/eval/corpus/twinrouterbench
 * Gates: config/release-gates.json via assert-release-gates helpers (thresholds unchanged).
 * No SMTP auto-send and no upload server.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  assertAbsoluteGates,
  assertBaselineRegression,
  loadBaselineMetricsFromVersion,
  loadReleaseGatesConfigFromFile,
  type AssertReleaseGatesResult,
  type HarnessGateMetrics,
} from './assert-release-gates.js';
import { buildSetupFingerprint } from './community-bench-fingerprint.js';
import {
  buildCommunityBenchReport,
  COMMUNITY_BENCH_MAINTAINER_CONTACT,
  formatCommunityBenchEmail,
  formatCommunityBenchIssueBody,
  formatMailtoHint,
  TRACK_B_SKIP_REASON_INCOMPLETE_LABELS,
  TRACK_B_SKIP_REASON_NOT_REQUESTED,
  TRACK_C_SKIP_REASON_NOT_REQUESTED,
  type CommunityBenchReport,
  type TrackBResult,
  type TrackCResult,
} from './community-bench-report.js';
import { loadDogfoodTrackBExport } from './dogfood-track-b-adapter.js';
import {
  aggregateHarnessMetrics,
  scoreFixtureHarness,
} from './harness-tracks.js';
import {
  buildLlmRouterBenchRegretReport,
  DEFAULT_LLMROUTERBENCH_SUBSET_PATH,
} from './llmrouterbench-regret-report.js';
import { runHarnessOnDir } from './run-harness.js';

export const DEFAULT_CORPUS_PATH = resolve('tests/eval/corpus/twinrouterbench');
export const DEFAULT_GATES_CONFIG = resolve('config/release-gates.json');
export const DEFAULT_JSON_OUTPUT = resolve('community-bench-report.json');
export const DEFAULT_EMAIL_OUTPUT = resolve('community-bench-report.txt');

/** Re-export maintainer contact so CLI footer / README parity tests share one constant. */
export { COMMUNITY_BENCH_MAINTAINER_CONTACT };

export interface CommunityBenchCliArgs {
  readonly output: string;
  readonly emailFile: string | null;
  readonly printIssueBody: boolean;
  readonly mailto: string | null;
  readonly corpusPath: string;
  readonly configPath: string;
  readonly modelsPath?: string;
  /** Path to labeled dogfood Track B export (#111). Incomplete → skip with reason. */
  readonly dogfoodExportPath: string | null;
  /** When true, run Track C offline on vendored LLMRouterBench subset. */
  readonly llmrouterbench: boolean;
  /** Optional override for Track C subset JSON (default: vendored ci-subset). */
  readonly llmrouterbenchSubsetPath: string;
  readonly help: boolean;
}

export interface TrackARunResult {
  readonly metrics: HarnessGateMetrics;
  readonly gates: AssertReleaseGatesResult;
}

/**
 * Run TwinRouterBench corpus through the harness and assert release gates
 * using the same helpers as `assert-release-gates` (thresholds unchanged).
 */
export function runTrackA(
  corpusPath: string,
  configPath: string = DEFAULT_GATES_CONFIG,
): TrackARunResult {
  const aggregate = runHarnessOnDir(corpusPath);
  const metrics: HarnessGateMetrics = {
    mean_capability_adequacy_rate: aggregate.tracks.capability.mean_capability_adequacy_rate,
    mean_quality_retention: aggregate.tracks.capability.mean_quality_retention,
    mean_over_routing_rate: aggregate.tracks.capability.mean_over_routing_rate,
    mean_pin_preserved_rate: aggregate.tracks.continuity.mean_pin_preserved_rate,
  };

  const config = loadReleaseGatesConfigFromFile(configPath);
  const absolute_gates = assertAbsoluteGates(metrics, config);

  let baseline_regression: AssertReleaseGatesResult['baseline_regression'];
  const baselineGates = config.baseline_regression;
  if (baselineGates) {
    const baselineMetrics = loadBaselineMetricsFromVersion(baselineGates.reference_version);
    baseline_regression = assertBaselineRegression(metrics, baselineMetrics, baselineGates);
  }

  const passed =
    absolute_gates.passed && (baseline_regression === undefined || baseline_regression.passed);

  const gates: AssertReleaseGatesResult = {
    passed,
    absolute_gates,
    ...(baseline_regression ? { baseline_regression } : {}),
  };

  return { metrics, gates };
}

/**
 * Assert release gates on harness metrics (same helpers as Track A; thresholds unchanged).
 */
export function assertGatesOnMetrics(
  metrics: HarnessGateMetrics,
  configPath: string = DEFAULT_GATES_CONFIG,
): AssertReleaseGatesResult {
  const config = loadReleaseGatesConfigFromFile(configPath);
  const absolute_gates = assertAbsoluteGates(metrics, config);

  let baseline_regression: AssertReleaseGatesResult['baseline_regression'];
  const baselineGates = config.baseline_regression;
  if (baselineGates) {
    const baselineMetrics = loadBaselineMetricsFromVersion(baselineGates.reference_version);
    baseline_regression = assertBaselineRegression(metrics, baselineMetrics, baselineGates);
  }

  const passed =
    absolute_gates.passed && (baseline_regression === undefined || baseline_regression.passed);

  return {
    passed,
    absolute_gates,
    ...(baseline_regression ? { baseline_regression } : {}),
  };
}

/**
 * Track B (#111 dogfood export→harness). Runs when export is valid and fully
 * labeled; skips with an explicit reason when missing/incomplete — never invents labels.
 */
export function resolveTrackB(
  dogfoodExportPath: string | null,
  configPath: string = DEFAULT_GATES_CONFIG,
): TrackBResult {
  if (!dogfoodExportPath) {
    return {
      status: 'skipped',
      reason: TRACK_B_SKIP_REASON_NOT_REQUESTED,
    };
  }

  const adapted = loadDogfoodTrackBExport(dogfoodExportPath);
  if (!adapted.ok) {
    const reason = adapted.reason.toLowerCase().includes('no dogfood labels invented')
      ? adapted.reason
      : `${TRACK_B_SKIP_REASON_INCOMPLETE_LABELS} (${adapted.reason})`;
    return {
      status: 'skipped',
      reason: `${reason} (requested --dogfood-export ${dogfoodExportPath})`,
    };
  }

  const results = adapted.fixtures.map((fixture) => scoreFixtureHarness(fixture));
  const aggregate = aggregateHarnessMetrics(results);
  const metrics: HarnessGateMetrics = {
    mean_capability_adequacy_rate: aggregate.tracks.capability.mean_capability_adequacy_rate,
    mean_quality_retention: aggregate.tracks.capability.mean_quality_retention,
    mean_over_routing_rate: aggregate.tracks.capability.mean_over_routing_rate,
    mean_pin_preserved_rate: aggregate.tracks.continuity.mean_pin_preserved_rate,
  };
  const gates = assertGatesOnMetrics(metrics, configPath);

  return {
    name: 'DogfoodExport',
    status: 'ran',
    export_path: dogfoodExportPath,
    record_count: adapted.record_count,
    fixture_count: adapted.fixtures.length,
    catalog_id: aggregate.catalog_id,
    checkpoint_date: aggregate.checkpoint_date,
    metrics,
    gates,
    passed: gates.passed,
  };
}

/**
 * Track C: optional offline LLMRouterBench regret/CS on the SP-192/SP-193
 * vendored subset. Never downloads the full HF corpus.
 */
export function resolveTrackC(options: {
  readonly enabled: boolean;
  readonly subsetPath?: string;
}): TrackCResult {
  if (!options.enabled) {
    return {
      status: 'skipped',
      reason: TRACK_C_SKIP_REASON_NOT_REQUESTED,
    };
  }

  const subsetPath = resolve(options.subsetPath ?? DEFAULT_LLMROUTERBENCH_SUBSET_PATH);
  const regret = buildLlmRouterBenchRegretReport({ subsetPath });
  return {
    name: 'LLMRouterBench',
    status: 'ran',
    subset_path: regret.subset_path,
    offline: true,
    downloads_corpus: false,
    fixture_count: regret.fixture_count,
    catalog_id: regret.catalog_id,
    checkpoint_date: regret.checkpoint_date,
    cumulative_regret_usd: regret.cumulative_regret_usd,
    mean_cost_savings_ratio: regret.mean_cost_savings_ratio,
    mean_quality_retention: regret.mean_quality_retention,
  };
}

/** Build the full community-bench report (fingerprint + Track A + optional B/C). */
export function runCommunityBench(options: {
  readonly corpusPath?: string;
  readonly configPath?: string;
  readonly modelsPath?: string;
  readonly dogfoodExportPath?: string | null;
  readonly llmrouterbench?: boolean;
  readonly llmrouterbenchSubsetPath?: string;
}): CommunityBenchReport {
  const corpusPath = options.corpusPath ?? DEFAULT_CORPUS_PATH;
  const configPath = options.configPath ?? DEFAULT_GATES_CONFIG;
  const fingerprint = buildSetupFingerprint({
    ...(options.modelsPath ? { modelsPath: options.modelsPath } : {}),
  });
  const { metrics, gates } = runTrackA(corpusPath, configPath);
  const trackB = resolveTrackB(options.dogfoodExportPath ?? null, configPath);
  const trackC = resolveTrackC({
    enabled: options.llmrouterbench ?? false,
    ...(options.llmrouterbenchSubsetPath
      ? { subsetPath: options.llmrouterbenchSubsetPath }
      : {}),
  });
  return buildCommunityBenchReport({
    fingerprint,
    corpusPath,
    metrics,
    gates,
    trackB,
    trackC,
  });
}

/** Parse CLI argv for community-bench (exported for unit tests). */
export function parseCommunityBenchArgs(argv: readonly string[]): CommunityBenchCliArgs {
  let output = DEFAULT_JSON_OUTPUT;
  let emailFile: string | null = DEFAULT_EMAIL_OUTPUT;
  let printIssueBody = false;
  let mailto: string | null = null;
  let corpusPath = DEFAULT_CORPUS_PATH;
  let configPath = DEFAULT_GATES_CONFIG;
  let modelsPath: string | undefined;
  let dogfoodExportPath: string | null = null;
  let llmrouterbench = false;
  let llmrouterbenchSubsetPath = DEFAULT_LLMROUTERBENCH_SUBSET_PATH;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      output = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--email-file' && argv[i + 1]) {
      emailFile = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--no-email-file') {
      emailFile = null;
    } else if (arg === '--print-issue-body') {
      printIssueBody = true;
    } else if (arg === '--mailto' && argv[i + 1]) {
      mailto = argv[i + 1]!;
      i += 1;
    } else if (arg === '--corpus' && argv[i + 1]) {
      corpusPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--config' && argv[i + 1]) {
      configPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--models' && argv[i + 1]) {
      modelsPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--dogfood-export' && argv[i + 1]) {
      dogfoodExportPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--llmrouterbench' || arg === '--full') {
      llmrouterbench = true;
    } else if (arg === '--llmrouterbench-subset' && argv[i + 1]) {
      llmrouterbenchSubsetPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return {
    output,
    emailFile,
    printIssueBody,
    mailto,
    corpusPath,
    configPath,
    ...(modelsPath ? { modelsPath } : {}),
    dogfoodExportPath,
    llmrouterbench,
    llmrouterbenchSubsetPath,
    help,
  };
}

export function usage(): string {
  return `Usage: community-bench [options]

Privacy-safe community bench report (Track A required; Track B/C optional).
Writes community-bench-report.json and an email-ready .txt. No SMTP / no upload.

Offline smoke (vendored TwinRouterBench corpus, no network):
  npm run routing:community-bench -- \\
    --output /tmp/community-bench-report.json \\
    --email-file /tmp/community-bench-report.txt

Optional Track C (vendored LLMRouterBench subset, no network / no full HF download):
  npm run routing:community-bench -- --llmrouterbench

Options:
  --output PATH              JSON report path (default: ./community-bench-report.json)
  --email-file PATH          Email .txt path (default: ./community-bench-report.txt)
  --no-email-file            Skip writing the .txt artifact
  --print-issue-body         Print GitHub issue body to stdout
  --mailto ADDRESS           Print mailto: hint URL (does not send; .txt is source of truth)
  --corpus DIR               TwinRouterBench corpus dir (default: tests/eval/corpus/twinrouterbench)
  --config PATH              Release gates config (default: config/release-gates.json)
  --models PATH              Fleet models.yaml for fingerprint (default: config/models.yaml[.example])
  --dogfood-export PATH      Track B: labeled dogfood export (runs when valid; skips if incomplete — no invented labels)
  --llmrouterbench, --full   Track C: offline regret/CS on vendored LLMRouterBench subset
  --llmrouterbench-subset P  Track C subset JSON (default: tests/eval/corpus/llmrouterbench/ci-subset.json)
  --help, -h                 Show this help

Maintainer contact: ${COMMUNITY_BENCH_MAINTAINER_CONTACT}
Contribute: see README "Contribute a community bench report".`;
}

function writeFileEnsuringDir(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

/** Write report artifacts; returns paths written. */
export function writeCommunityBenchArtifacts(
  report: CommunityBenchReport,
  options: {
    readonly output: string;
    readonly emailFile: string | null;
  },
): { readonly jsonPath: string; readonly emailPath: string | null } {
  writeFileEnsuringDir(options.output, `${JSON.stringify(report, null, 2)}\n`);
  let emailPath: string | null = null;
  if (options.emailFile) {
    writeFileEnsuringDir(options.emailFile, formatCommunityBenchEmail(report));
    emailPath = options.emailFile;
  }
  return { jsonPath: options.output, emailPath };
}

async function main(): Promise<void> {
  const args = parseCommunityBenchArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const report = runCommunityBench({
    corpusPath: args.corpusPath,
    configPath: args.configPath,
    ...(args.modelsPath ? { modelsPath: args.modelsPath } : {}),
    dogfoodExportPath: args.dogfoodExportPath,
    llmrouterbench: args.llmrouterbench,
    llmrouterbenchSubsetPath: args.llmrouterbenchSubsetPath,
  });

  const written = writeCommunityBenchArtifacts(report, {
    output: args.output,
    emailFile: args.emailFile,
  });

  console.log(`community-bench: wrote ${written.jsonPath}`);
  if (written.emailPath) {
    console.log(`community-bench: wrote ${written.emailPath}`);
  }
  console.log(`community-bench: Track A ${report.tracks.A.passed ? 'PASS' : 'FAIL'}`);
  if (report.tracks.B?.status === 'ran') {
    console.log(
      `community-bench: Track B ran (records=${report.tracks.B.record_count}, fixtures=${report.tracks.B.fixture_count}) ${report.tracks.B.passed ? 'PASS' : 'FAIL'}`,
    );
  } else if (report.tracks.B?.status === 'skipped') {
    console.log(`community-bench: Track B SKIPPED — ${report.tracks.B.reason}`);
  }
  if (report.tracks.C?.status === 'ran') {
    console.log(
      `community-bench: Track C ran offline (fixtures=${report.tracks.C.fixture_count}, regret_usd=${report.tracks.C.cumulative_regret_usd})`,
    );
  } else if (report.tracks.C?.status === 'skipped') {
    console.log(`community-bench: Track C SKIPPED — ${report.tracks.C.reason}`);
  }
  console.log(`community-bench: overall ${report.overall_passed ? 'PASS' : 'FAIL'}`);
  console.log(`community-bench: maintainer contact: ${COMMUNITY_BENCH_MAINTAINER_CONTACT}`);

  if (args.printIssueBody) {
    console.log('--- issue body ---');
    console.log(formatCommunityBenchIssueBody(report));
  }

  if (args.mailto) {
    console.log(`community-bench: mailto hint (not sent): ${formatMailtoHint(report, args.mailto)}`);
  }

  // Report pass/fail in output; exit 0 so contributors always get artifacts (like --report-only).
  process.exit(0);
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
  process.argv[1]?.endsWith('community-bench.ts');

if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
