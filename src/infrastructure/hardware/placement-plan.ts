/**
 * Local placement plan / doctor report — SP-216, #116 (Colibri plan/doctor analog).
 *
 * Builds a READ-ONLY operator report describing local placement readiness:
 * encoder resident status, local model warm/cold, RAM/disk constraints,
 * cold vs warm throughput, and a bottleneck guess. Never mutates routes,
 * pins, gates, or any runtime state.
 *
 * JSON-stable shape (schemaVersion 1): all keys always present; unknown
 * values are `null`, never omitted. Safe for automation.
 *
 * Quality-preserving policy: under resource pressure this module prefers
 * reporting "local unavailable / escalate safely" over silently weakening
 * encoder fidelity or inventing cheaper cascades.
 */

import { readdirSync, statfsSync } from 'node:fs';
import * as os from 'node:os';

import {
  getDefaultSystemInfoPort,
  probeHardware,
  type HardwareProbeConfig,
  type HardwareProbeResult,
  type SystemInfo,
  type SystemInfoPort,
} from './hardware-probe.js';
import {
  DEFAULT_LOCAL_CONFIG,
  defaultHttpFetch,
  pingLocalServices,
  type HttpFetchPort,
  type LocalReadinessResult,
  type LocalZeroTierConfig,
  type ServicePingResult,
} from '../local/local-zero-tier.js';
import {
  DEFAULT_LOCAL_VIABILITY_POLICY,
  DEFAULT_THROUGHPUT_THRESHOLD_TPS,
  type LocalViabilityPolicy,
  type ThroughputBreakdown,
  type ThroughputMeter,
} from './throughput-meter.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const PLACEMENT_PLAN_SCHEMA_VERSION = 1 as const;
export const PLACEMENT_PLAN_KIND = 'smart-router-placement-plan' as const;

/** Below this much free disk (GiB) the report flags disk as constrained. */
export const DISK_CONSTRAINED_FREE_GB = 2;

/**
 * Mirrors DEFAULT_OPERATOR_CONFIG.local; duplicated here so this module stays
 * a leaf import (no config/defaults dependency chain).
 */
export const DEFAULT_PLACEMENT_HARDWARE_CONFIG: Readonly<HardwareProbeConfig> = {
  min_memory_gb_full: 16,
  min_memory_gb_classification: 8,
  battery_threshold_pct: 20,
} as const;

export const DEFAULT_ENCODER_CACHE_PATH = '.pi-smart-router/models/';
export const DEFAULT_ENCODER_MODEL = 'Xenova/all-MiniLM-L6-v2';

export const QUALITY_POLICY_NOTES: readonly string[] = [
  'Under RAM/disk pressure the router reports local unavailable and escalates to a safe cloud default.',
  'Encoder fidelity is never silently weakened (no quantization flips, no cheaper cascades).',
  'Cold-only throughput windows fail closed: local viability requires warm samples.',
] as const;

// ─── Report types (JSON-stable) ──────────────────────────────────────────────

export type BottleneckGuess =
  | 'none'
  | 'unsupported-platform'
  | 'battery'
  | 'memory'
  | 'disk'
  | 'no-local-runtime'
  | 'cold-start'
  | 'cold-throughput'
  | 'warm-throughput';

export type PlacementRecommendation =
  | 'local-ready'
  | 'local-warmup-needed'
  | 'local-unavailable';

export interface PlacementPlanReport {
  readonly schemaVersion: typeof PLACEMENT_PLAN_SCHEMA_VERSION;
  readonly kind: typeof PLACEMENT_PLAN_KIND;
  readonly generatedAt: string;
  /** This report never mutates routing state. */
  readonly readOnly: true;
  readonly encoder: {
    readonly resident: boolean;
    readonly model: string;
    readonly cachePath: string;
    readonly detail: string;
  };
  readonly localModel: {
    /** A local model is loaded in LM Studio or Ollama right now. */
    readonly warm: boolean;
    /** Runtime reachable but no model loaded — first request pays load cost. */
    readonly coldStartExpected: boolean;
    readonly lmStudio: ServicePingResult;
    readonly ollama: ServicePingResult;
  };
  readonly hardware: {
    readonly platform: string;
    readonly arch: string;
    readonly totalMemoryGb: number;
    readonly freeMemoryGb: number | null;
    readonly probe: HardwareProbeResult;
    readonly batteryLevelPct: number | null;
    readonly isOnAcPower: boolean | null;
  };
  readonly disk: {
    readonly path: string;
    readonly freeGb: number | null;
    readonly constrained: boolean;
  };
  readonly throughput: {
    readonly classification: ThroughputBreakdown['classification'];
    readonly warmMedianTps: number | null;
    readonly coldMedianTps: number | null;
    readonly warmSamples: number;
    readonly coldSamples: number;
    readonly thresholdTps: number;
    readonly requireWarmSamples: boolean;
    readonly viable: boolean;
  };
  readonly bottleneck: {
    readonly guess: BottleneckGuess;
    readonly rationale: string;
  };
  readonly policy: {
    readonly qualityPreserving: true;
    readonly onResourcePressure: 'report-local-unavailable-and-escalate';
    readonly notes: readonly string[];
  };
  readonly recommendation: PlacementRecommendation;
}

