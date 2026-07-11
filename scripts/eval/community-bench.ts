#!/usr/bin/env node
/**
 * Community bench CLI — SP-194 / GitHub #105 Track A.
 *
 * Offline smoke (vendored TwinRouterBench subset, no network):
 *
 *   npm run routing:community-bench -- \\
 *     --output /tmp/community-bench-report.json \\
 *     --email-file /tmp/community-bench-report.txt
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
  formatCommunityBenchEmail,
  formatCommunityBenchIssueBody,
  formatMailtoHint,
  type CommunityBenchReport,
} from './community-bench-report.js';
import { runHarnessOnDir } from './run-harness.js';

export const DEFAULT_CORPUS_PATH = resolve('tests/eval/corpus/twinrouterbench');
export const DEFAULT_GATES_CONFIG = resolve('config/release-gates.json');
export const DEFAULT_JSON_OUTPUT = resolve('community-bench-report.json');
export const DEFAULT_EMAIL_OUTPUT = resolve('community-bench-report.txt');

export interface CommunityBenchCliArgs {
  readonly output: string;
  readonly emailFile: string | null;
  readonly printIssueBody: boolean;
  readonly mailto: string | null;
  readonly corpusPath: string;
  readonly configPath: string;
  readonly modelsPath?: string;
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

/** Build the full community-bench report (fingerprint + Track A). */
export function runCommunityBench(options: {
  readonly corpusPath?: string;
  readonly configPath?: string;
  readonly modelsPath?: string;
}): CommunityBenchReport {
  const corpusPath = options.corpusPath ?? DEFAULT_CORPUS_PATH;
  const configPath = options.configPath ?? DEFAULT_GATES_CONFIG;
  const fingerprint = buildSetupFingerprint({
    ...(options.modelsPath ? { modelsPath: options.modelsPath } : {}),
  });
  const { metrics, gates } = runTrackA(corpusPath, configPath);
  return buildCommunityBenchReport({
    fingerprint,
    corpusPath,
    metrics,
    gates,
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
    help,
  };
}

export function usage(): string {
  return `Usage: community-bench [options]

Privacy-safe community bench report (Track A: TwinRouterBench + release gates).
Writes community-bench-report.json and an email-ready .txt. No SMTP / no upload.

Offline smoke (vendored corpus, no network):
  npm run routing:community-bench -- \\
    --output /tmp/community-bench-report.json \\
    --email-file /tmp/community-bench-report.txt

Options:
  --output PATH         JSON report path (default: ./community-bench-report.json)
  --email-file PATH     Email .txt path (default: ./community-bench-report.txt)
  --no-email-file       Skip writing the .txt artifact
  --print-issue-body    Print GitHub issue body to stdout
  --mailto ADDRESS      Print mailto: hint URL (does not send; .txt is source of truth)
  --corpus DIR          TwinRouterBench corpus dir (default: tests/eval/corpus/twinrouterbench)
  --config PATH         Release gates config (default: config/release-gates.json)
  --models PATH         Fleet models.yaml for fingerprint (default: config/models.yaml[.example])
  --help, -h            Show this help

Track B (dogfood) and Track C (LLMRouterBench) are deferred to SP-195.`;
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
  console.log(`community-bench: overall ${report.overall_passed ? 'PASS' : 'FAIL'}`);

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
