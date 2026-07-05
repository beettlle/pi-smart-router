/**
 * Hardware probe — T044, FR-012.
 *
 * Three-state gate: inspects Apple Silicon, unified memory, and battery
 * to return `full_local`, `classification_only`, or `disabled`.
 *
 * Pure function of SystemInfo × config; side-effect-free for testability.
 * Default SystemInfo provider reads from Node.js `os` and macOS `pmset`.
 */
import * as os from 'node:os';
import { execSync } from 'node:child_process';
// ─── Pure probe logic ────────────────────────────────────────────────────────
export function probeHardware(config, info) {
    if (info.platform !== 'darwin' || info.arch !== 'arm64') {
        return 'disabled';
    }
    if (info.isOnAcPower === false &&
        info.batteryLevel !== null &&
        info.batteryLevel < config.battery_threshold_pct) {
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
// ─── Default system info provider ────────────────────────────────────────────
function parseBatteryInfo(output) {
    const pctMatch = /(\d+)%/.exec(output);
    const batteryLevel = pctMatch?.[1] !== undefined
        ? parseInt(pctMatch[1], 10)
        : null;
    const isOnAcPower = output.includes('AC Power');
    return { batteryLevel, isOnAcPower };
}
export async function getDefaultSystemInfo() {
    let batteryLevel = null;
    let isOnAcPower = null;
    if (os.platform() === 'darwin') {
        try {
            const output = execSync('pmset -g batt', {
                timeout: 2000,
                encoding: 'utf8',
            });
            const parsed = parseBatteryInfo(output);
            batteryLevel = parsed.batteryLevel;
            isOnAcPower = parsed.isOnAcPower;
        }
        catch {
            // Battery info unavailable — assume AC power (safe default per FR-022)
            isOnAcPower = true;
        }
    }
    return {
        totalMemoryGb: os.totalmem() / 1024 ** 3,
        arch: os.arch(),
        platform: os.platform(),
        batteryLevel,
        isOnAcPower,
    };
}
// ─── Convenience: probe with real system info ────────────────────────────────
export async function probeHardwareDefault(config) {
    const info = await getDefaultSystemInfo();
    return probeHardware(config, info);
}
//# sourceMappingURL=hardware-probe.js.map