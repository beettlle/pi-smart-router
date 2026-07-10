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

/** Port for dependency injection in tests. */
export interface ThroughputSampleStore {
  push(tokensPerSecond: number): void;
  values(): readonly number[];
  clear(): void;
}

export interface ThroughputMeter {
  recordSample(tokens: number, durationMs: number): void;
  getMedianTps(): number | null;
  isAboveThreshold(threshold?: number): boolean;
  getSampleCount(): number;
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

export class RollingThroughputSampleStore implements ThroughputSampleStore {
  private readonly samples: number[] = [];

  constructor(private readonly maxSize: number) {}

  push(tokensPerSecond: number): void {
    this.samples.push(tokensPerSecond);
    while (this.samples.length > this.maxSize) {
      this.samples.shift();
    }
  }

  values(): readonly number[] {
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

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createThroughputMeter(
  config: ThroughputMeterConfig = DEFAULT_THROUGHPUT_METER_CONFIG,
  store: ThroughputSampleStore = new RollingThroughputSampleStore(config.windowSize),
): ThroughputMeter {
  const defaultThreshold = config.thresholdTps;

  return {
    recordSample(tokens: number, durationMs: number): void {
      const tps = computeTokensPerSecond(tokens, durationMs);
      if (tps === null) {
        return;
      }
      store.push(tps);
    },

    getMedianTps(): number | null {
      return median(store.values());
    },

    isAboveThreshold(threshold: number = defaultThreshold): boolean {
      const medianTps = median(store.values());
      if (medianTps === null) {
        return false;
      }
      return medianTps >= threshold;
    },

    getSampleCount(): number {
      return store.values().length;
    },

    clear(): void {
      store.clear();
    },
  };
}
