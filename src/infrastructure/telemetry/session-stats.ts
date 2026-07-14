/**
 * Privacy-safe session / window stats over RoutingTelemetry (SP-207 / #118).
 *
 * Aggregates only numeric and categorical telemetry fields — never prompt,
 * message, or tool-argument bodies.
 */

import type {
  ModelProfile,
  PlanningDelegatePath,
  PriceCatalog,
  RoutingTelemetry,
  Tier,
} from '../../domain/types/index.js';

export type RoleCostBucket = 'primary' | 'planning_delegate' | 'other';

export type DeploymentClass = 'local' | 'cloud' | 'unknown';

export interface RoleBucketStats {
  readonly count: number;
  readonly total_cost_usd: number;
}

export interface RoleCostBreakdown {
  readonly primary: RoleBucketStats;
  readonly planning_delegate: RoleBucketStats;
  readonly other: RoleBucketStats;
}

/**
 * Compact JSON snapshot for automation / MCP (llm-use `stats_snapshot` analog).
 * Optional `frontier_savings_usd` is omitted when prices are unavailable (fail closed).
 */
export interface SessionStatsSnapshot {
  readonly entry_count: number;
  readonly total_cost_usd: number;
  readonly mean_cost_usd: number | null;
  readonly total_latency_ms: number;
  readonly mean_latency_ms: number | null;
  /** Share of entries with planning_delegate_path === 'delegate' (0–1), null if empty. */
  readonly planning_delegate_share: number | null;
  /** Share of entries with non-delegate path (direct / none / null). */
  readonly direct_share: number | null;
  /** Share classified as local (zero-tier) when distinguishable; null if none classified. */
  readonly local_share: number | null;
  /** Share classified as cloud when distinguishable; null if none classified. */
  readonly cloud_share: number | null;
  readonly role_cost: RoleCostBreakdown;
  /**
   * Estimated USD saved vs always-frontier baseline.
   * Formula: sum over entries with token counts of
   *   max(0, tokens/1e6 * frontier_cost_per_1m - estimated_cost_usd).
   * Omitted when frontier price inputs are missing (fail closed).
   */
  readonly frontier_savings_usd?: number;
}

export interface AggregateSessionStatsOptions {
  /**
   * USD per 1M tokens for the always-frontier baseline.
   * When absent / non-finite / ≤0, `frontier_savings_usd` is omitted.
   */
  readonly frontier_cost_per_1m?: number;
  /** Optional model_id → tier map (e.g. from fleet) for local vs cloud. */
  readonly tier_by_model_id?: ReadonlyMap<string, Tier>;
}

const EMPTY_BUCKET: RoleBucketStats = { count: 0, total_cost_usd: 0 };

function emptyBreakdown(): RoleCostBreakdown {
  return {
    primary: { ...EMPTY_BUCKET },
    planning_delegate: { ...EMPTY_BUCKET },
    other: { ...EMPTY_BUCKET },
  };
}

/** Mutually exclusive role for cost bucketing. */
export function classifyRoleCostBucket(entry: RoutingTelemetry): RoleCostBucket {
  if (entry.planning_delegate_path === 'delegate') {
    return 'planning_delegate';
  }
  if (entry.pin_reason != null) {
    return 'primary';
  }
  return 'other';
}

export function classifyDeployment(
  entry: RoutingTelemetry,
  tierByModelId?: ReadonlyMap<string, Tier>,
): DeploymentClass {
  const fromFleet = tierByModelId?.get(entry.selected_model_id);
  const tier = fromFleet ?? entry.tier_hint;
  if (tier === 'zero-tier') {
    return 'local';
  }
  if (tier === 'economical-cloud' || tier === 'frontier-cloud') {
    return 'cloud';
  }
  return 'unknown';
}

function isPlanningDelegate(path: PlanningDelegatePath | null): boolean {
  return path === 'delegate';
}

/**
 * Resolve always-frontier cost/1M from fleet + optional catalog.
 * Returns undefined when no positive frontier price is available (fail closed).
 */
