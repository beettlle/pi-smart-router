import { describe, expect, it } from 'vitest';

import {
  probeHardware,
  type HardwareProbeConfig,
  type SystemInfo,
} from '../../src/infrastructure/hardware/hardware-probe.js';

const DEFAULT_CONFIG: HardwareProbeConfig = {
  min_memory_gb_full: 16,
  min_memory_gb_classification: 8,
  battery_threshold_pct: 20,
};

function makeSystemInfo(overrides?: Partial<SystemInfo>): SystemInfo {
  return {
    totalMemoryGb: 32,
    arch: 'arm64',
    platform: 'darwin',
    batteryLevel: 80,
    isOnAcPower: true,
    ...overrides,
  };
}

function makeLinuxSystemInfo(overrides?: Partial<SystemInfo>): SystemInfo {
  return makeSystemInfo({
    platform: 'linux',
    arch: 'x64',
    ...overrides,
  });
}

describe('probeHardware (T044, FR-012)', () => {
  describe('three-state gate', () => {
    it('returns full_local on Apple Silicon with sufficient memory', () => {
      const info = makeSystemInfo({ totalMemoryGb: 32 });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });

    it('returns full_local at exact min_memory_gb_full threshold', () => {
      const info = makeSystemInfo({ totalMemoryGb: 16 });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });

    it('returns classification_only when memory between classification and full thresholds', () => {
      const info = makeSystemInfo({ totalMemoryGb: 12 });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('classification_only');
    });

    it('returns classification_only at exact min_memory_gb_classification threshold', () => {
      const info = makeSystemInfo({ totalMemoryGb: 8 });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('classification_only');
    });

    it('returns disabled when memory below classification threshold', () => {
      const info = makeSystemInfo({ totalMemoryGb: 4 });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('disabled');
    });
  });

  describe('platform and architecture checks', () => {
    it('returns disabled on darwin x64', () => {
      const info = makeSystemInfo({ platform: 'darwin', arch: 'x64' });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('disabled');
    });

    it('returns disabled on non-arm64 darwin architecture', () => {
      const info = makeSystemInfo({ arch: 'x64' });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('disabled');
    });

    it('returns disabled on Windows x64', () => {
      const info = makeSystemInfo({ platform: 'win32', arch: 'x64' });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('disabled');
    });
  });

  describe('Linux platform matrix', () => {
    it('returns full_local on Linux x64 desktop with sufficient RAM on AC', () => {
      const info = makeLinuxSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: null,
        isOnAcPower: true,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });

    it('returns full_local on Linux arm64 with sufficient RAM on AC', () => {
      const info = makeLinuxSystemInfo({
        arch: 'arm64',
        totalMemoryGb: 32,
        batteryLevel: null,
        isOnAcPower: true,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });

    it('returns classification_only on Linux x64 with mid-range RAM on AC', () => {
      const info = makeLinuxSystemInfo({
        totalMemoryGb: 12,
        batteryLevel: null,
        isOnAcPower: true,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('classification_only');
    });

    it('returns disabled on Linux laptop on battery below threshold', () => {
      const info = makeLinuxSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: 10,
        isOnAcPower: false,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('disabled');
    });

    it('returns full_local on Linux laptop on battery at threshold', () => {
      const info = makeLinuxSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: 20,
        isOnAcPower: false,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });

    it('returns disabled on Linux with insufficient RAM', () => {
      const info = makeLinuxSystemInfo({
        totalMemoryGb: 4,
        batteryLevel: null,
        isOnAcPower: true,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('disabled');
    });
  });

  describe('battery and power state', () => {
    it('returns disabled when battery below threshold and not on AC power', () => {
      const info = makeSystemInfo({
        batteryLevel: 10,
        isOnAcPower: false,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('disabled');
    });

    it('returns full_local when battery low but on AC power', () => {
      const info = makeSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: 5,
        isOnAcPower: true,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });

    it('returns full_local when battery exactly at threshold and not on AC', () => {
      const info = makeSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: 20,
        isOnAcPower: false,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });

    it('returns disabled when battery one below threshold and not on AC', () => {
      const info = makeSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: 19,
        isOnAcPower: false,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('disabled');
    });

    it('returns full_local when battery info is null (desktop / unknown)', () => {
      const info = makeSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: null,
        isOnAcPower: null,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });

    it('returns full_local when isOnAcPower is null but battery is low', () => {
      const info = makeSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: 5,
        isOnAcPower: null,
      });
      expect(probeHardware(DEFAULT_CONFIG, info)).toBe('full_local');
    });
  });

  describe('custom config thresholds', () => {
    it('respects custom min_memory_gb_full', () => {
      const config: HardwareProbeConfig = {
        ...DEFAULT_CONFIG,
        min_memory_gb_full: 64,
      };
      const info = makeSystemInfo({ totalMemoryGb: 32 });
      expect(probeHardware(config, info)).toBe('classification_only');
    });

    it('respects custom battery_threshold_pct', () => {
      const config: HardwareProbeConfig = {
        ...DEFAULT_CONFIG,
        battery_threshold_pct: 50,
      };
      const info = makeSystemInfo({
        totalMemoryGb: 32,
        batteryLevel: 40,
        isOnAcPower: false,
      });
      expect(probeHardware(config, info)).toBe('disabled');
    });
  });
});
