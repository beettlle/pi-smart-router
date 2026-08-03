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
import type { PlacementPlanReport } from '../../../src/infrastructure/hardware/placement-plan.js';
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

export function parseSmartRouterArgs(args: string): ParsedSmartRouterCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === 'status') {
    return { command: 'status' };
  }

  if (tokens[0] === 'plan' && (tokens.length === 1 || (tokens.length === 2 && tokens[1] === '--json'))) {
    return { command: 'plan', format: tokens[1] === '--json' ? 'json' : 'text' };
  }

  if (tokens[0] === 'doctor' && tokens.length === 1) {
    return { command: 'doctor' };
  }

  if (tokens[0] === 'history') {
    return { command: 'history', limit: parseHistoryLimit(tokens[1]) };
  }

  if (tokens[0] === 'stats') {
    return { command: 'stats', limit: parseHistoryLimit(tokens[1]) };
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

/**
 * Read-only placement commands (SP-216, #116). Declared here instead of
 * types.ts to keep the SmartRouterCommand union untouched.
 */
export type SmartRouterPlacementCommand =
  | { command: 'plan'; format: 'text' | 'json' }
  | { command: 'doctor' };

export type ParsedSmartRouterCommand = SmartRouterCommand | SmartRouterPlacementCommand;

function formatTps(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(1)} tok/s`;
}

function formatGb(value: number | null): string {
  return value === null ? 'unknown' : `${value.toFixed(1)} GiB`;
}

function formatPing(label: string, ping: PlacementPlanReport['localModel']['lmStudio']): string {
  if (!ping.available) {
    return `  ${label}: unreachable`;
  }
  return `  ${label}: up, model ${ping.hasLoadedModel ? 'loaded (warm)' : 'not loaded (cold)'}`;
}

/** Human-readable placement report for `/smart-router plan` (read-only). */
export function formatPlacementPlanMessage(report: PlacementPlanReport): string {
  const lines = [
    `Placement plan (read-only, schema v${report.schemaVersion}) — ${report.generatedAt}`,
    `Recommendation: ${report.recommendation}`,
    `Bottleneck guess: ${report.bottleneck.guess} — ${report.bottleneck.rationale}`,
    `Encoder: ${report.encoder.resident ? 'resident' : 'not resident'} (${report.encoder.model}) at ${report.encoder.cachePath}`,
    `Local model: ${report.localModel.warm ? 'warm' : report.localModel.coldStartExpected ? 'cold (load on first request)' : 'unavailable'}`,
    formatPing('LM Studio', report.localModel.lmStudio),
    formatPing('Ollama', report.localModel.ollama),
    `Hardware: ${report.hardware.platform}/${report.hardware.arch}, total ${formatGb(report.hardware.totalMemoryGb)}, free ${formatGb(report.hardware.freeMemoryGb)}, probe=${report.hardware.probe}`,
    `Disk (${report.disk.path}): free ${formatGb(report.disk.freeGb)}${report.disk.constrained ? ' [constrained]' : ''}`,
    `Throughput: ${report.throughput.classification} | warm median ${formatTps(report.throughput.warmMedianTps)} (${report.throughput.warmSamples} samples) | cold median ${formatTps(report.throughput.coldMedianTps)} (${report.throughput.coldSamples} samples) | threshold ${report.throughput.thresholdTps} tok/s | viable=${report.throughput.viable}`,
    `Policy: quality-preserving — on resource pressure: ${report.policy.onResourcePressure}`,
  ];
  return lines.join('\n');
}

/** Checklist-style readiness verdict for `/smart-router doctor` (read-only). */
export function formatDoctorMessage(report: PlacementPlanReport): string {
  const check = (ok: boolean, label: string): string => `${ok ? '✓' : '✗'} ${label}`;
  const lines = [
    'smart-router doctor (read-only)',
    check(report.encoder.resident, `encoder resident (${report.encoder.model})`),
    check(report.hardware.probe === 'full_local', `hardware probe: ${report.hardware.probe}`),
    check(!report.disk.constrained, `disk: ${formatGb(report.disk.freeGb)} free${report.disk.constrained ? ' [constrained]' : ''}`),
    check(
      report.localModel.lmStudio.available || report.localModel.ollama.available,
      'local runtime reachable (LM Studio / Ollama)',
    ),
    check(report.localModel.warm, `local model ${report.localModel.warm ? 'warm' : 'cold/not loaded'}`),
    check(
      report.throughput.viable,
      `throughput: ${report.throughput.classification}, viable=${report.throughput.viable}${report.throughput.classification === 'cold-only' ? ' (cold-only windows fail closed)' : ''}`,
    ),
    `Bottleneck guess: ${report.bottleneck.guess} — ${report.bottleneck.rationale}`,
    `Recommendation: ${report.recommendation}`,
    'Policy: quality-preserving — under resource pressure local is reported unavailable and routing escalates safely; encoder fidelity is never weakened.',
  ];
  return lines.join('\n');
}
