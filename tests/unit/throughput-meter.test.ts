import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THROUGHPUT_CONFIG,
  ThroughputConfigSchema,
} from '../../src/domain/types/schemas.js';
import {
  computeTokensPerSecond,
  createThroughputMeter,
  DEFAULT_THROUGHPUT_METER_CONFIG,
  median,
  type ThroughputSampleStore,
} from '../../src/infrastructure/hardware/throughput-meter.js';

function makeMockStore(initial: readonly number[] = []): ThroughputSampleStore & {
  pushed: number[];
} {
  const pushed: number[] = [...initial];
  return {
    pushed,
    push(value: number): void {
      pushed.push(value);
    },
    values(): readonly number[] {
      return pushed;
    },
    clear(): void {
      pushed.length = 0;
    },
  };
}

describe('computeTokensPerSecond', () => {
  it('computes tokens per second from tokens and duration', () => {
    expect(computeTokensPerSecond(100, 2000)).toBe(50);
    expect(computeTokensPerSecond(25, 1000)).toBe(25);
  });

  it('returns null for invalid duration', () => {
    expect(computeTokensPerSecond(100, 0)).toBeNull();
    expect(computeTokensPerSecond(100, -1)).toBeNull();
  });

  it('returns null for invalid token counts', () => {
    expect(computeTokensPerSecond(-1, 1000)).toBeNull();
    expect(computeTokensPerSecond(Number.NaN, 1000)).toBeNull();
  });
});

describe('median', () => {
  it('returns null for empty input', () => {
    expect(median([])).toBeNull();
  });

  it('returns middle value for odd-length arrays', () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it('averages middle pair for even-length arrays', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe('ThroughputConfigSchema (SP-163)', () => {
  it('accepts valid throughput config', () => {
    expect(ThroughputConfigSchema.safeParse(DEFAULT_THROUGHPUT_CONFIG).success).toBe(true);
  });

  it('rejects non-positive window_size', () => {
    const result = ThroughputConfigSchema.safeParse({
      ...DEFAULT_THROUGHPUT_CONFIG,
      window_size: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive threshold_tps', () => {
    const result = ThroughputConfigSchema.safeParse({
      ...DEFAULT_THROUGHPUT_CONFIG,
      threshold_tps: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('createThroughputMeter (SP-163)', () => {
  it('uses default window size and threshold', () => {
    expect(DEFAULT_THROUGHPUT_METER_CONFIG.windowSize).toBe(DEFAULT_THROUGHPUT_CONFIG.window_size);
    expect(DEFAULT_THROUGHPUT_METER_CONFIG.thresholdTps).toBe(DEFAULT_THROUGHPUT_CONFIG.threshold_tps);
  });

  it('records samples via injectable store', () => {
    const store = makeMockStore();
    const meter = createThroughputMeter(
      { windowSize: 3, thresholdTps: 25 },
      store,
    );

    meter.recordSample(100, 2000);
    meter.recordSample(50, 2000);

    expect(store.pushed).toEqual([50, 25]);
    expect(meter.getSampleCount()).toBe(2);
  });

  it('ignores invalid samples', () => {
    const store = makeMockStore();
    const meter = createThroughputMeter({ windowSize: 3, thresholdTps: 25 }, store);

    meter.recordSample(100, 0);
    meter.recordSample(-5, 1000);

    expect(store.pushed).toEqual([]);
    expect(meter.getMedianTps()).toBeNull();
  });

  it('returns rolling median over last N samples', () => {
    const meter = createThroughputMeter({ windowSize: 3, thresholdTps: 25 });

    meter.recordSample(100, 1000);
    meter.recordSample(200, 1000);
    meter.recordSample(300, 1000);
    expect(meter.getMedianTps()).toBe(200);

    meter.recordSample(10, 1000);
    expect(meter.getMedianTps()).toBe(200);

    meter.recordSample(20, 1000);
    expect(meter.getMedianTps()).toBe(20);
  });

  it('reports above default threshold when median is high enough', () => {
    const meter = createThroughputMeter({ windowSize: 3, thresholdTps: 25 });

    meter.recordSample(30, 1000);
    meter.recordSample(30, 1000);
    meter.recordSample(30, 1000);

    expect(meter.isAboveThreshold()).toBe(true);
    expect(meter.isAboveThreshold(30)).toBe(true);
    expect(meter.isAboveThreshold(31)).toBe(false);
  });

  it('reports below threshold when median is too low', () => {
    const meter = createThroughputMeter({ windowSize: 3, thresholdTps: 25 });

    meter.recordSample(10, 1000);
    meter.recordSample(20, 1000);
    meter.recordSample(30, 1000);

    expect(meter.isAboveThreshold()).toBe(false);
  });

  it('returns false when no samples exist', () => {
    const meter = createThroughputMeter({ windowSize: 3, thresholdTps: 25 });
    expect(meter.isAboveThreshold()).toBe(false);
    expect(meter.getMedianTps()).toBeNull();
  });

  it('clears recorded samples', () => {
    const store = makeMockStore();
    const meter = createThroughputMeter({ windowSize: 3, thresholdTps: 25 }, store);

    meter.recordSample(100, 1000);
    meter.clear();

    expect(store.pushed).toEqual([]);
    expect(meter.getSampleCount()).toBe(0);
  });

  it('respects custom threshold argument', () => {
    const meter = createThroughputMeter({ windowSize: 1, thresholdTps: 25 });
    meter.recordSample(20, 1000);

    expect(meter.isAboveThreshold(15)).toBe(true);
    expect(meter.isAboveThreshold(25)).toBe(false);
  });

  it('delegates store pushes through RollingThroughputSampleStore window cap', () => {
    const meter = createThroughputMeter({ windowSize: 2, thresholdTps: 25 });

    meter.recordSample(10, 1000);
    meter.recordSample(20, 1000);
    meter.recordSample(30, 1000);

    expect(meter.getSampleCount()).toBe(2);
    expect(meter.getMedianTps()).toBe(25);
  });
});

describe('RollingThroughputSampleStore', () => {
  it('evicts oldest samples beyond window size', () => {
    const meter = createThroughputMeter({ windowSize: 2, thresholdTps: 25 });

    meter.recordSample(10, 1000);
    meter.recordSample(20, 1000);
    meter.recordSample(30, 1000);

    expect(meter.getMedianTps()).toBe(25);
  });
});
