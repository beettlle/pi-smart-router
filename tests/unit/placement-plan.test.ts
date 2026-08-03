/**
 * Placement plan / doctor report + cold vs warm TPS — SP-216, #116.
 *
 * Covers: JSON-stable report schema, cold/warm throughput classification,
 * fail-closed viability policy, bottleneck guesses, recommendations, and
 * the async collector with stubbed ports.
 */

import { describe, expect, it } from 'vitest';

import {
  buildPlacementPlan,
  collectPlacementPlan,
  DISK_CONSTRAINED_FREE_GB,
  isThroughputViable,
  PLACEMENT_PLAN_KIND,
  PLACEMENT_PLAN_SCHEMA_VERSION,
  type PlacementPlanInputs,
  type PlacementPlanSystemPort,
} from '../../src/infrastructure/hardware/placement-plan.js';
import type { HardwareProbeResult } from '../../src/infrastructure/hardware/hardware-probe.js';
import {
  createThroughputMeter,
  DEFAULT_LOCAL_VIABILITY_POLICY,
} from '../../src/infrastructure/hardware/throughput-meter.js';
import type { LocalReadinessResult } from '../../src/infrastructure/local/local-zero-tier.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SYSTEM_INFO = {
  totalMemoryGb: 32,
  arch: 'arm64',
  platform: 'darwin' as const,
  batteryLevel: 90,
  isOnAcPower: true,
};

const HARDWARE_CONFIG = {
  min_memory_gb_full: 16,
  min_memory_gb_classification: 8,
  battery_threshold_pct: 20,
};

function readiness(overrides: Partial<LocalReadinessResult> = {}): LocalReadinessResult {
  return {
    lmStudio: { available: true, hasLoadedModel: true, latencyMs: 3 },
    ollama: { available: false, hasLoadedModel: false, latencyMs: 500 },
    anyModelReady: true,
    combinedLatencyMs: 500,
    ...overrides,
  };
}

