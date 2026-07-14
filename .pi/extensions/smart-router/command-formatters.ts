import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
} from '../../../src/infrastructure/telemetry/telemetry-limits.js';
import type {
  ModelProfile,
  PriceCatalog,
  RoutingDecision,
  RoutingTelemetry,
} from '../../../src/domain/types/index.js';
import {
  aggregateSessionStatsFromFleet,
  type SessionStatsSnapshot,
} from '../../../src/infrastructure/telemetry/session-stats.js';
import { SMART_ROUTER_USAGE } from './commands.js';
import {
  DEFAULT_TELEMETRY_CONTRIB_EXPORT_LIMIT,
  parseExportTelemetryContribArgs,
} from '../../../src/cli/smart-router-cli.js';
import {
  DEFAULT_DATASET_EXPORT_LIMIT,
  MAX_DATASET_EXPORT_LIMIT,
} from './dataset-export.js';
import { formatPricingStalenessLine } from './pricing-lifecycle.js';
import type { FleetMode, SmartRouterCommand, SmartRouterRuntime } from './types.js';

export type { SessionStatsSnapshot };

/** Opaque / virtual auto ids that hide the concrete delegated fleet model (SP-178). */
function isBareOrSmartRouterAuto(modelId: string): boolean {
  return modelId === 'auto' || modelId === 'smart-router/auto';
}

/**
 * Resolve the operator-facing model id for history/status (SP-178 / #99).
 * Prefer a concrete delegated/primary id over virtual `auto`.
 */
export function resolveHistoryModelId(
  entry: Pick<
    RoutingTelemetry,
    | 'selected_model_id'
    | 'planning_delegate_primary_model_id'
    | 'planning_delegate_model_id'
  >,
  fleet?: readonly ModelProfile[],
): string {
  let modelId = entry.selected_model_id;

  if (isBareOrSmartRouterAuto(modelId)) {
    const primary = entry.planning_delegate_primary_model_id;
    if (primary && !isBareOrSmartRouterAuto(primary)) {
      modelId = primary;
    } else if (
      entry.planning_delegate_model_id &&
      !isBareOrSmartRouterAuto(entry.planning_delegate_model_id)
    ) {
      modelId = entry.planning_delegate_model_id;
    }
  }

  return qualifyModelIdForDisplay(modelId, fleet);
}

/**
 * Qualify bare `auto` with provider when fleet is available so history never
 * looks like the smart-router virtual model.
 */
export function qualifyModelIdForDisplay(
  modelId: string,
  fleet?: readonly ModelProfile[],
): string {
  if (modelId !== 'auto') {
    return modelId;
  }

  const profile = fleet?.find((m) => m.id === 'auto');
  if (profile) {
    return `${profile.provider}/${profile.id}`;
  }

  // Cursor opaque auto is the common bare-`auto` fleet id; never leave it unqualified.
  return 'cursor/auto';
}

export function resolveStatusModelId(
  decision: RoutingDecision,
  fleet?: readonly ModelProfile[],
): string {
  const primary = decision.features?.planning_delegate?.primary_model_id ?? null;
  const delegate = decision.features?.planning_delegate?.delegate_model_id ?? null;
  return resolveHistoryModelId(
    {
      selected_model_id: decision.selected_model_id,
      planning_delegate_primary_model_id: primary,
      planning_delegate_model_id: delegate,
    },
    fleet,
  );
}

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

  if (tokens[0] === 'export' && tokens[1] === 'telemetry-contrib') {
    const { limit } = parseExportTelemetryContribArgs(tokens.join(' '));
    return {
      command: 'export',
      subcommand: 'telemetry-contrib',
      limit: Math.min(limit, DEFAULT_TELEMETRY_CONTRIB_EXPORT_LIMIT),
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

  const displayModelId = resolveStatusModelId(decision, runtime.streamDeps.fleet);
  lines.push(
    `Model: ${displayModelId}`,
    `Stage: ${decision.stage}`,
    `Reason: ${decision.reason_code}`,
    `Latency: ${decision.routing_latency_ms}ms`,
  );
  return lines.join('\n');
}

export function formatHistoryMessage(
  entries: readonly RoutingTelemetry[],
  options?: { fleet?: readonly ModelProfile[] },
): string {
  if (entries.length === 0) {
    return 'No routing history yet.';
  }

  const fleet = options?.fleet;
  return entries
    .map((entry) => {
      const modelId = resolveHistoryModelId(entry, fleet);
      return `${entry.timestamp} | ${modelId} | ${entry.stage} | ${entry.turn_type} | ${entry.routing_latency_ms}ms`;
    })
    .join('\n');
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  if (Math.abs(value) >= 1) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(6)}`;
}

function formatShare(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatMean(value: number | null, suffix: string): string {
  if (value === null) {
    return 'n/a';
  }
  if (suffix === 'ms') {
    return `${value.toFixed(1)}${suffix}`;
  }
  return `${formatUsd(value)}${suffix}`;
}

/**
 * Operator-facing text for `/smart-router stats` (privacy-safe aggregates only).
 */
export function formatStatsMessage(
  entries: readonly RoutingTelemetry[],
  options?: {
    fleet?: readonly ModelProfile[];
    priceCatalog?: PriceCatalog | null;
  },
): string {
  const snapshot = aggregateSessionStatsFromFleet(
    entries,
    options?.fleet,
    options?.priceCatalog,
  );

  if (snapshot.entry_count === 0) {
    return 'No routing stats yet (empty telemetry window).';
  }

  const lines = [
    `Entries: ${snapshot.entry_count}`,
    `Cost: total ${formatUsd(snapshot.total_cost_usd)} | mean ${formatMean(snapshot.mean_cost_usd, '')}`,
    `Latency: total ${snapshot.total_latency_ms.toFixed(0)}ms | mean ${formatMean(snapshot.mean_latency_ms, 'ms')}`,
    `Planning delegate share: ${formatShare(snapshot.planning_delegate_share)} (direct ${formatShare(snapshot.direct_share)})`,
    `Local vs cloud (when known): local ${formatShare(snapshot.local_share)} | cloud ${formatShare(snapshot.cloud_share)}`,
    'Role cost breakdown:',
    `  primary (pin path): ${snapshot.role_cost.primary.count} | ${formatUsd(snapshot.role_cost.primary.total_cost_usd)}`,
    `  planning_delegate: ${snapshot.role_cost.planning_delegate.count} | ${formatUsd(snapshot.role_cost.planning_delegate.total_cost_usd)}`,
    `  other: ${snapshot.role_cost.other.count} | ${formatUsd(snapshot.role_cost.other.total_cost_usd)}`,
  ];

  if (snapshot.frontier_savings_usd !== undefined) {
    lines.push(
      `Vs always-frontier savings (est.): ${formatUsd(snapshot.frontier_savings_usd)}`,
      '  formula: sum max(0, tokens/1e6 * frontier_cost_per_1m - estimated_cost_usd); omitted when prices missing',
    );
  } else {
    lines.push('Vs always-frontier savings: (omitted — frontier prices unavailable)');
  }

  return lines.join('\n');
}

/** JSON snapshot helper for automation (same aggregate as formatStatsMessage). */
export function buildStatsSnapshot(
  entries: readonly RoutingTelemetry[],
  options?: {
    fleet?: readonly ModelProfile[];
    priceCatalog?: PriceCatalog | null;
  },
): SessionStatsSnapshot {
  return aggregateSessionStatsFromFleet(entries, options?.fleet, options?.priceCatalog);
}

export type { FleetMode };