// ─── Inputs / ports ──────────────────────────────────────────────────────────

export interface PlacementPlanInputs {
  readonly systemInfo: SystemInfo;
  readonly freeMemoryGb: number | null;
  readonly hardwareProbe: HardwareProbeResult;
  readonly hardwareConfig: HardwareProbeConfig;
  readonly localReadiness: LocalReadinessResult;
  readonly encoderResident: boolean;
  readonly encoderModel: string;
  readonly encoderCachePath: string;
  readonly diskPath: string;
  readonly diskFreeGb: number | null;
  readonly throughput: ThroughputBreakdown | null;
  readonly throughputThresholdTps: number;
  readonly viabilityPolicy: LocalViabilityPolicy;
  /** Injectable clock for deterministic tests. */
  readonly generatedAt?: string;
}

/** Port for filesystem / OS probes — injectable for tests. */
export interface PlacementPlanSystemPort {
  /** True when the directory exists and contains at least one entry. */
  dirHasEntries(path: string): boolean;
  /** Free disk in GiB for the filesystem containing path; null when unknown. */
  freeDiskGb(path: string): number | null;
  /** Free system memory in GiB. */
  freeMemoryGb(): number;
}

export const defaultPlacementPlanSystemPort: PlacementPlanSystemPort = {
  dirHasEntries(path: string): boolean {
    try {
      return readdirSync(path).length > 0;
    } catch {
      return false;
    }
  },
  freeDiskGb(path: string): number | null {
    try {
      const stats = statfsSync(path);
      return (stats.bavail * stats.bsize) / 1024 ** 3;
    } catch {
      return null;
    }
  },
  freeMemoryGb(): number {
    return os.freemem() / 1024 ** 3;
  },
};

// ─── Pure report builder ─────────────────────────────────────────────────────

const EMPTY_BREAKDOWN: ThroughputBreakdown = {
  warmMedianTps: null,
  coldMedianTps: null,
  warmSamples: 0,
  coldSamples: 0,
  classification: 'no-samples',
};

/** Cold/warm viability formula — see throughput-meter.ts docblock. */
export function isThroughputViable(
  breakdown: ThroughputBreakdown,
  thresholdTps: number,
  policy: LocalViabilityPolicy,
): boolean {
  if (breakdown.classification === 'no-samples') {
    return false;
  }
  if (breakdown.warmMedianTps !== null) {
    return breakdown.warmMedianTps >= thresholdTps;
  }
  if (policy.requireWarmSamples) {
    return false;
  }
  return breakdown.coldMedianTps !== null && breakdown.coldMedianTps >= thresholdTps;
}

