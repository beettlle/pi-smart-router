/**
 * Hardware probe — T044, FR-012.
 *
 * Three-state gate: inspects platform/arch, unified memory, and battery
 * to return `full_local`, `classification_only`, or `disabled`.
 *
 * SP-275 (#143 partial): the probe contracts and the pure three-state kernel
 * live in `domain/ports/hardware-probe-port.ts`; this module is the impure
 * adapter — platform-specific SystemInfo readers (Node `os`, macOS pmset,
 * Linux /sys/class/power_supply, Windows WMI) — and re-exports the domain
 * symbols for import-path stability.
 */

import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  probeHardware,
  type HardwareProbeConfig,
  type HardwareProbeResult,
  type SystemInfo,
  type SystemInfoPort,
} from '../../domain/ports/hardware-probe-port.js';

// ─── Domain-owned contracts (re-export; SP-275, #143) ────────────────────────

export type {
  HardwareProbeConfig,
  HardwareProbePort,
  HardwareProbeResult,
  SystemInfo,
  SystemInfoPort,
} from '../../domain/ports/hardware-probe-port.js';
export {
  defaultHardwareProbePort,
  probeHardware,
} from '../../domain/ports/hardware-probe-port.js';

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
