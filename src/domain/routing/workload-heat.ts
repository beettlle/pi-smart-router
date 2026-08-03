/**
 * Workload heat map + soft fleet affinity (SP-215, #115).
 *
 * Colibri learning-cache analog for serve-time routing: a privacy-safe
 * histogram of successful routes keyed by requirement fingerprint (SHA-256 of
 * the rounded requirement vector — see `requirementFingerprint` in
 * degraded-route-sandwich.ts) or operator cluster id, recording
 * (tier, model id, success proxy, count). NEVER raw prompt text, messages, or
 * tool arguments — keys are irreversible digests or snake_case catalog ids.
 *
 * Uses:
 * - **First-turn / cold-start soft bias** — `resolveAffinity` produces a
 *   bounded expected-cost discount for the heat-preferred tier, applied in
 *   expected-cost.ts. Soft only: it never overrides capability shortfall, the
 *   price-delta gate, pin cache economics, or absolute release gates.
 * - **Optional live affinity** — pinning/heat-affinity.ts applies hysteresis
 *   (~25% + swap cap) at pin-safe boundaries when live updates are enabled.
 *
 * Distinct from OATS (#77, offline centroid refinement) and from the degraded
 * neural sandwich (#119 / SP-212, failover-only learned map): heat is a
 * healthy-path serve-time affinity, not a failover path. No FrugalGPT
 * generate-then-judge cascades — routing remains pre-generation.
 */

import { z } from 'zod';

import type { Tier } from '../types/index.js';
import { TierSchema, type WorkloadHeatConfig } from '../types/schemas.js';

// ─── Keys (privacy-safe) ─────────────────────────────────────────────────────

/** 16-hex-char SHA-256 prefix of the rounded requirement vector. */
const FINGERPRINT_PATTERN = /^[0-9a-f]{16}$/;
/** Operator-catalog snake_case cluster id. */
const CLUSTER_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
/** Fleet catalog model id (never prompt-derived). */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/:]{0,127}$/;

/** Max distinct model ids tracked per cell; overflow folds into tier counts. */
export const MAX_MODELS_PER_CELL = 16;

/**
 * Privacy-safe heat key. `requirementFingerprint` is a SHA-256 digest prefix
 * of the rounded requirement vector; `clusterId` is an operator-catalog id.
 * Neither can be reversed into prompt text.
 */
export interface WorkloadHeatKey {
  readonly requirementFingerprint: string | null;
  readonly clusterId: string | null;
}

export type HeatKeySpace = 'fingerprint' | 'cluster';

export function isValidHeatKey(key: WorkloadHeatKey): boolean {
  const fpOk =
    key.requirementFingerprint === null ||
    FINGERPRINT_PATTERN.test(key.requirementFingerprint);
  const clusterOk =
    key.clusterId === null || CLUSTER_ID_PATTERN.test(key.clusterId);
  return (
    (key.requirementFingerprint !== null || key.clusterId !== null) &&
    fpOk &&
    clusterOk
  );
}

// ─── Heat records ────────────────────────────────────────────────────────────

export interface TierHeatCount {
  readonly attempts: number;
  readonly successes: number;
}

interface MutableTierHeatCount {
  attempts: number;
  successes: number;
}

interface MutableHeatCell {
  readonly tiers: Map<Tier, MutableTierHeatCount>;
  /** Model-id granularity within the cell (catalog ids only; capped). */
  readonly models: Map<string, MutableTierHeatCount>;
  updatedAt: string;
}

/** Aggregated per-tier heat view for a key (fingerprint + cluster merged). */
export interface TierHeatSummary {
  readonly tier: Tier;
  readonly attempts: number;
  readonly successes: number;
  readonly successRate: number;
}

// ─── Artifact (persist / export / import) ────────────────────────────────────

export const WORKLOAD_HEAT_ARTIFACT_VERSION = 1;

export const HeatProvenanceSchema = z.object({
  created_at: z.string().min(1),
  source: z.enum(['operator-local', 'dogfood-export', 'imported']),
  note: z.string().max(500).optional(),
});

export type HeatProvenance = z.infer<typeof HeatProvenanceSchema>;