function guessBottleneck(inputs: PlacementPlanInputs): PlacementPlanReport['bottleneck'] {
  const { systemInfo, hardwareProbe, hardwareConfig, localReadiness } = inputs;
  const breakdown = inputs.throughput ?? EMPTY_BREAKDOWN;

  if (hardwareProbe === 'disabled') {
    const supported =
      (systemInfo.platform === 'darwin' && systemInfo.arch === 'arm64') ||
      (systemInfo.platform === 'linux' && (systemInfo.arch === 'x64' || systemInfo.arch === 'arm64')) ||
      (systemInfo.platform === 'win32' && (systemInfo.arch === 'x64' || systemInfo.arch === 'arm64'));
    if (!supported) {
      return {
        guess: 'unsupported-platform',
        rationale: `Platform ${systemInfo.platform}/${systemInfo.arch} is not supported for local inference.`,
      };
    }
    if (
      systemInfo.isOnAcPower === false &&
      systemInfo.batteryLevel !== null &&
      systemInfo.batteryLevel < hardwareConfig.battery_threshold_pct
    ) {
      return {
        guess: 'battery',
        rationale: `Battery ${systemInfo.batteryLevel}% below threshold ${hardwareConfig.battery_threshold_pct}% while not on AC power.`,
      };
    }
    return {
      guess: 'memory',
      rationale: `Total memory ${systemInfo.totalMemoryGb.toFixed(1)} GiB below classification minimum ${hardwareConfig.min_memory_gb_classification} GiB.`,
    };
  }

  if (hardwareProbe === 'classification_only') {
    return {
      guess: 'memory',
      rationale: `Total memory ${systemInfo.totalMemoryGb.toFixed(1)} GiB below full-local minimum ${hardwareConfig.min_memory_gb_full} GiB; encoder classification only.`,
    };
  }

  if (inputs.diskFreeGb !== null && inputs.diskFreeGb < DISK_CONSTRAINED_FREE_GB) {
    return {
      guess: 'disk',
      rationale: `Only ${inputs.diskFreeGb.toFixed(1)} GiB free on ${inputs.diskPath} (warn below ${DISK_CONSTRAINED_FREE_GB} GiB).`,
    };
  }

  if (!localReadiness.lmStudio.available && !localReadiness.ollama.available) {
    return {
      guess: 'no-local-runtime',
      rationale: 'Neither LM Studio nor Ollama responded to readiness pings.',
    };
  }

  if (!localReadiness.anyModelReady) {
    return {
      guess: 'cold-start',
      rationale: 'Local runtime reachable but no model loaded; first request pays cold-start load cost.',
    };
  }

  if (breakdown.classification === 'cold-only') {
    return {
      guess: 'cold-throughput',
      rationale: 'Only cold throughput samples recorded; warm steady-state TPS is unverified.',
    };
  }

  if (
    breakdown.classification === 'warm' &&
    breakdown.warmMedianTps !== null &&
    breakdown.warmMedianTps < inputs.throughputThresholdTps
  ) {
    return {
      guess: 'warm-throughput',
      rationale: `Warm median ${breakdown.warmMedianTps.toFixed(1)} tok/s below threshold ${inputs.throughputThresholdTps} tok/s.`,
    };
  }

  return {
    guess: 'none',
    rationale: 'No placement bottleneck detected.',
  };
}

function deriveRecommendation(
  inputs: PlacementPlanInputs,
  viable: boolean,
): PlacementRecommendation {
  const breakdown = inputs.throughput ?? EMPTY_BREAKDOWN;

  if (inputs.hardwareProbe !== 'full_local') {
    return 'local-unavailable';
  }
  if (!inputs.localReadiness.lmStudio.available && !inputs.localReadiness.ollama.available) {
    return 'local-unavailable';
  }
  if (!inputs.localReadiness.anyModelReady) {
    return 'local-warmup-needed';
  }
  if (breakdown.classification === 'cold-only') {
    return 'local-warmup-needed';
  }
  if (breakdown.classification === 'warm' && !viable) {
    return 'local-unavailable';
  }
  return 'local-ready';
}

/**
 * Build the read-only placement report from already-collected inputs.
 * Pure: no I/O, no mutation — safe to call anywhere.
 */
