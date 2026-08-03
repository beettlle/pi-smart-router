/**
 * Quota window feed (SP-214 / #125) — optional producer of `QuotaWindowPosition`
 * for virtual cost v2 (#78; consumer in `virtual-cost-v2.ts`, do not re-implement).
 *
 * There is NO universal cross-provider "remaining quota" API: inference API keys
 * do not imply usage/billing endpoints, and arbitrary fleets (Cursor, OpenAI,
 * Anthropic, Gemini, local, OpenRouter, …) share no single probe. The design is
 * therefore **adapter + degrade**, evaluated in order:
 *
 *   1. Provider adapter (`QuotaWindowAdapter`) when a trustworthy remaining
 *      signal exists for the subscription pool.
 *   2. Telemetry-derived pool-level burn estimate over a rolling window
 *      (Cursor-style subscription pool first — dogfood slice).
 *   3. Omit (`undefined`) → flat SP-096 virtual cost plus the SP-097 reactive
 *      exhaustion failover safety net.
 *
 * Pool-level only: a shared subscription pool (e.g. Cursor) gets ONE window
 * position. Per-model fractions for a shared pool are never invented.
 *
 * Soft bias only: the position feeds virtual cost v2 λ decay / quota premiums.
 * No hard ban is implemented at any threshold (default: none). Real exhaustion
 * is handled reactively by SP-097 failover in `gateway-dispatch.ts`, which
 * remains the safety net whenever this feed is missing or stale.
 */

import type {
  ModelProfile,
  QuotaWindowPosition,
  RoutingTelemetry,
} from '../types/entities.js';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Cursor-style rolling subscription window length: 5 hours. */
export const DEFAULT_QUOTA_WINDOW_SECONDS = 5 * 60 * 60;

export interface QuotaWindowEstimateConfig {
  /** Rolling window length in seconds (Cursor-style 5h default). */
  readonly window_seconds: number;
  /**
   * Assumed shared-pool budget in tokens for the rolling window.
   * `0` (default) disables the telemetry estimate — no budget is ever invented.
   */
  readonly pool_budget_tokens: number;
}

export const DEFAULT_QUOTA_WINDOW_ESTIMATE_CONFIG: Readonly<QuotaWindowEstimateConfig> = {
  window_seconds: DEFAULT_QUOTA_WINDOW_SECONDS,
  pool_budget_tokens: 0,
} as const;

/** Env: SMART_ROUTER_QUOTA_WINDOW_SECONDS — rolling window length (default 18000 = 5h). */
const ENV_QUOTA_WINDOW_SECONDS = 'SMART_ROUTER_QUOTA_WINDOW_SECONDS';
/** Env: SMART_ROUTER_QUOTA_POOL_BUDGET_TOKENS — shared-pool token budget per window (default 0 = disabled). */
const ENV_QUOTA_POOL_BUDGET_TOKENS = 'SMART_ROUTER_QUOTA_POOL_BUDGET_TOKENS';

function readPositiveNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Merge quota-window env overrides onto defaults (invalid env values are ignored). */
export function resolveQuotaWindowEstimateConfigFromEnv(
  base: QuotaWindowEstimateConfig = DEFAULT_QUOTA_WINDOW_ESTIMATE_CONFIG,
): QuotaWindowEstimateConfig {
  return {
    window_seconds: readPositiveNumberEnv(ENV_QUOTA_WINDOW_SECONDS) ?? base.window_seconds,
    pool_budget_tokens:
      readPositiveNumberEnv(ENV_QUOTA_POOL_BUDGET_TOKENS) ?? base.pool_budget_tokens,
  };
}

// ─── Adapter interface ──────────────────────────────────────────────────────

/**
 * Provider adapter for a trustworthy remaining-quota signal (degrade chain step 1).
 * Return `null` when the signal is unavailable so the chain falls through to the
 * telemetry estimate; throw only on unexpected failure (the resolver degrades).
 */
export interface QuotaWindowAdapter {
  /** Stable adapter id for logs / telemetry (e.g. `cursor-usage`). */
  readonly id: string;
  /** Fetch the current pool-level window position, or null when unavailable. */
  getWindowPosition(now: Date): Promise<QuotaWindowPosition | null>;
}

// ─── Pool membership ────────────────────────────────────────────────────────

/**
 * Pool membership = fleet models carrying a virtual subscription-quota rate
 * (`pricing.quota_cost_per_1m`, SP-096). One shared pool per fleet — never
 * per-model fractions for shared quotas.
 */
export function collectPoolModelIds(fleet: readonly ModelProfile[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const model of fleet) {
    if (model.pricing.quota_cost_per_1m !== undefined) {
      ids.add(model.id);
    }
  }
  return ids;
}

