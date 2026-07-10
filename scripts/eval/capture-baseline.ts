#!/usr/bin/env node
/**
 * Capture frozen harness aggregate metrics baseline — SP-168.
 *
 * Runs the eval harness on fixture traces and writes a versioned baseline JSON
 * for semver regression checks in assert-release-gates.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { formatHarnessMetricsJson } from './harness-tracks.js';
import { runHarnessOnDir } from './run-harness.js';

const DEFAULT_FIXTURES_DIR = resolve('tests/eval/fixtures');
const DEFAULT_BASELINES_DIR = resolve('tests/eval/baselines');

export interface CaptureBaselineOptions {
  readonly version: string;
  readonly fixturesDir?: string;
  readonly outputPath?: string;
}

/** Resolve default baseline output path for a semver version string. */
export function resolveBaselinePath(version: string, baselinesDir = DEFAULT_BASELINES_DIR): string {
  const normalized = version.startsWith('v') ? version.slice(1) : version;
  return resolve(baselinesDir, `v${normalized}.json`);
}

/** Capture harness aggregate metrics and return the baseline document. */
export function captureBaselineMetrics(options: CaptureBaselineOptions): Record<string, unknown> {
  const fixturesDir = options.fixturesDir ?? DEFAULT_FIXTURES_DIR;
  const aggregate = runHarnessOnDir(fixturesDir);
  const normalizedVersion = options.version.startsWith('v')
    ? options.version.slice(1)
    : options.version;

  return {
    baseline_version: normalizedVersion,
    captured_at: new Date().toISOString().slice(0, 10),
    ...formatHarnessMetricsJson(aggregate, { includeFixtures: false }),
  };
}

/** Capture baseline metrics and write JSON to disk. */
export function writeBaselineFile(options: CaptureBaselineOptions): string {
  const outputPath = options.outputPath ?? resolveBaselinePath(options.version);
  const document = captureBaselineMetrics(options);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  return outputPath;
}

interface ParsedCliArgs {
  readonly version?: string | undefined;
  readonly fixturesDir: string;
  readonly outputPath?: string | undefined;
  readonly help?: boolean;
}

function parseArgs(argv: readonly string[]): ParsedCliArgs {
  let version: string | undefined;
  let fixturesDir = DEFAULT_FIXTURES_DIR;
  let outputPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version' && argv[i + 1]) {
      version = argv[i + 1]!;
      i += 1;
    } else if (arg === '--fixtures' && argv[i + 1]) {
      fixturesDir = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--output' && argv[i + 1]) {
      outputPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      return { fixturesDir, help: true };
    }
  }

  return { version, fixturesDir, outputPath };
}

function usage(): void {
  console.error(`Usage: capture-baseline --version VERSION [--fixtures DIR] [--output PATH]

Runs the eval harness on fixtures and writes a frozen baseline JSON snapshot.
Default output: tests/eval/baselines/v{VERSION}.json`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    usage();
    process.exit(0);
  }

  if (!parsed.version) {
    usage();
    process.exit(1);
  }

  const outputPath = writeBaselineFile({
    version: parsed.version,
    fixturesDir: parsed.fixturesDir,
    ...(parsed.outputPath ? { outputPath: parsed.outputPath } : {}),
  });

  console.log(`capture-baseline: wrote ${outputPath}`);
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
  process.argv[1]?.endsWith('capture-baseline.ts');

if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
