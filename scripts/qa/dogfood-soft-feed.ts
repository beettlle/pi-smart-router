#!/usr/bin/env node
/**
 * Dogfood export → release gates soft-feed (dry-run) — SP-266 / #95.
 *
 * Operator-facing wiring that attaches a privacy-safe dogfood Track B export
 * to the release gates WITHOUT editing config/release-gates.json or relaxing
 * frugality defaults:
 *
 *   dogfood Track B export (JSON)
 *     → adapt to eval harness fixtures (never invents labels — #111)
 *     → run three-track harness
 *     → assert absolute release gates in report-only mode (always exit 0)
 *
 * Exit codes:
 *   0 — gates evaluated (PASS or soft FAIL) or export SKIPPED (incomplete labels)
 *   1 — usage error / unreadable or non-JSON export / fixture write failure
 *
 * See docs/qa/shadow-dogfood-protocol.md § "Attach dogfood exports to release gates".
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertAbsoluteGates,
  assertReleaseGates,
  formatFailedGatesStderr,
  loadReleaseGatesConfigFromFile,
  type AssertReleaseGatesResult,
  type HarnessGateMetrics,
} from '../eval/assert-release-gates.js';
import { tryAdaptDogfoodTrackBExport } from '../eval/dogfood-track-b-adapter.js';
import { runHarnessOnDir } from '../eval/run-harness.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_CONFIG_PATH = resolve(PACKAGE_ROOT, 'config/release-gates.json');

interface ParsedArgs {
  readonly exportPath?: string | undefined;
  readonly outDir?: string | undefined;
  readonly configPath: string;
  readonly baselineVersion?: string | undefined;
  readonly help?: boolean;
}

/** Parse CLI argv (exported for unit tests). */
export function parseDogfoodSoftFeedArgs(argv: readonly string[]): ParsedArgs {
  let exportPath: string | undefined;
  let outDir: string | undefined;
  let configPath = DEFAULT_CONFIG_PATH;
  let baselineVersion: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--export' && argv[i + 1]) {
      exportPath = resolve(argv[i + 1]!);
      i++;
    } else if (arg === '--out' && argv[i + 1]) {
      outDir = resolve(argv[i + 1]!);
      i++;
    } else if (arg === '--config' && argv[i + 1]) {
      configPath = resolve(argv[i + 1]!);
      i++;
    } else if (arg === '--baseline-version' && argv[i + 1]) {
      baselineVersion = argv[i + 1]!;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { exportPath, outDir, configPath, baselineVersion, help };
}

function usage(): void {
  console.error(`Usage: qa:dogfood-soft-feed --export FILE [--out DIR] [--config PATH] [--baseline-version VERSION]

Attach a dogfood Track B export to the release gates as a soft-feed dry-run.
Always exits 0 on gate outcomes (PASS or soft FAIL); exits 1 only on operator
errors (missing export, invalid JSON). Incomplete exports SKIP with an explicit
reason — outcome labels are never invented (#111).

  --export FILE            Dogfood Track B export JSON (schema_version 1.0.0)
  --out DIR                Archive dir (default: .pi-smart-router/qa-runs/dogfood-soft-feed-<utc>/)
  --config PATH            Release gate config (default: config/release-gates.json)
  --baseline-version VER   Also assert baseline regression vs captured baseline (opt-in)`);
}

function utcTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function gateMetricsFromAggregate(fixturesDir: string): HarnessGateMetrics {
  const aggregate = runHarnessOnDir(fixturesDir);
  return {
    mean_capability_adequacy_rate: aggregate.tracks.capability.mean_capability_adequacy_rate,
    mean_quality_retention: aggregate.tracks.capability.mean_quality_retention,
    mean_over_routing_rate: aggregate.tracks.capability.mean_over_routing_rate,
    mean_pin_preserved_rate: aggregate.tracks.continuity.mean_pin_preserved_rate,
  };
}

function writeSummary(outDir: string, lines: readonly string[]): void {
  writeFileSync(resolve(outDir, 'SUMMARY.txt'), `${lines.join('\n')}\n`, 'utf8');
}

/** Run the soft-feed; returns process exit code (exported for unit tests). */
export function runDogfoodSoftFeed(parsed: ParsedArgs): number {
  if (!parsed.exportPath) {
    usage();
    return 1;
  }

  const outDir =
    parsed.outDir ?? resolve(PACKAGE_ROOT, `.pi-smart-router/qa-runs/dogfood-soft-feed-${utcTimestamp()}`);
  mkdirSync(outDir, { recursive: true });

  let rawText: string;
  try {
    rawText = readFileSync(parsed.exportPath, 'utf8');
  } catch (err) {
    console.error(`error: dogfood export unreadable at ${parsed.exportPath}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch (err) {
    console.error(`error: dogfood export is not valid JSON at ${parsed.exportPath}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const adapted = tryAdaptDogfoodTrackBExport(raw);
  if (!adapted.ok) {
    console.log(`dogfood-soft-feed: SKIP — ${adapted.reason}`);
    writeSummary(outDir, [
      `export=${parsed.exportPath}`,
      'result=SKIP',
      `reason=${adapted.reason}`,
      'note=incomplete outcome labels are never invented (#111); re-export with success_label, min_tier, min_model_id',
    ]);
    return 0;
  }

  const fixturesDir = resolve(outDir, 'fixtures');
  mkdirSync(fixturesDir, { recursive: true });
  for (const fixture of adapted.fixtures) {
    writeFileSync(
      resolve(fixturesDir, `${fixture.fixture_id}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
      'utf8',
    );
  }

  const metrics = gateMetricsFromAggregate(fixturesDir);

  let result: AssertReleaseGatesResult;
  if (parsed.baselineVersion) {
    result = assertReleaseGates({
      configPath: parsed.configPath,
      fixturesDir,
      baselineVersion: parsed.baselineVersion,
      reportOnly: true,
    });
  } else {
    const config = loadReleaseGatesConfigFromFile(parsed.configPath);
    const absolute_gates = assertAbsoluteGates(metrics, config);
    result = { passed: absolute_gates.passed, absolute_gates };
  }

  console.log(`dogfood-soft-feed: adapted ${adapted.record_count} records → ${adapted.fixtures.length} session fixtures`);
  console.log(`observed metrics: ${JSON.stringify(metrics)}`);

  if (result.passed) {
    console.log('release-gates: PASS (soft-feed dry-run; exit 0)');
  } else {
    console.log('release-gates: FAIL (soft-feed dry-run; exit 0)');
    console.log(formatFailedGatesStderr(result));
  }

  writeSummary(outDir, [
    `export=${parsed.exportPath}`,
    `records=${adapted.record_count}`,
    `fixtures=${adapted.fixtures.length}`,
    `metrics=${JSON.stringify(metrics)}`,
    `result=${result.passed ? 'PASS' : 'FAIL'}`,
    `config=${parsed.configPath}`,
    `baseline_version=${parsed.baselineVersion ?? 'none'}`,
    'note=soft-feed dry-run — does not edit release-gates.json or relax frugality defaults',
  ]);

  console.log(`archive: ${outDir}`);
  return 0;
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
  process.argv[1]?.endsWith('dogfood-soft-feed.ts');

if (isMain) {
  const parsed = parseDogfoodSoftFeedArgs(process.argv.slice(2));
  if (parsed.help) {
    usage();
    process.exit(0);
  }
  try {
    process.exit(runDogfoodSoftFeed(parsed));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