// ─── Telemetry-derived burn estimate (degrade chain step 2) ─────────────────

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Estimate pool-level window position from routing telemetry.
 *
 * Burn = sum of `estimated_input_tokens` over in-window entries routed to pool
 * models, divided by the configured shared-pool budget. Returns `null` (omit)
 * when the estimate is not meaningful: budget/window not configured, or the
 * fleet has no subscription-pool models. With zero in-window burn the pool is
 * reported as a fresh window (`remaining_window_fraction = 1`).
 */
export function estimatePoolWindowPosition(
  entries: readonly RoutingTelemetry[],
  poolModelIds: ReadonlySet<string>,
  config: QuotaWindowEstimateConfig,
  now: Date = new Date(),
): QuotaWindowPosition | null {
  const { window_seconds, pool_budget_tokens } = config;
  if (
    !Number.isFinite(window_seconds) ||
    window_seconds <= 0 ||
    !Number.isFinite(pool_budget_tokens) ||
    pool_budget_tokens <= 0 ||
    poolModelIds.size === 0
  ) {
    return null;
  }

  const nowMs = now.getTime();
  const windowStartMs = nowMs - window_seconds * 1000;
  let burnedTokens = 0;
  let oldestInWindowMs: number | null = null;

  for (const entry of entries) {
    if (!poolModelIds.has(entry.selected_model_id)) {
      continue;
    }
    const ts = Date.parse(entry.timestamp);
    if (!Number.isFinite(ts) || ts < windowStartMs || ts > nowMs) {
      continue;
    }
    const tokens = entry.estimated_input_tokens;
    if (tokens !== null && Number.isFinite(tokens) && tokens > 0) {
      burnedTokens += tokens;
    }
    if (oldestInWindowMs === null || ts < oldestInWindowMs) {
      oldestInWindowMs = ts;
    }
  }

  const remaining = clamp01(1 - burnedTokens / pool_budget_tokens);
  const elapsed =
    oldestInWindowMs === null
      ? 0
      : Math.min(window_seconds, Math.max(0, (nowMs - oldestInWindowMs) / 1000));

  return {
    remaining_window_fraction: remaining,
    elapsed_window_seconds: elapsed,
  };
}

// ─── Degrade-chain resolver ─────────────────────────────────────────────────

/** Validate / clamp an adapter-supplied position; null when untrustworthy. */
export function sanitizeAdapterPosition(
  raw: QuotaWindowPosition | null,
): QuotaWindowPosition | null {
  if (raw === null || !Number.isFinite(raw.remaining_window_fraction)) {
    return null;
  }
  const elapsed = raw.elapsed_window_seconds;
  return {
    remaining_window_fraction: clamp01(raw.remaining_window_fraction),
    ...(elapsed !== undefined && Number.isFinite(elapsed) && elapsed >= 0
      ? { elapsed_window_seconds: elapsed }
      : {}),
  };
}

export interface ResolveQuotaWindowPositionOptions {
  /** Step 1: provider adapter (optional). */
  readonly adapter?: QuotaWindowAdapter | undefined;
  /** Step 2 inputs: recent routing telemetry (newest first is fine). */
  readonly entries?: readonly RoutingTelemetry[] | undefined;
  /** Step 2 inputs: pool membership (see `collectPoolModelIds`). */
  readonly poolModelIds?: ReadonlySet<string> | undefined;
  /** Step 2 inputs: estimate config; disabled budgets omit the position. */
  readonly estimateConfig?: QuotaWindowEstimateConfig | undefined;
  readonly now?: Date | undefined;
}

/**
 * Resolve the pool-level window position via the degrade chain:
 * adapter → telemetry estimate → omit (`undefined`).
 *
 * Adapter errors degrade to the estimate (zero-crash resilience); a missing or
 * stale feed always falls back to flat virtual cost + SP-097 failover.
 */
export async function resolveQuotaWindowPosition(
  options: ResolveQuotaWindowPositionOptions,
): Promise<QuotaWindowPosition | undefined> {
  const now = options.now ?? new Date();

  if (options.adapter) {
    try {
      const position = sanitizeAdapterPosition(await options.adapter.getWindowPosition(now));
      if (position !== null) {
        return position;
      }
    } catch {
      // Adapter failure must never break routing — degrade to the estimate.
    }
  }

  if (options.entries && options.poolModelIds && options.estimateConfig) {
    const estimate = estimatePoolWindowPosition(
      options.entries,
      options.poolModelIds,
      options.estimateConfig,
      now,
    );
    if (estimate !== null) {
      return estimate;
    }
  }

  return undefined;
}
