#!/usr/bin/env node
/**
 * Three-track eval harness runner — SP-152, GitHub #79 (part 2).
 *
 * Orchestrates capability, cost, and continuity tracks on fixture traces and
 * prints aggregate metrics JSON for CI smoke and local comparison.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadEvalTraceFixture } from './fixture-schema.js';
import { loadEvalFixtureDocument } from './twinrouterbench-adapter.js';
import {
  aggregateHarnessMetrics,
  formatHarnessMetricsJson,
  scoreFixtureHarness,
  type FixtureHarnessResult,
  type HarnessAggregateMetrics,
} from './harness-tracks.js';

export interface RunHarnessOptions {
  readonly fixturesDir: string;
  readonly includeFixtures?: boolean;
}

function defaultFixturesDir(): string {
  return resolve('tests/eval/fixtures');
}

function collectFixtureFiles(dirPath: string): string[] {
  const abs = resolve(dirPath);
  const entries = readdirSync(abs, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(abs, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFixtureFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

/** Load and score every `.json` fixture in a directory (recursive). */
export function runHarnessOnDir(dirPath: string): HarnessAggregateMetrics {
  const files = collectFixtureFiles(dirPath);

  const results: FixtureHarnessResult[] = files.flatMap((filePath) => {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return loadEvalFixtureDocument(raw).map((fixture) => scoreFixtureHarness(fixture));
  });

  return aggregateHarnessMetrics(results);
}

/** Load and score a single fixture file. */
export function runHarnessOnFile(fixturePath: string): FixtureHarnessResult[] {
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
  return loadEvalFixtureDocument(raw).map((fixture) => scoreFixtureHarness(fixture));
}

export function runHarness(options: RunHarnessOptions): HarnessAggregateMetrics {
  return runHarnessOnDir(options.fixturesDir);
}

function parseArgs(argv: readonly string[]): RunHarnessOptions & { help?: boolean } {
  let fixturesDir = defaultFixturesDir();
  let includeFixtures = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixtures' && argv[i + 1]) {
      fixturesDir = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--summary-only') {
      includeFixtures = false;
    } else if (arg === '--help' || arg === '-h') {
      return { fixturesDir, includeFixtures, help: true };
    }
  }

  return { fixturesDir, includeFixtures };
}

function printHarnessMetrics(aggregate: HarnessAggregateMetrics, includeFixtures: boolean): void {
  console.log(JSON.stringify(formatHarnessMetricsJson(aggregate, { includeFixtures }), null, 2));
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(`Usage: routing:eval-harness [--fixtures DIR] [--summary-only]

Runs three-track eval harness (capability, cost, continuity) on fixture traces.
Outputs aggregate metrics JSON with frozen catalog metadata for reproducibility.`);
    process.exit(0);
  }

  const aggregate = runHarness({
    fixturesDir: parsed.fixturesDir,
    ...(parsed.includeFixtures === false ? { includeFixtures: false } : {}),
  });
  printHarnessMetrics(aggregate, parsed.includeFixtures !== false);
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
  process.argv[1]?.endsWith('run-harness.ts');

if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
