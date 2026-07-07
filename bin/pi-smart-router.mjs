#!/usr/bin/env node

/**
 * pi-smart-router CLI — offline operator tools (telemetry export, etc.).
 * Requires `npm run build` so dist/ artifacts exist (release:check runs build first).
 */

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIN_NODE_MAJOR = 22;
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (nodeMajor < MIN_NODE_MAJOR) {
  console.error(
    `pi-smart-router requires Node.js >= ${MIN_NODE_MAJOR}.0.0 (found ${process.versions.node}).`,
  );
  process.exit(1);
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadDist(modulePath) {
  return import(pathToFileURL(join(packageRoot, modulePath)).href);
}

function getRouterStateDbPath(cwd) {
  const configured = process.env.ROUTER_STATE_DB_PATH?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  return join(cwd, '.pi-smart-router/state.db');
}

function printUsage() {
  console.error(`Usage:
  pi-smart-router export telemetry-contrib [--limit N]

Run from a directory with pi routing state (default: ./.pi-smart-router/state.db).`);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = argv.join(' ');

  const cli = await loadDist('dist/cli/smart-router-cli.js');
  const sqlite = await loadDist('dist/infrastructure/persistence/sqlite-store.js');

  if (cli.isExportTelemetryContribInvocation(args)) {
    const { limit } = cli.parseExportTelemetryContribArgs(args);
    const cwd = process.cwd();
    const { store } = sqlite.createResilientStore({
      dbPath: getRouterStateDbPath(cwd),
      models: [],
    });

    const result = await cli.exportTelemetryContrib({ store, cwd, limit });
    if (result.path) {
      console.log(`Exported ${result.recordCount} telemetry-contrib record(s) to ${result.path}`);
      return;
    }

    if (result.recordCount === 0) {
      console.log('No telemetry-contrib records to export (opt in with SMART_ROUTER_DATASET=1).');
      return;
    }

    console.log(result.json);
    return;
  }

  printUsage();
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
