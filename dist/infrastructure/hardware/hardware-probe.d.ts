/**
 * Hardware probe — T044, FR-012.
 *
 * Three-state gate: inspects Apple Silicon, unified memory, and battery
 * to return `full_local`, `classification_only`, or `disabled`.
 *
 * Pure function of SystemInfo × config; side-effect-free for testability.
 * Default SystemInfo provider reads from Node.js `os` and macOS `pmset`.
 */
export type HardwareProbeResult = 'full_local' | 'classification_only' | 'disabled';
export interface HardwareProbeConfig {
    readonly min_memory_gb_full: number;
    readonly min_memory_gb_classification: number;
    readonly battery_threshold_pct: number;
}
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
export declare function probeHardware(config: HardwareProbeConfig, info: SystemInfo): HardwareProbeResult;
export declare function getDefaultSystemInfo(): Promise<SystemInfo>;
export declare function probeHardwareDefault(config: HardwareProbeConfig): Promise<HardwareProbeResult>;
//# sourceMappingURL=hardware-probe.d.ts.map
