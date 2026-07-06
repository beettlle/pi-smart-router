import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
} from '../../../src/infrastructure/telemetry/telemetry-limits.js';
import type { RoutingDecision, RoutingTelemetry } from '../../../src/domain/types/index.js';
import { SMART_ROUTER_USAGE } from './commands.js';
import {
  DEFAULT_DATASET_EXPORT_LIMIT,
  MAX_DATASET_EXPORT_LIMIT,
} from './dataset-export.js';
import { formatPricingStalenessLine } from './pricing-lifecycle.js';
import type { FleetMode, SmartRouterCommand, SmartRouterRuntime } from './types.js';

export function parseHistoryLimit(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_HISTORY_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

export function parseExportLimit(tokens: string[]): number {
  let limit = DEFAULT_DATASET_EXPORT_LIMIT;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--limit') {
      const raw = tokens[i + 1];
      if (raw === undefined) {
        throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
      }
      limit = Math.min(parsed, MAX_DATASET_EXPORT_LIMIT);
      i += 1;
      continue;
    }

    if (token?.startsWith('--limit=')) {
      const raw = token.slice('--limit='.length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
      }
      limit = Math.min(parsed, MAX_DATASET_EXPORT_LIMIT);
      continue;
    }

    throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
  }

  return limit;
}

export function parseSmartRouterArgs(args: string): SmartRouterCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === 'status') {
    return { command: 'status' };
  }

  if (tokens[0] === 'history') {
    return { command: 'history', limit: parseHistoryLimit(tokens[1]) };
  }

  if (tokens[0] === 'mode' && (tokens[1] === 'scoped' || tokens[1] === 'all')) {
    return { command: 'mode', mode: tokens[1] };
  }

  if (tokens[0] === 'pricing' && tokens[1] === 'refresh') {
    return { command: 'pricing', subcommand: 'refresh' };
  }

  if (tokens[0] === 'export' && tokens[1] === 'dataset') {
    return {
      command: 'export',
      subcommand: 'dataset',
      limit: parseExportLimit(tokens.slice(2)),
    };
  }

  if (tokens[0] === 'feedback' && (tokens[1] === 'good' || tokens[1] === 'bad')) {
    return { command: 'feedback', rating: tokens[1] };
  }

  if (tokens[0] === 'unpin' && tokens.length === 1) {
    return { command: 'unpin' };
  }

  throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
}

export function formatStatusMessage(
  runtime: SmartRouterRuntime,
  decision: RoutingDecision | undefined,
): string {
  const lines = [
    `Fleet mode: ${runtime.fleetMode}`,
    `Fleet size: ${runtime.streamDeps.fleet.length}`,
  ];

  const fleetMembers = runtime.streamDeps.fleet
    .map((profile) => `${profile.provider}/${profile.id}`)
    .sort();
  if (fleetMembers.length > 0) {
    lines.push('Fleet members:');
    for (const member of fleetMembers) {
      lines.push(`  - ${member}`);
    }
  } else {
    lines.push('Fleet members: (none)');
  }

  const stalenessLine = formatPricingStalenessLine(runtime.priceCatalog);
  if (stalenessLine) {
    lines.push(`Pricing: ${stalenessLine}`);
  } else if (runtime.priceCatalog) {
    lines.push(`Pricing: fresh (last_updated ${runtime.priceCatalog.last_updated})`);
  }

  if (!decision) {
    lines.push('Last routing decision: (none yet)');
    return lines.join('\n');
  }

  lines.push(
    `Model: ${decision.selected_model_id}`,
    `Stage: ${decision.stage}`,
    `Reason: ${decision.reason_code}`,
    `Latency: ${decision.routing_latency_ms}ms`,
  );
  return lines.join('\n');
}

export function formatHistoryMessage(entries: readonly RoutingTelemetry[]): string {
  if (entries.length === 0) {
    return 'No routing history yet.';
  }

  return entries
    .map(
      (entry) =>
        `${entry.timestamp} | ${entry.selected_model_id} | ${entry.stage} | ${entry.turn_type} | ${entry.routing_latency_ms}ms`,
    )
    .join('\n');
}

export type { FleetMode };
