/**
 * Privacy-safe community-bench setup fingerprint — SP-194 / #105 Track A.
 *
 * Collects environment + fleet metadata without raw prompts, API keys,
 * endpoints, or plaintext model registry secrets. Fleet provider/id pairs
 * are hashed (SHA-256 of sorted `provider/id` lines).
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import { resolve } from 'node:path';

import { getCapabilitySource } from '../../src/config/pi-model-mapper.js';
import { loadModels } from '../../src/config/models-loader.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import {
  probeHardware,
  type HardwareProbeResult,
  type SystemInfo,
} from '../../src/infrastructure/hardware/hardware-probe.js';

/** TwinRouterBench upstream pin (matches tests/eval/corpus/twinrouterbench/PROVENANCE.md). */
export const TWINROUTERBENCH_PINNED_COMMIT =
  '430acecac71141de77afd8e5e13690d236d58e93' as const;

/** Vendored CI subset checksum (PROVENANCE.md). */
export const TWINROUTERBENCH_CI_SUBSET_SHA256 =
  'ec0b1e70709718956824b6d06092273a49171d48add019a15f2bc2772df1b265' as const;

export interface FleetIdEntry {
  readonly provider: string;
  readonly id: string;
  readonly tier: string;
}

export interface CapabilitySourcePct {
  readonly benchmark: number;
  readonly pattern_default: number;
}

export interface CorpusPins {
  readonly twinrouterbench_commit: string;
  readonly twinrouterbench_ci_subset_sha256: string;
  readonly catalog_freeze_date?: string;
  readonly benchmark_profiles_scrape_date?: string;
}

export interface SetupFingerprint {
  readonly package_version: string;
  readonly os: string;
  readonly arch: string;
  readonly node: string;
  readonly hardware_class: HardwareProbeResult;
  readonly fleet_hash: string;
  readonly fleet_size: number;
  readonly tier_counts: Readonly<Record<string, number>>;
  readonly capability_source_pct: CapabilitySourcePct;
  readonly encoder: string | null;
  readonly hydra_heads: string | null;
  readonly corpus_pins: CorpusPins;
}

export interface BuildFingerprintOptions {
  readonly packageVersion?: string;
  readonly modelsPath?: string;
  readonly fleet?: readonly FleetIdEntry[];
  readonly systemInfo?: SystemInfo;
  readonly hardwareClass?: HardwareProbeResult;
  readonly encoder?: string | null;
  readonly hydraHeads?: string | null;
  readonly catalogFreezeDate?: string;
  readonly benchmarkProfilesScrapeDate?: string;
  readonly capabilitySourceForId?: (modelId: string) => 'benchmark' | 'pattern_default';
}

/** Stable SHA-256 hex of sorted `provider/id` lines (no raw ids in the digest input order variance). */
export function hashFleetIds(entries: readonly FleetIdEntry[]): string {
  const lines = entries
    .map((e) => `${e.provider}/${e.id}`)
    .sort((a, b) => a.localeCompare(b));
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

/** Count models per tier label. */
export function countTiers(entries: readonly FleetIdEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.tier] = (counts[entry.tier] ?? 0) + 1;
  }
  return counts;
}

/**
 * Percent of fleet ids whose capability_source is benchmark vs pattern_default.
 * Rates are rounded to 4 decimal places; sum to 1 when fleet is non-empty.
 */
export function computeCapabilitySourcePct(
  modelIds: readonly string[],
  sourceForId: (modelId: string) => 'benchmark' | 'pattern_default' = getCapabilitySource,
): CapabilitySourcePct {
  if (modelIds.length === 0) {
    return { benchmark: 0, pattern_default: 0 };
  }
  let benchmark = 0;
  for (const id of modelIds) {
    if (sourceForId(id) === 'benchmark') {
      benchmark += 1;
    }
  }
  const benchmarkPct = Math.round((benchmark / modelIds.length) * 10_000) / 10_000;
  const patternPct = Math.round((1 - benchmarkPct) * 10_000) / 10_000;
  return { benchmark: benchmarkPct, pattern_default: patternPct };
}