const HeatCountSchema = z.object({
  attempts: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
});

export const WorkloadHeatArtifactSchema = z.object({
  version: z.literal(WORKLOAD_HEAT_ARTIFACT_VERSION),
  provenance: HeatProvenanceSchema,
  cells: z.array(
    z.object({
      key_space: z.enum(['fingerprint', 'cluster']),
      key: z.string().min(1),
      // Tier keys validated per-entry on import (zod v4 enum-keyed records
      // require exhaustive keys, which sparse heat cells do not have).
      tiers: z.record(z.string(), HeatCountSchema),
      models: z.record(z.string(), HeatCountSchema).optional(),
      updated_at: z.string().min(1),
    }),
  ),
});

export type WorkloadHeatArtifact = z.infer<typeof WorkloadHeatArtifactSchema>;

// ─── Affinity descriptor (soft bias input for expected-cost) ─────────────────

/**
 * Soft first-turn affinity resolved from heat. `strength` is a fractional
 * expected-cost discount for `tier`, already capped by config (≤ 0.25).
 */
export interface HeatAffinity {
  readonly tier: Tier;
  readonly strength: number;
  readonly samples: number;
  readonly successRate: number;
  readonly runnerUpRate: number;
}

// ─── WorkloadHeatMap ─────────────────────────────────────────────────────────

/**
 * In-memory bounded workload heat histogram. Two key spaces (fingerprint,
 * cluster id) with FIFO eviction per space so adversarial input cannot grow
 * the map without bound. All writes are validated; invalid keys/tiers are
 * rejected loudly (console.warn) and never stored.
 */
export class WorkloadHeatMap {
  private readonly maxEntries: number;
  private readonly byFingerprint = new Map<string, MutableHeatCell>();
  private readonly byClusterId = new Map<string, MutableHeatCell>();
  private readonly now: () => string;