export function resolveFrontierCostPer1M(
  fleet?: readonly ModelProfile[],
  catalog?: PriceCatalog | null,
): number | undefined {
  const candidates: number[] = [];

  if (fleet) {
    for (const model of fleet) {
      if (model.tier !== 'frontier-cloud') {
        continue;
      }
      const cost = model.pricing.fallback_cost_per_1m;
      if (Number.isFinite(cost) && cost > 0) {
        candidates.push(cost);
      }
      if (catalog) {
        const key = model.pricing.registry_key ?? model.id;
        const fromCatalog =
          catalog.user_overrides[key] ?? catalog.registry_snapshot[key];
        if (fromCatalog !== undefined && Number.isFinite(fromCatalog) && fromCatalog > 0) {
          candidates.push(fromCatalog);
        }
      }
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  // Upper-bound “always frontier” baseline: most expensive known frontier rate.
  return Math.max(...candidates);
}

function buildTierMap(fleet?: readonly ModelProfile[]): ReadonlyMap<string, Tier> | undefined {
  if (!fleet || fleet.length === 0) {
    return undefined;
  }
  const map = new Map<string, Tier>();
  for (const model of fleet) {
    map.set(model.id, model.tier);
    map.set(`${model.provider}/${model.id}`, model.tier);
  }
  return map;
}

/**
 * Pure aggregate over routing telemetry for operator stats.
 * Does not read or emit prompt/message/tool bodies.
 */
export function aggregateSessionStats(
  entries: readonly RoutingTelemetry[],
  options: AggregateSessionStatsOptions = {},
): SessionStatsSnapshot {
  const tierByModelId = options.tier_by_model_id;
  const roleAccum = {
    primary: { count: 0, total_cost_usd: 0 },
    planning_delegate: { count: 0, total_cost_usd: 0 },
    other: { count: 0, total_cost_usd: 0 },
  };

  let totalCost = 0;
  let totalLatency = 0;
  let delegateCount = 0;
  let localCount = 0;
  let cloudCount = 0;
  let classifiedDeployment = 0;

  for (const entry of entries) {
    const cost = Number.isFinite(entry.estimated_cost_usd) ? entry.estimated_cost_usd : 0;
    const latency = Number.isFinite(entry.routing_latency_ms) ? entry.routing_latency_ms : 0;
    totalCost += cost;
    totalLatency += latency;

    if (isPlanningDelegate(entry.planning_delegate_path)) {
      delegateCount += 1;
    }

    const role = classifyRoleCostBucket(entry);
    roleAccum[role].count += 1;
    roleAccum[role].total_cost_usd += cost;

    const deployment = classifyDeployment(entry, tierByModelId);
    if (deployment === 'local') {
      localCount += 1;
      classifiedDeployment += 1;
    } else if (deployment === 'cloud') {
      cloudCount += 1;
      classifiedDeployment += 1;
    }
  }

  const n = entries.length;
  const snapshot: SessionStatsSnapshot = {
    entry_count: n,
    total_cost_usd: totalCost,
    mean_cost_usd: n > 0 ? totalCost / n : null,
    total_latency_ms: totalLatency,
    mean_latency_ms: n > 0 ? totalLatency / n : null,
    planning_delegate_share: n > 0 ? delegateCount / n : null,
    direct_share: n > 0 ? (n - delegateCount) / n : null,
    local_share: classifiedDeployment > 0 ? localCount / classifiedDeployment : null,
    cloud_share: classifiedDeployment > 0 ? cloudCount / classifiedDeployment : null,
    role_cost: {
      primary: { ...roleAccum.primary },
      planning_delegate: { ...roleAccum.planning_delegate },
      other: { ...roleAccum.other },
    },
  };

  const frontierSavings = estimateFrontierSavingsUsd(entries, options.frontier_cost_per_1m);
  if (frontierSavings !== undefined) {
    return { ...snapshot, frontier_savings_usd: frontierSavings };
  }

  return snapshot;
}

/**
 * Optional vs-always-frontier savings. Returns undefined when price input is
 * missing or non-positive (fail closed) or when no entry has token counts.
 */
export function estimateFrontierSavingsUsd(
  entries: readonly RoutingTelemetry[],
  frontierCostPer1M: number | undefined,
): number | undefined {
  if (
    frontierCostPer1M === undefined ||
    !Number.isFinite(frontierCostPer1M) ||
    frontierCostPer1M <= 0
  ) {
    return undefined;
  }

  let savings = 0;
  let counted = 0;

  for (const entry of entries) {
    const tokens = entry.estimated_input_tokens;
    if (tokens === null || !Number.isFinite(tokens) || tokens < 0) {
      continue;
    }
    const actual = Number.isFinite(entry.estimated_cost_usd) ? entry.estimated_cost_usd : 0;
    const frontierCost = (tokens / 1_000_000) * frontierCostPer1M;
    savings += Math.max(0, frontierCost - actual);
    counted += 1;
  }

  if (counted === 0) {
    return undefined;
  }

  return savings;
}

/** Convenience: aggregate with fleet/catalog-derived tier map + frontier price. */
export function aggregateSessionStatsFromFleet(
  entries: readonly RoutingTelemetry[],
  fleet?: readonly ModelProfile[],
  catalog?: PriceCatalog | null,
): SessionStatsSnapshot {
  return aggregateSessionStats(entries, {
    tier_by_model_id: buildTierMap(fleet),
    frontier_cost_per_1m: resolveFrontierCostPer1M(fleet, catalog),
  });
}

/** Keys that must never appear on a stats snapshot (privacy). */
export const SESSION_STATS_FORBIDDEN_KEYS = [
  'prompt',
  'prompt_text',
  'messages',
  'content',
  'tool_calls',
  'tool_args',
  'pepper',
] as const;

export function assertSessionStatsPrivacySafe(snapshot: SessionStatsSnapshot): void {
  const json = JSON.stringify(snapshot);
  for (const key of SESSION_STATS_FORBIDDEN_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Stats snapshot contains forbidden privacy key: ${key}`);
    }
  }
}