function makeInputs(overrides: Partial<PlacementPlanInputs> = {}): PlacementPlanInputs {
  return {
    systemInfo: SYSTEM_INFO,
    freeMemoryGb: 20,
    hardwareProbe: 'full_local' as HardwareProbeResult,
    hardwareConfig: HARDWARE_CONFIG,
    localReadiness: readiness(),
    encoderResident: true,
    encoderModel: 'Xenova/all-MiniLM-L6-v2',
    encoderCachePath: '.pi-smart-router/models/',
    diskPath: '.pi-smart-router/models/',
    diskFreeGb: 100,
    throughput: null,
    throughputThresholdTps: 25,
    viabilityPolicy: DEFAULT_LOCAL_VIABILITY_POLICY,
    generatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

// ─── JSON-stable schema ──────────────────────────────────────────────────────

describe('placement plan report schema', () => {
  it('has a stable top-level and nested key shape', () => {
    const report = buildPlacementPlan(makeInputs());

    expect(Object.keys(report)).toEqual([
      'schemaVersion',
      'kind',
      'generatedAt',
      'readOnly',
      'encoder',
      'localModel',
      'hardware',
      'disk',
      'throughput',
      'bottleneck',
      'policy',
      'recommendation',
    ]);
    expect(report.schemaVersion).toBe(PLACEMENT_PLAN_SCHEMA_VERSION);
    expect(report.kind).toBe(PLACEMENT_PLAN_KIND);
    expect(report.readOnly).toBe(true);
    expect(Object.keys(report.encoder)).toEqual(['resident', 'model', 'cachePath', 'detail']);
    expect(Object.keys(report.localModel)).toEqual([
      'warm',
      'coldStartExpected',
      'lmStudio',
      'ollama',
    ]);
    expect(Object.keys(report.hardware)).toEqual([
      'platform',
      'arch',
      'totalMemoryGb',
      'freeMemoryGb',
      'probe',
      'batteryLevelPct',
      'isOnAcPower',
    ]);
    expect(Object.keys(report.disk)).toEqual(['path', 'freeGb', 'constrained']);
    expect(Object.keys(report.throughput)).toEqual([
      'classification',
      'warmMedianTps',
      'coldMedianTps',
      'warmSamples',
      'coldSamples',
      'thresholdTps',
      'requireWarmSamples',
      'viable',
    ]);
    expect(Object.keys(report.bottleneck)).toEqual(['guess', 'rationale']);
    expect(Object.keys(report.policy)).toEqual([
      'qualityPreserving',
      'onResourcePressure',
      'notes',
    ]);
  });

  it('survives a JSON round-trip unchanged (nulls, never undefined)', () => {
    const report = buildPlacementPlan(
      makeInputs({ freeMemoryGb: null, diskFreeGb: null, throughput: null }),
    );
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(report.hardware.freeMemoryGb).toBeNull();
    expect(report.disk.freeGb).toBeNull();
    expect(report.throughput.warmMedianTps).toBeNull();
  });

  it('declares the quality-preserving resource policy', () => {
    const report = buildPlacementPlan(makeInputs());
    expect(report.policy.qualityPreserving).toBe(true);
    expect(report.policy.onResourcePressure).toBe('report-local-unavailable-and-escalate');
    expect(report.policy.notes.length).toBeGreaterThan(0);
  });
});

// ─── Cold vs warm TPS classification ─────────────────────────────────────────

describe('cold vs warm TPS classification', () => {
  it('classifies mixed windows and computes per-phase medians', () => {
    const meter = createThroughputMeter({ windowSize: 10, thresholdTps: 25 });
    meter.recordSample(100, 4000, 'warm'); // 25 tps warm
    meter.recordSample(100, 2000, 'warm'); // 50 tps warm
    meter.recordSample(100, 20000, 'cold'); // 5 tps cold

    const breakdown = meter.getBreakdown();
    expect(breakdown.classification).toBe('warm');
    expect(breakdown.warmSamples).toBe(2);
    expect(breakdown.coldSamples).toBe(1);
    expect(breakdown.warmMedianTps).toBeCloseTo(37.5);
    expect(breakdown.coldMedianTps).toBeCloseTo(5);
    expect(meter.getMedianTps('warm')).toBeCloseTo(37.5);
    expect(meter.getMedianTps('cold')).toBeCloseTo(5);
    expect(meter.getSampleCount('warm')).toBe(2);
    expect(meter.getSampleCount('cold')).toBe(1);
    // Untagged median keeps legacy behavior (all samples).
    expect(meter.getSampleCount()).toBe(3);
  });

  it('treats untagged recordSample calls as warm (pipeline post-load measurements)', () => {
    const meter = createThroughputMeter({ windowSize: 10, thresholdTps: 25 });
    meter.recordSample(100, 4000);
    expect(meter.getBreakdown()).toMatchObject({
      classification: 'warm',
      warmSamples: 1,
      coldSamples: 0,
    });
  });

  it('reports cold-only when no warm samples exist', () => {
    const meter = createThroughputMeter({ windowSize: 10, thresholdTps: 25 });
    meter.recordSample(100, 10000, 'cold');
    const breakdown = meter.getBreakdown();
    expect(breakdown.classification).toBe('cold-only');
    expect(breakdown.warmMedianTps).toBeNull();
  });

  it('fails closed on cold-only windows by default (requireWarmSamples)', () => {
    const meter = createThroughputMeter({ windowSize: 10, thresholdTps: 25 });
    meter.recordSample(100, 1000, 'cold'); // 100 tps cold — fast but cold
    expect(meter.isViable()).toBe(false);
    expect(
      isThroughputViable(meter.getBreakdown(), 25, DEFAULT_LOCAL_VIABILITY_POLICY),
    ).toBe(false);
  });

  it('allows cold-only medians only when policy opts out of requireWarmSamples', () => {
    const meter = createThroughputMeter({ windowSize: 10, thresholdTps: 25 });
    meter.recordSample(100, 1000, 'cold'); // 100 tps cold
    expect(meter.isViable({ requireWarmSamples: false })).toBe(true);
    meter.clear();
    meter.recordSample(100, 10000, 'cold'); // 10 tps cold
    expect(meter.isViable({ requireWarmSamples: false })).toBe(false);
  });

  it('fails closed with no samples and evaluates warm medians against threshold', () => {
    const meter = createThroughputMeter({ windowSize: 10, thresholdTps: 25 });
    expect(meter.isViable()).toBe(false);
    meter.recordSample(100, 10000, 'warm'); // 10 tps warm
    expect(meter.isViable()).toBe(false);
    meter.recordSample(100, 1000, 'warm'); // 100 tps warm → median 55
    expect(meter.isViable()).toBe(true);
  });
});

// ─── Bottleneck guess + recommendation ───────────────────────────────────────

describe('bottleneck guess and recommendation', () => {
  it('reports none + local-ready on a healthy warm system', () => {
    const report = buildPlacementPlan(makeInputs());
    expect(report.bottleneck.guess).toBe('none');
    expect(report.recommendation).toBe('local-ready');
    expect(report.localModel.warm).toBe(true);
    expect(report.localModel.coldStartExpected).toBe(false);
  });

  it('flags unsupported platforms', () => {
    const report = buildPlacementPlan(
      makeInputs({
        systemInfo: { ...SYSTEM_INFO, platform: 'freebsd' as never },
        hardwareProbe: 'disabled',
      }),
    );
    expect(report.bottleneck.guess).toBe('unsupported-platform');
    expect(report.recommendation).toBe('local-unavailable');
  });

  it('flags battery pressure when discharging below threshold', () => {
    const report = buildPlacementPlan(
      makeInputs({
        systemInfo: { ...SYSTEM_INFO, batteryLevel: 10, isOnAcPower: false },
        hardwareProbe: 'disabled',
      }),
    );
    expect(report.bottleneck.guess).toBe('battery');
    expect(report.recommendation).toBe('local-unavailable');
  });

  it('flags memory for classification_only probes', () => {
    const report = buildPlacementPlan(
      makeInputs({
        systemInfo: { ...SYSTEM_INFO, totalMemoryGb: 12 },
        hardwareProbe: 'classification_only',
      }),
    );
    expect(report.bottleneck.guess).toBe('memory');
    expect(report.recommendation).toBe('local-unavailable');
  });

  it('flags constrained disk before runtime checks', () => {
    const report = buildPlacementPlan(
      makeInputs({ diskFreeGb: DISK_CONSTRAINED_FREE_GB - 0.5 }),
    );
    expect(report.bottleneck.guess).toBe('disk');
    expect(report.disk.constrained).toBe(true);
  });

  it('flags missing local runtime as unavailable', () => {
    const report = buildPlacementPlan(
      makeInputs({
        localReadiness: readiness({
          lmStudio: { available: false, hasLoadedModel: false, latencyMs: 500 },
          anyModelReady: false,
        }),
      }),
    );
    expect(report.bottleneck.guess).toBe('no-local-runtime');
    expect(report.recommendation).toBe('local-unavailable');
  });

  it('flags cold-start when runtime is up but no model is loaded', () => {
    const report = buildPlacementPlan(
      makeInputs({
        localReadiness: readiness({
          lmStudio: { available: true, hasLoadedModel: false, latencyMs: 3 },
          anyModelReady: false,
        }),
      }),
    );
    expect(report.bottleneck.guess).toBe('cold-start');
    expect(report.recommendation).toBe('local-warmup-needed');
    expect(report.localModel.coldStartExpected).toBe(true);
  });

  it('flags cold-only throughput windows as warmup-needed', () => {
    const report = buildPlacementPlan(
      makeInputs({
        throughput: {
          warmMedianTps: null,
          coldMedianTps: 8,
          warmSamples: 0,
          coldSamples: 3,
          classification: 'cold-only',
        },
      }),
    );
    expect(report.bottleneck.guess).toBe('cold-throughput');
    expect(report.recommendation).toBe('local-warmup-needed');
    expect(report.throughput.viable).toBe(false);
  });

  it('flags slow warm throughput as unavailable (escalate safely)', () => {
    const report = buildPlacementPlan(
      makeInputs({
        throughput: {
          warmMedianTps: 10,
          coldMedianTps: null,
          warmSamples: 5,
          coldSamples: 0,
          classification: 'warm',
        },
      }),
    );
    expect(report.bottleneck.guess).toBe('warm-throughput');
    expect(report.recommendation).toBe('local-unavailable');
    expect(report.throughput.viable).toBe(false);
  });

  it('marks viable when warm median clears the threshold', () => {
    const report = buildPlacementPlan(
      makeInputs({
        throughput: {
          warmMedianTps: 40,
          coldMedianTps: null,
          warmSamples: 5,
          coldSamples: 0,
          classification: 'warm',
        },
      }),
    );
    expect(report.throughput.viable).toBe(true);
    expect(report.recommendation).toBe('local-ready');
  });
});

// ─── Collector with stubbed ports ────────────────────────────────────────────

describe('collectPlacementPlan', () => {
  const stubSystemPort: PlacementPlanSystemPort = {
    dirHasEntries: () => true,
    freeDiskGb: () => 50,
    freeMemoryGb: () => 18,
  };

  it('assembles a report from injected ports without real I/O', async () => {
    const meter = createThroughputMeter({ windowSize: 10, thresholdTps: 25 });
    meter.recordSample(100, 2000, 'warm'); // 50 tps warm

    const report = await collectPlacementPlan({
      systemInfoPort: { getSystemInfo: async () => SYSTEM_INFO },
      httpFetch: {
        fetch: async (url) => ({
          ok: true,
          json: async () => (url.includes('1234') ? { data: [{}] } : { models: [] }),
        }),
      },
      localConfig: {
        lmStudioBaseUrl: 'http://127.0.0.1:1234',
        ollamaBaseUrl: 'http://127.0.0.1:11434',
        pingTimeoutMs: 100,
      },
      throughputMeter: meter,
      systemPort: stubSystemPort,
      now: () => new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(report.generatedAt).toBe('2026-08-03T00:00:00.000Z');
    expect(report.encoder.resident).toBe(true);
    expect(report.hardware.probe).toBe('full_local');
    expect(report.hardware.freeMemoryGb).toBe(18);
    expect(report.localModel.warm).toBe(true);
    expect(report.throughput.classification).toBe('warm');
    expect(report.throughput.viable).toBe(true);
    expect(report.recommendation).toBe('local-ready');
  });

  it('reports no-samples honestly when no meter is wired', async () => {
    const report = await collectPlacementPlan({
      systemInfoPort: { getSystemInfo: async () => SYSTEM_INFO },
      httpFetch: {
        fetch: async () => ({ ok: true, json: async () => ({ data: [{}] }) }),
      },
      systemPort: stubSystemPort,
    });

    expect(report.throughput.classification).toBe('no-samples');
    expect(report.throughput.viable).toBe(false);
  });
});
