#!/usr/bin/env node
/**
 * Export dataset + telemetry-contrib from the local SQLite store and print
 * labeled economical-tier counts for the #95 / #110 gather window.
 *
 * Usage:
 *   npx tsx scripts/qa/export-dogfood-snapshot.ts [--limit 200] [--tag final]
 */

import { resolve } from 'node:path';

import { SqliteStore } from '../../src/infrastructure/persistence/sqlite-store.js';
import { exportDatasetToFile } from '../../.pi/extensions/smart-router/dataset-export.js';
import { getRouterStateDbPath } from '../../.pi/extensions/smart-router/utils.js';
import {
  exportTelemetryContrib,
  formatTelemetryContribExportTimestamp,
} from '../../src/cli/smart-router-cli.js';
import { countLabeledEcon } from './count-labeled-econ.js';

function parseArgs(argv: readonly string[]): { limit: number; tag: string } {
  let limit = 200;
  let tag = 'snapshot';
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      const raw = argv[i + 1];
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit: ${raw}`);
      }
      limit = Math.floor(parsed);
      i += 1;
      continue;
    }
    if (arg === '--tag') {
      tag = argv[i + 1] ?? tag;
      i += 1;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      console.log('Usage: npx tsx scripts/qa/export-dogfood-snapshot.ts [--limit N] [--tag name]');
      process.exit(0);
    }
  }
  return { limit, tag };
}

async function main(): Promise<void> {
  const { limit, tag } = parseArgs(process.argv);
  const cwd = resolve(process.cwd());
  const dbPath = getRouterStateDbPath(cwd);
  const store = new SqliteStore({ dbPath, models: [] });

  try {
    const datasetResult = await exportDatasetToFile(store, cwd, limit);
    if (!datasetResult) {
      console.error('No dataset rows to export.');
      process.exit(1);
    }

    const contrib = await exportTelemetryContrib({ store, cwd, limit });

    const labeled = countLabeledEcon(datasetResult.path);
    const summary = {
      tag,
      exported_at: formatTelemetryContribExportTimestamp(),
      dataset_path: datasetResult.path,
      dataset_rows: datasetResult.recordCount,
      telemetry_contrib_path: contrib.path,
      telemetry_contrib_rows: contrib.recordCount,
      labeled_econ: labeled,
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exit(labeled.floor_met ? 0 : 2);
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