function readPackageVersion(): string {
  try {
    const raw = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      version?: string;
    };
    return raw.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function readBenchmarkProfilesMeta(): {
  catalogFreezeDate?: string;
  scrapeDate?: string;
} {
  const path = resolve('config/benchmark-profiles.json');
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      provenance?: { catalog_freeze_date?: string; scrape_date?: string };
    };
    return {
      ...(raw.provenance?.catalog_freeze_date
        ? { catalogFreezeDate: raw.provenance.catalog_freeze_date }
        : {}),
      ...(raw.provenance?.scrape_date ? { scrapeDate: raw.provenance.scrape_date } : {}),
    };
  } catch {
    return {};
  }
}

function syncSystemInfo(): SystemInfo {
  return {
    totalMemoryGb: os.totalmem() / (1024 ** 3),
    arch: os.arch(),
    platform: os.platform(),
    batteryLevel: null,
    isOnAcPower: true,
  };
}

function loadFleetEntries(modelsPath?: string): FleetIdEntry[] {
  const candidates = [
    modelsPath,
    resolve('config/models.yaml'),
    resolve('config/models.yaml.example'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  for (const path of candidates) {
    if (!existsSync(path)) {
      continue;
    }
    try {
      const catalog = loadModels({ filePath: path });
      return catalog.models.map((m) => ({
        provider: m.provider,
        id: m.id,
        tier: m.tier,
      }));
    } catch {
      // try next candidate
    }
  }
  return [];
}

function readHydraMode(): { encoder: string | null; hydraHeads: string | null } {
  return {
    encoder: DEFAULT_OPERATOR_CONFIG.hydra.encoder,
    hydraHeads: DEFAULT_OPERATOR_CONFIG.hydra.hydra_heads,
  };
}

/** Build a privacy-safe setup fingerprint for community-bench reports. */
export function buildSetupFingerprint(options: BuildFingerprintOptions = {}): SetupFingerprint {
  const fleet = options.fleet ?? loadFleetEntries(options.modelsPath);
  const systemInfo = options.systemInfo ?? syncSystemInfo();
  const hardwareClass =
    options.hardwareClass ??
    probeHardware(
      {
        min_memory_gb_full: DEFAULT_OPERATOR_CONFIG.local.min_memory_gb_full,
        min_memory_gb_classification: DEFAULT_OPERATOR_CONFIG.local.min_memory_gb_classification,
        battery_threshold_pct: DEFAULT_OPERATOR_CONFIG.local.battery_threshold_pct,
      },
      systemInfo,
    );

  const hydra = readHydraMode();
  const profilesMeta = readBenchmarkProfilesMeta();
  const sourceForId = options.capabilitySourceForId ?? getCapabilitySource;

  const corpus_pins: CorpusPins = {
    twinrouterbench_commit: TWINROUTERBENCH_PINNED_COMMIT,
    twinrouterbench_ci_subset_sha256: TWINROUTERBENCH_CI_SUBSET_SHA256,
    ...(options.catalogFreezeDate ?? profilesMeta.catalogFreezeDate
      ? {
          catalog_freeze_date:
            options.catalogFreezeDate ?? profilesMeta.catalogFreezeDate,
        }
      : {}),
    ...(options.benchmarkProfilesScrapeDate ?? profilesMeta.scrapeDate
      ? {
          benchmark_profiles_scrape_date:
            options.benchmarkProfilesScrapeDate ?? profilesMeta.scrapeDate,
        }
      : {}),
  };

  return {
    package_version: options.packageVersion ?? readPackageVersion(),
    os: systemInfo.platform,
    arch: systemInfo.arch,
    node: process.version,
    hardware_class: hardwareClass,
    fleet_hash: hashFleetIds(fleet),
    fleet_size: fleet.length,
    tier_counts: countTiers(fleet),
    capability_source_pct: computeCapabilitySourcePct(
      fleet.map((e) => e.id),
      sourceForId,
    ),
    encoder: options.encoder !== undefined ? options.encoder : hydra.encoder,
    hydra_heads: options.hydraHeads !== undefined ? options.hydraHeads : hydra.hydraHeads,
    corpus_pins,
  };
}