  constructor(options?: {
    readonly maxEntries?: number;
    readonly clock?: () => string;
  }) {
    const maxEntries = options?.maxEntries ?? 512;
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error(
        `Workload heat map maxEntries must be a positive integer, got ${maxEntries}`,
      );
    }
    this.maxEntries = maxEntries;
    this.now = options?.clock ?? (() => new Date().toISOString());
  }

  /** Total cells across both key spaces (tests/telemetry). */
  get size(): number {
    return this.byFingerprint.size + this.byClusterId.size;
  }

  /**
   * Record one routed-turn outcome. `success` is the operator's success proxy
   * (e.g. no override, no loop escalation, positive feedback — labels are
   * owned by telemetry, never invented here).
   */
  recordOutcome(
    key: WorkloadHeatKey,
    tier: Tier,
    modelId: string,
    success: boolean,
  ): void {
    if (!isValidHeatKey(key)) {
      console.warn('Workload heat rejected invalid key (privacy-safe keys only)');
      return;
    }
    const parsedTier = TierSchema.safeParse(tier);
    if (!parsedTier.success) {
      console.warn('Workload heat rejected invalid tier', { tier });
      return;
    }
    if (!MODEL_ID_PATTERN.test(modelId)) {
      console.warn('Workload heat rejected invalid model id');
      return;
    }

    if (key.requirementFingerprint !== null) {
      recordInCell(
        this.upsertCell(this.byFingerprint, key.requirementFingerprint),
        parsedTier.data,
        modelId,
        success,
      );
    }
    if (key.clusterId !== null) {
      recordInCell(
        this.upsertCell(this.byClusterId, key.clusterId),
        parsedTier.data,
        modelId,
        success,
      );
    }
  }

  /** Merged per-tier heat for a key (fingerprint first, cluster merged in). */
  summarize(key: WorkloadHeatKey): readonly TierHeatSummary[] | null {
    if (!isValidHeatKey(key)) {
      return null;
    }

    const merged = new Map<Tier, MutableTierHeatCount>();
    const mergeCell = (cell: MutableHeatCell | undefined): void => {
      if (!cell) {
        return;
      }
      for (const [tier, count] of cell.tiers) {
        const acc = merged.get(tier) ?? { attempts: 0, successes: 0 };
        acc.attempts += count.attempts;
        acc.successes += count.successes;
        merged.set(tier, acc);
      }
    };

    if (key.requirementFingerprint !== null) {
      mergeCell(this.byFingerprint.get(key.requirementFingerprint));
    }
    if (key.clusterId !== null) {
      mergeCell(this.byClusterId.get(key.clusterId));
    }

    if (merged.size === 0) {
      return null;
    }

    return [...merged.entries()].map(([tier, count]) => ({
      tier,
      attempts: count.attempts,
      successes: count.successes,
      successRate: count.attempts > 0 ? count.successes / count.attempts : 0,
    }));
  }

  /**
   * Resolve the soft first-turn affinity for a key, or null when heat is
   * insufficient to bias. Gates: config.enabled, min_samples on the leader,
   * and min_success_margin over the runner-up. Strength is config-capped.
   */
  resolveAffinity(
    key: WorkloadHeatKey,
    config: WorkloadHeatConfig,
  ): HeatAffinity | null {
    if (!config.enabled) {
      return null;
    }

    const summaries = this.summarize(key);
    if (!summaries || summaries.length === 0) {
      return null;
    }

    const ranked = [...summaries].sort((a, b) => b.successRate - a.successRate);
    const leader = ranked[0]!;
    if (leader.attempts < config.min_samples) {
      return null;
    }

    const runnerUpRate = ranked.length > 1 ? ranked[1]!.successRate : 0;
    if (leader.successRate - runnerUpRate < config.min_success_margin) {
      return null;
    }

    return {
      tier: leader.tier,
      strength: Math.min(config.bias_strength, 0.25),
      samples: leader.attempts,
      successRate: leader.successRate,
      runnerUpRate,
    };
  }

  /** Raw per-tier counts for one key-space entry (export / hysteresis). */
  getCell(
    keySpace: HeatKeySpace,
    key: string,
  ): {
    readonly tiers: ReadonlyMap<Tier, TierHeatCount>;
    readonly updatedAt: string;
  } | null {
    const cell = (
      keySpace === 'fingerprint' ? this.byFingerprint : this.byClusterId
    ).get(key);
    if (!cell) {
      return null;
    }
    return { tiers: new Map(cell.tiers), updatedAt: cell.updatedAt };
  }

  /**
   * Decaying heat (Colibri analog): multiply all counts by `factor` in (0, 1],
   * flooring; empty tier/model counts are dropped. Used at live-repin time so
   * the hot set tracks the live workload instead of accumulating forever.
   */
  decay(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0 || factor > 1) {
      console.warn('Workload heat decay rejected invalid factor', { factor });
      return;
    }
    if (factor === 1) {
      return;
    }

    for (const space of [this.byFingerprint, this.byClusterId]) {
      for (const [cellKey, cell] of space) {
        for (const [tier, count] of cell.tiers) {
          count.attempts = Math.floor(count.attempts * factor);
          count.successes = Math.floor(count.successes * factor);
          if (count.attempts === 0) {
            cell.tiers.delete(tier);
          }
        }
        for (const [modelId, count] of cell.models) {
          count.attempts = Math.floor(count.attempts * factor);
          count.successes = Math.floor(count.successes * factor);
          if (count.attempts === 0) {
            cell.models.delete(modelId);
          }
        }
        if (cell.tiers.size === 0) {
          space.delete(cellKey);
        }
      }
    }
  }

  /** Drop all heat (operator clear path — router-reset analog). */
  clear(): void {
    this.byFingerprint.clear();
    this.byClusterId.clear();
  }

  /** Serialize to a versioned artifact with provenance (export path). */
  exportArtifact(provenance: HeatProvenance): WorkloadHeatArtifact {
    const cells: WorkloadHeatArtifact['cells'][number][] = [];
    const pushSpace = (
      keySpace: HeatKeySpace,
      space: Map<string, MutableHeatCell>,
    ): void => {
      for (const [cellKey, cell] of space) {
        const tiers: Record<string, TierHeatCount> = {};
        for (const [tier, count] of cell.tiers) {
          tiers[tier] = { attempts: count.attempts, successes: count.successes };
        }
        const models: Record<string, TierHeatCount> = {};
        for (const [modelId, count] of cell.models) {
          models[modelId] = {
            attempts: count.attempts,
            successes: count.successes,
          };
        }
        cells.push({
          key_space: keySpace,
          key: cellKey,
          tiers: tiers as WorkloadHeatArtifact['cells'][number]['tiers'],
          ...(Object.keys(models).length > 0 ? { models } : {}),
          updated_at: cell.updatedAt,
        });
      }
    };
    pushSpace('fingerprint', this.byFingerprint);
    pushSpace('cluster', this.byClusterId);

    return {
      version: WORKLOAD_HEAT_ARTIFACT_VERSION,
      provenance,
      cells,
    };
  }

  /**
   * Load a histogram from an artifact. Invalid artifacts throw (fail loud);
   * invalid cells/keys inside a valid artifact are skipped with a warning.
   */
  static importArtifact(
    artifact: unknown,
    options?: { readonly maxEntries?: number; readonly clock?: () => string },
  ): WorkloadHeatMap {
    const parsed = WorkloadHeatArtifactSchema.safeParse(artifact);
    if (!parsed.success) {
      throw new Error(
        `Invalid workload heat artifact: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`,
      );
    }

    const map = new WorkloadHeatMap(options);
    for (const cell of parsed.data.cells) {
      const key: WorkloadHeatKey =
        cell.key_space === 'fingerprint'
          ? { requirementFingerprint: cell.key, clusterId: null }
          : { requirementFingerprint: null, clusterId: cell.key };
      if (!isValidHeatKey(key)) {
        console.warn('Workload heat import skipped invalid cell key', {
          keySpace: cell.key_space,
        });
        continue;
      }

      const target =
        cell.key_space === 'fingerprint' ? map.byFingerprint : map.byClusterId;
      const mutable = map.upsertCell(target, cell.key);
      for (const [tier, count] of Object.entries(cell.tiers)) {
        const parsedTier = TierSchema.safeParse(tier);
        if (!parsedTier.success) {
          continue;
        }
        mutable.tiers.set(parsedTier.data, {
          attempts: count.attempts,
          successes: Math.min(count.successes, count.attempts),
        });
      }
      if (cell.models) {
        for (const [modelId, count] of Object.entries(cell.models)) {
          if (
            !MODEL_ID_PATTERN.test(modelId) ||
            mutable.models.size >= MAX_MODELS_PER_CELL
          ) {
            continue;
          }
          mutable.models.set(modelId, {
            attempts: count.attempts,
            successes: Math.min(count.successes, count.attempts),
          });
        }
      }
      mutable.updatedAt = cell.updated_at;
    }
    return map;
  }

  private upsertCell(
    space: Map<string, MutableHeatCell>,
    cellKey: string,
  ): MutableHeatCell {
    const existing = space.get(cellKey);
    if (existing) {
      existing.updatedAt = this.now();
      return existing;
    }

    if (space.size >= this.maxEntries) {
      const oldest = space.keys().next();
      if (!oldest.done) {
        space.delete(oldest.value);
      }
    }

    const cell: MutableHeatCell = {
      tiers: new Map(),
      models: new Map(),
      updatedAt: this.now(),
    };
    space.set(cellKey, cell);
    return cell;
  }
}

function recordInCell(
  cell: MutableHeatCell,
  tier: Tier,
  modelId: string,
  success: boolean,
): void {
  const tierCount = cell.tiers.get(tier) ?? { attempts: 0, successes: 0 };
  tierCount.attempts += 1;
  if (success) {
    tierCount.successes += 1;
  }
  cell.tiers.set(tier, tierCount);

  let modelCount = cell.models.get(modelId);
  if (!modelCount && cell.models.size < MAX_MODELS_PER_CELL) {
    modelCount = { attempts: 0, successes: 0 };
    cell.models.set(modelId, modelCount);
  }
  if (modelCount) {
    modelCount.attempts += 1;
    if (success) {
      modelCount.successes += 1;
    }
  }
}
