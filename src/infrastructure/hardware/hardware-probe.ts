/**
 * Hardware probe — T044, FR-012.
 *
 * Three-state gate: inspects platform/arch, unified memory, and battery
 * to return `full_local`, `classification_only`, or `disabled`.
 *
 * Pure function of SystemInfo × config; side-effect-free for testability.
 * Default SystemInfo provider reads from Node.js `os` and platform-specific
 * power sources (macOS pmset, Linux /sys/class/power_supply, Windows WMI).
 */

import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Pure probe logic ────────────────────────────────────────────────────────

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

// ─── Platform-specific system info providers ───────────────────────────────

function parseBatteryInfo(output: string): {
  batteryLevel: number | null;
  isOnAcPower: boolean;
} {
  const pctMatch = /(\d+)%/.exec(output);
  const batteryLevel = pctMatch?.[1] !== undefined
    ? parseInt(pctMatch[1], 10)
    : null;
  const isOnAcPower = output.includes('AC Power');
  return { batteryLevel, isOnAcPower };
}

function readLinuxPowerInfo(): {
  batteryLevel: number | null;
  isOnAcPower: boolean | null;
} {
  const powerSupplyDir = '/sys/class/power_supply';
  if (!existsSync(powerSupplyDir)) {
    return { batteryLevel: null, isOnAcPower: true };
  }

  try {
    const entries = readdirSync(powerSupplyDir);
    let batteryLevel: number | null = null;
    let isOnAcPower: boolean | null = null;

    for (const name of entries) {
      const base = join(powerSupplyDir, name);
      const typePath = join(base, 'type');
      if (!existsSync(typePath)) {
        continue;
      }

      const type = readFileSync(typePath, 'utf8').trim();
      if (type !== 'Battery') {
        continue;
      }

      const capacityPath = join(base, 'capacity');
      if (existsSync(capacityPath)) {
        const capacity = parseInt(readFileSync(capacityPath, 'utf8').trim(), 10);
        if (!Number.isNaN(capacity)) {
          batteryLevel = capacity;
        }
      }

      const statusPath = join(base, 'status');
      if (existsSync(statusPath)) {
        const status = readFileSync(statusPath, 'utf8').trim();
        isOnAcPower = status === 'Charging' || status === 'Full' || status === 'Not charging';
      }
      break;
    }

    if (batteryLevel === null && isOnAcPower === null) {
      return { batteryLevel: null, isOnAcPower: true };
    }

    return { batteryLevel, isOnAcPower };
  } catch {
    return { batteryLevel: null, isOnAcPower: true };
  }
}

function buildBaseSystemInfo(): Pick<SystemInfo, 'totalMemoryGb' | 'arch' | 'platform'> {
  return {
    totalMemoryGb: os.totalmem() / 1024 ** 3,
    arch: os.arch(),
    platform: os.platform(),
  };
}

const macOsSystemInfoPort: SystemInfoPort = {
  async getSystemInfo(): Promise<SystemInfo> {
    let batteryLevel: number | null = null;
    let isOnAcPower: boolean | null = null;

    try {
      const output = execSync('pmset -g batt', {
        timeout: 2000,
        encoding: 'utf8',
      });
      const parsed = parseBatteryInfo(output);
      batteryLevel = parsed.batteryLevel;
      isOnAcPower = parsed.isOnAcPower;
    } catch {
      isOnAcPower = true;
    }

    return {
      ...buildBaseSystemInfo(),
      batteryLevel,
      isOnAcPower,
    };
  },
};

const linuxSystemInfoPort: SystemInfoPort = {
  async getSystemInfo(): Promise<SystemInfo> {
    const power = readLinuxPowerInfo();
    return {
      ...buildBaseSystemInfo(),
      batteryLevel: power.batteryLevel,
      isOnAcPower: power.isOnAcPower,
    };
  },
};

function readWindowsPowerInfo(): {
  batteryLevel: number | null;
  isOnAcPower: boolean | null;
} {
  try {
    const output = execSync(
      'powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1 EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress"',
      { timeout: 3000, encoding: 'utf8' },
    ).trim();

    if (!output) {
      return { batteryLevel: null, isOnAcPower: true };
    }

    const parsed = JSON.parse(output) as {
      EstimatedChargeRemaining?: number;
      BatteryStatus?: number;
    };

    const batteryLevel = typeof parsed.EstimatedChargeRemaining === 'number'
      ? parsed.EstimatedChargeRemaining
      : null;

    let isOnAcPower: boolean | null = null;
    if (typeof parsed.BatteryStatus === 'number') {
      // 1 = discharging; other values indicate AC/charging/full states.
      isOnAcPower = parsed.BatteryStatus !== 1;
    }

    if (batteryLevel === null && isOnAcPower === null) {
      return { batteryLevel: null, isOnAcPower: true };
    }

    return { batteryLevel, isOnAcPower };
  } catch {
    return { batteryLevel: null, isOnAcPower: true };
  }
}

const windowsSystemInfoPort: SystemInfoPort = {
  async getSystemInfo(): Promise<SystemInfo> {
    const power = readWindowsPowerInfo();
    return {
      ...buildBaseSystemInfo(),
      batteryLevel: power.batteryLevel,
      isOnAcPower: power.isOnAcPower,
    };
  },
};

const genericSystemInfoPort: SystemInfoPort = {
  async getSystemInfo(): Promise<SystemInfo> {
    return {
      ...buildBaseSystemInfo(),
      batteryLevel: null,
      isOnAcPower: null,
    };
  },
};

export function getDefaultSystemInfoPort(): SystemInfoPort {
  switch (os.platform()) {
    case 'darwin':
      return macOsSystemInfoPort;
    case 'linux':
      return linuxSystemInfoPort;
    case 'win32':
      return windowsSystemInfoPort;
    default:
      return genericSystemInfoPort;
  }
}

export async function getDefaultSystemInfo(): Promise<SystemInfo> {
  return getDefaultSystemInfoPort().getSystemInfo();
}

// ─── Convenience: probe with real system info ────────────────────────────────

export async function probeHardwareDefault(
  config: HardwareProbeConfig,
): Promise<HardwareProbeResult> {
  const info = await getDefaultSystemInfo();
  return probeHardware(config, info);
}