export function buildPlacementPlan(inputs: PlacementPlanInputs): PlacementPlanReport {
  const breakdown = inputs.throughput ?? EMPTY_BREAKDOWN;
  const viable = isThroughputViable(
    breakdown,
    inputs.throughputThresholdTps,
    inputs.viabilityPolicy,
  );
  const diskConstrained =
    inputs.diskFreeGb !== null && inputs.diskFreeGb < DISK_CONSTRAINED_FREE_GB;

  return {
    schemaVersion: PLACEMENT_PLAN_SCHEMA_VERSION,
    kind: PLACEMENT_PLAN_KIND,
    generatedAt: inputs.generatedAt ?? new Date().toISOString(),
    readOnly: true,
    encoder: {
      resident: inputs.encoderResident,
      model: inputs.encoderModel,
      cachePath: inputs.encoderCachePath,
      detail: inputs.encoderResident
        ? 'Encoder ONNX artifacts present in cache; no download on first route.'
        : 'Encoder ONNX artifacts not found in cache; first route downloads weights.',
    },
    localModel: {
      warm: inputs.localReadiness.anyModelReady,
      coldStartExpected:
        (inputs.localReadiness.lmStudio.available || inputs.localReadiness.ollama.available) &&
        !inputs.localReadiness.anyModelReady,
      lmStudio: inputs.localReadiness.lmStudio,
      ollama: inputs.localReadiness.ollama,
    },
    hardware: {
      platform: inputs.systemInfo.platform,
      arch: inputs.systemInfo.arch,
      totalMemoryGb: inputs.systemInfo.totalMemoryGb,
      freeMemoryGb: inputs.freeMemoryGb,
      probe: inputs.hardwareProbe,
      batteryLevelPct: inputs.systemInfo.batteryLevel,
      isOnAcPower: inputs.systemInfo.isOnAcPower,
    },
    disk: {
      path: inputs.diskPath,
      freeGb: inputs.diskFreeGb,
      constrained: diskConstrained,
    },
    throughput: {
      classification: breakdown.classification,
      warmMedianTps: breakdown.warmMedianTps,
      coldMedianTps: breakdown.coldMedianTps,
      warmSamples: breakdown.warmSamples,
      coldSamples: breakdown.coldSamples,
      thresholdTps: inputs.throughputThresholdTps,
      requireWarmSamples: inputs.viabilityPolicy.requireWarmSamples,
      viable,
    },
    bottleneck: guessBottleneck(inputs),
    policy: {
      qualityPreserving: true,
      onResourcePressure: 'report-local-unavailable-and-escalate',
      notes: QUALITY_POLICY_NOTES,
    },
    recommendation: deriveRecommendation(inputs, viable),
  };
}

// ─── Collector (async, port-based) ───────────────────────────────────────────

export interface CollectPlacementPlanDeps {
  readonly systemInfoPort?: SystemInfoPort;
  readonly httpFetch?: HttpFetchPort;
  readonly localConfig?: LocalZeroTierConfig;
  readonly hardwareConfig?: HardwareProbeConfig;
  readonly throughputMeter?: ThroughputMeter;
  readonly viabilityPolicy?: LocalViabilityPolicy;
  readonly throughputThresholdTps?: number;
  readonly encoderModel?: string;
  readonly encoderCachePath?: string;
  readonly diskPath?: string;
  readonly systemPort?: PlacementPlanSystemPort;
  readonly now?: () => Date;
}

/**
 * Collect live placement inputs and build the report. Read-only: performs
 * readiness pings and filesystem stats only; never mutates routing state.
 */
export async function collectPlacementPlan(
  deps: CollectPlacementPlanDeps = {},
): Promise<PlacementPlanReport> {
  const systemPort = deps.systemPort ?? defaultPlacementPlanSystemPort;
  const hardwareConfig = deps.hardwareConfig ?? DEFAULT_PLACEMENT_HARDWARE_CONFIG;
  const encoderCachePath = deps.encoderCachePath ?? DEFAULT_ENCODER_CACHE_PATH;
  const diskPath = deps.diskPath ?? encoderCachePath;

  const systemInfoPort = deps.systemInfoPort ?? getDefaultSystemInfoPort();
  const systemInfo = await systemInfoPort.getSystemInfo();
  const localReadiness = await pingLocalServices(
    deps.localConfig ?? DEFAULT_LOCAL_CONFIG,
    deps.httpFetch ?? defaultHttpFetch,
  );

  return buildPlacementPlan({
    systemInfo,
    freeMemoryGb: systemPort.freeMemoryGb(),
    hardwareProbe: probeHardware(hardwareConfig, systemInfo),
    hardwareConfig,
    localReadiness,
    encoderResident: systemPort.dirHasEntries(encoderCachePath),
    encoderModel: deps.encoderModel ?? DEFAULT_ENCODER_MODEL,
    encoderCachePath,
    diskPath,
    diskFreeGb: systemPort.freeDiskGb(diskPath),
    throughput: deps.throughputMeter?.getBreakdown() ?? null,
    throughputThresholdTps: deps.throughputThresholdTps ?? DEFAULT_THROUGHPUT_THRESHOLD_TPS,
    viabilityPolicy: deps.viabilityPolicy ?? DEFAULT_LOCAL_VIABILITY_POLICY,
    ...(deps.now ? { generatedAt: deps.now().toISOString() } : {}),
  });
}
