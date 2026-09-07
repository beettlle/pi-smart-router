/**
 * Hardware capability ports (SP-275, #143 partial).
 *
 * Domain-owned contracts for hardware readiness probing and local-inference
 * throughput measurement. The pure three-state probe kernel lives here (it is
 * routing policy: which hardware qualifies for local dispatch); impure
 * adapters that read the host OS (memory, arch, battery via pmset//sys/WMI)
 * remain in `infrastructure/hardware/hardware-probe.ts` and re-export these
 * types for import-path stability.
 *
 * Dependency direction: domain owns the port; infrastructure implements.
 * `SystemInfoPort` is the injectable boundary for host system info.
 */

// ─── Probe types ─────────────────────────────────────────────────────────────

/** Three-state local dispatch gate result (T044, FR-012). */
export type HardwareProbeResult = 'full_local' | 'classification_only' | 'disabled';

/** Operator thresholds for the three-state hardware gate. */
export interface HardwareProbeConfig {
  readonly min_memory_gb_full: number;
  readonly min_memory_gb_classification: number;
  readonly battery_threshold_pct: number;
}

/** Host system snapshot consumed by the pure probe kernel. */
export interface SystemInfo {
  readonly totalMemoryGb: number;
  readonly arch: string;
  readonly platform: NodeJS.Platform;
  readonly batteryLevel: number | null;
  readonly isOnAcPower: boolean | null;
}

/** Port for dependency injection in tests. */
export interface SystemInfoPort {
  getSystemInfo(): Promise<SystemInfo>;
}

// ─── Pure probe kernel ───────────────────────────────────────────────────────

function isSupportedPlatform(info: SystemInfo): boolean {
  if (info.platform === 'darwin' && info.arch === 'arm64') {
    return true;
  }
  if (info.platform === 'linux' && (info.arch === 'x64' || info.arch === 'arm64')) {
    return true;
  }
  if (info.platform === 'win32' && (info.arch === 'x64' || info.arch === 'arm64')) {
    return true;
  }
  return false;
}

/**
 * Pure three-state hardware gate: operator config × system info → readiness.
 * Side-effect-free for testability; never performs I/O (SP-275 moved this
 * kernel from infrastructure — behavior identical).
 */
export function probeHardware(
  config: HardwareProbeConfig,
  info: SystemInfo,
): HardwareProbeResult {
  if (!isSupportedPlatform(info)) {
    return 'disabled';
  }

  if (
    info.isOnAcPower === false &&
    info.batteryLevel !== null &&
    info.batteryLevel < config.battery_threshold_pct
  ) {
    return 'disabled';
  }

  if (info.totalMemoryGb >= config.min_memory_gb_full) {
    return 'full_local';
  }

  if (info.totalMemoryGb >= config.min_memory_gb_classification) {
    return 'classification_only';
  }

  return 'disabled';
}

// ─── Probe port ──────────────────────────────────────────────────────────────

/** Port for the pure hardware probe kernel (SP-275, #143). */
export interface HardwareProbePort {
  /** Pure three-state gate: operator config × system info → readiness. */
  probe(config: HardwareProbeConfig, info: SystemInfo): HardwareProbeResult;
}

/**
 * Domain default probe adapter — the pure kernel itself. Infrastructure may
 * inject richer adapters via `PipelineOptions.hardwareProbe`.
 */
export const defaultHardwareProbePort: HardwareProbePort = {
  probe: probeHardware,
};

// ─── Throughput viability contracts (SP-163/SP-164, #84; SP-216, #116) ───────

/**
 * Cold vs warm sample phase.
 *
 * - `warm` — steady-state generation measured after model load. Only warm
 *   samples count toward local viability.
 * - `cold` — sample includes cold-start cost (model load, warmup). Cold
 *   samples under-state steady-state TPS and never count toward viability;
 *   they are reported separately as cold-start evidence.
 */
export type ThroughputSamplePhase = 'cold' | 'warm';

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

/**
 * Rolling local-throughput viability meter consumed by the routing pipeline
 * (`local_zero` dispatch gating, SP-164 #84). Infrastructure provides the
 * implementation (`createThroughputMeter`); the domain depends on this
 * interface only (SP-275).
 */
export interface ThroughputMeter {
  recordSample(tokens: number, durationMs: number, phase?: ThroughputSamplePhase): void;
  getMedianTps(phase?: ThroughputSamplePhase): number | null;
  isAboveThreshold(threshold?: number): boolean;
  getSampleCount(phase?: ThroughputSamplePhase): number;
  getBreakdown(): ThroughputBreakdown;
  isViable(policy?: LocalViabilityPolicy, threshold?: number): boolean;
  clear(): void;
}
