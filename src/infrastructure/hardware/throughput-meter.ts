/**
 * Rolling median tokens_per_second meter — SP-163, #84 part 1.
 *
 * Tracks local inference throughput samples and exposes a rolling median
 * estimate for hardware viability gating (wired in SP-164).
 *
 * Pure module with injectable sample store for testability.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThroughputMeterConfig {
  readonly windowSize: number;
  readonly thresholdTps: number;
}

// ─── Cold vs warm classification (SP-216, #116) ──────────────────────────────

/**
 * Cold vs warm sample phase.
 *
 * - `warm` — steady-state generation measured after model load. Only warm
 *   samples count toward local viability.
 * - `cold` — sample includes cold-start cost (model load, warmup). Cold
 *   samples under-state steady-state TPS and never count toward viability;
 *   they are reported separately as cold-start evidence.
 *
 * Untagged `recordSample()` calls default to `warm`: the routing pipeline
 * measures post-load generation duration.
 */
export type ThroughputSamplePhase = 'cold' | 'warm';

export interface ThroughputSample {
  readonly tokensPerSecond: number;
  readonly phase: ThroughputSamplePhase;
}

/**
 * Cold/warm breakdown of the rolling window.
 *
 * Formula: `warmMedianTps = median(tps where phase='warm')`,
 * `coldMedianTps = median(tps where phase='cold')`.
 * Viability (see {@link ThroughputMeter.isViable}):
 * `viable = warmSamples > 0 AND warmMedianTps >= threshold`.
 * When policy `requireWarmSamples` is true (default) and only cold samples
 * exist, viability fails closed (local reported unavailable).
 */
export interface ThroughputBreakdown {
  readonly warmMedianTps: number | null;
  readonly coldMedianTps: number | null;
  readonly warmSamples: number;
  readonly coldSamples: number;
  readonly classification: 'warm' | 'cold-only' | 'no-samples';
}

/** Local viability policy for cold/warm TPS (SP-216, #116). */
export interface LocalViabilityPolicy {
  /**
   * Fail closed when only cold samples exist (quality-preserving default).
   * When false, cold-only windows are evaluated against the cold median.
   */
  readonly requireWarmSamples: boolean;
}

export const DEFAULT_LOCAL_VIABILITY_POLICY: Readonly<LocalViabilityPolicy> = {
  requireWarmSamples: true,
} as const;

/** Port for dependency injection in tests. */
export interface ThroughputSampleStore {
  push(tokensPerSecond: number): void;
  values(): readonly number[];
  clear(): void;
}

/**
 * Optional tagged-store port. Stores implementing it retain the cold/warm
 * phase per sample; untagged stores are treated as all-warm.
 */
export interface TaggedThroughputSampleStore extends ThroughputSampleStore {
  pushSample(tokensPerSecond: number, phase: ThroughputSamplePhase): void;
  entries(): readonly ThroughputSample[];
}

export interface ThroughputMeter {
  recordSample(tokens: number, durationMs: number, phase?: ThroughputSamplePhase): void;
  getMedianTps(phase?: ThroughputSamplePhase): number | null;
  isAboveThreshold(threshold?: number): boolean;
  getSampleCount(phase?: ThroughputSamplePhase): number;
  getBreakdown(): ThroughputBreakdown;
  isViable(policy?: LocalViabilityPolicy, threshold?: number): boolean;
  clear(): void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/** Human-usable local viability threshold (~25 tok/s per routing-roadmap.md §3). */
export const DEFAULT_THROUGHPUT_THRESHOLD_TPS = 25;

/** Rolling window over last N local inference samples (research default: 50). */
export const DEFAULT_THROUGHPUT_WINDOW_SIZE = 50;

export const DEFAULT_THROUGHPUT_METER_CONFIG: Readonly<ThroughputMeterConfig> = {
  windowSize: DEFAULT_THROUGHPUT_WINDOW_SIZE,
  thresholdTps: DEFAULT_THROUGHPUT_THRESHOLD_TPS,
} as const;

// ─── Store ───────────────────────────────────────────────────────────────────

export class RollingThroughputSampleStore implements TaggedThroughputSampleStore {
  private readonly samples: ThroughputSample[] = [];

  constructor(private readonly maxSize: number) {}

  push(tokensPerSecond: number): void {
    this.pushSample(tokensPerSecond, 'warm');
  }

  pushSample(tokensPerSecond: number, phase: ThroughputSamplePhase): void {
    this.samples.push({ tokensPerSecond, phase });
    while (this.samples.length > this.maxSize) {
      this.samples.shift();
    }
  }

  values(): readonly number[] {
    return this.samples.map((s) => s.tokensPerSecond);
  }

  entries(): readonly ThroughputSample[] {
    return this.samples;
  }

  clear(): void {
    this.samples.length = 0;
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function computeTokensPerSecond(tokens: number, durationMs: number): number | null {
  if (!Number.isFinite(tokens) || tokens < 0) {
    return null;
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return (tokens * 1000) / durationMs;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function isTaggedStore(
  store: ThroughputSampleStore,
): store is TaggedThroughputSampleStore {
  return (
    'entries' in store &&
    typeof (store as TaggedThroughputSampleStore).entries === 'function' &&
    'pushSample' in store &&
    typeof (store as TaggedThroughputSampleStore).pushSample === 'function'
  );
}

function taggedEntries(store: ThroughputSampleStore): readonly ThroughputSample[] {
  if (isTaggedStore(store)) {
    return store.entries();
  }
  // Untagged custom stores are treated as all-warm (post-load measurements).
  return store.values().map((tokensPerSecond) => ({
    tokensPerSecond,
    phase: 'warm' as const,
  }));
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createThroughputMeter(
  config: ThroughputMeterConfig = DEFAULT_THROUGHPUT_METER_CONFIG,
  store: ThroughputSampleStore = new RollingThroughputSampleStore(config.windowSize),
): ThroughputMeter {
  const defaultThreshold = config.thresholdTps;

  const meter: ThroughputMeter = {
    recordSample(tokens: number, durationMs: number, phase: ThroughputSamplePhase = 'warm'): void {
      const tps = computeTokensPerSecond(tokens, durationMs);
      if (tps === null) {
        return;
      }
      if (isTaggedStore(store)) {
        store.pushSample(tps, phase);
      } else {
        store.push(tps);
      }
    },

    getMedianTps(phase?: ThroughputSamplePhase): number | null {
      if (phase === undefined) {
        return median(store.values());
      }
      const filtered = taggedEntries(store)
        .filter((s) => s.phase === phase)
        .map((s) => s.tokensPerSecond);
      return median(filtered);
    },

    isAboveThreshold(threshold: number = defaultThreshold): boolean {
      const medianTps = median(store.values());
      if (medianTps === null) {
        return false;
      }
      return medianTps >= threshold;
    },

    getSampleCount(phase?: ThroughputSamplePhase): number {
      if (phase === undefined) {
        return store.values().length;
      }
      return taggedEntries(store).filter((s) => s.phase === phase).length;
    },

    getBreakdown(): ThroughputBreakdown {
      const entries = taggedEntries(store);
      const warm = entries.filter((s) => s.phase === 'warm').map((s) => s.tokensPerSecond);
      const cold = entries.filter((s) => s.phase === 'cold').map((s) => s.tokensPerSecond);
      const warmMedianTps = median(warm);
      const coldMedianTps = median(cold);
      const classification =
        warm.length > 0 ? 'warm' : cold.length > 0 ? 'cold-only' : 'no-samples';
      return {
        warmMedianTps,
        coldMedianTps,
        warmSamples: warm.length,
        coldSamples: cold.length,
        classification,
      };
    },

    isViable(
      policy: LocalViabilityPolicy = DEFAULT_LOCAL_VIABILITY_POLICY,
      threshold: number = defaultThreshold,
    ): boolean {
      const breakdown = meter.getBreakdown();
      if (breakdown.classification === 'no-samples') {
        return false;
      }
      if (breakdown.warmMedianTps !== null) {
        return breakdown.warmMedianTps >= threshold;
      }
      // Cold-only window: fail closed unless policy explicitly allows cold medians.
      if (policy.requireWarmSamples) {
        return false;
      }
      return breakdown.coldMedianTps !== null && breakdown.coldMedianTps >= threshold;
    },

    clear(): void {
      store.clear();
    },
  };

  return meter;
}
