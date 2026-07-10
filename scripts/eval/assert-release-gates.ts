#!/usr/bin/env node
/**
 * Release gate assertions on eval harness aggregate metrics — SP-165.
 *
 * Pure assertion helpers (testable) plus CLI entry for `--metrics`, `--fixtures`,
 * and `--config`. Exits 0 on pass, 1 with structured stderr listing failed gates.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import type { HarnessAggregateMetrics } from './harness-tracks.js';
import { runHarnessOnDir } from './run-harness.js';

export const RELEASE_GATES_CONFIG_VERSION = 1 as const;

export const AbsoluteGatesSchema = z.object({
  mean_capability_adequacy_rate_min: z.number().min(0).max(1),
  mean_quality_retention_min: z.number().min(0).max(1),
  mean_over_routing_rate_max: z.number().min(0).max(1),
  mean_pin_preserved_rate_min: z.number().min(0).max(1),
});

export const ReleaseGatesConfigSchema = z.object({
  version: z.literal(RELEASE_GATES_CONFIG_VERSION),
  absolute_gates: AbsoluteGatesSchema,
});

export type AbsoluteGates = z.infer<typeof AbsoluteGatesSchema>;
export type ReleaseGatesConfig = z.infer<typeof ReleaseGatesConfigSchema>;

export interface FailedGate {
  readonly gate: keyof AbsoluteGates;
  readonly actual: number;
  readonly threshold: number;
  readonly comparison: 'min' | 'max';
  readonly message: string;
}

export interface AssertAbsoluteGatesResult {
  readonly passed: boolean;
  readonly failed_gates: readonly FailedGate[];
}

export class ReleaseGatesError extends Error {
  override readonly name = 'ReleaseGatesError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const DEFAULT_CONFIG_PATH = resolve('config/release-gates.json');

function roundRate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Validate and parse release gate config JSON. */
export function loadReleaseGatesConfig(raw: unknown): ReleaseGatesConfig {
  const parsed = ReleaseGatesConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ReleaseGatesError(
      `invalid release-gates config: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  return parsed.data;
}

/** Load release gate config from a file path. */
export function loadReleaseGatesConfigFromFile(configPath: string): ReleaseGatesConfig {
  const abs = resolve(configPath);
  const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
  return loadReleaseGatesConfig(raw);
}

const HarnessMetricsInputSchema = z.object({
  tracks: z.object({
    capability: z.object({
      mean_capability_adequacy_rate: z.number(),
      mean_quality_retention: z.number(),
      mean_over_routing_rate: z.number(),
    }),
    continuity: z.object({
      mean_pin_preserved_rate: z.number(),
    }),
  }),
});

/** Parse harness aggregate metrics JSON (full or track-only subset). */
export function parseHarnessMetricsInput(raw: unknown): Pick<
  HarnessAggregateMetrics['tracks']['capability'],
  'mean_capability_adequacy_rate' | 'mean_quality_retention' | 'mean_over_routing_rate'
> &
  Pick<HarnessAggregateMetrics['tracks']['continuity'], 'mean_pin_preserved_rate'> {
  const parsed = HarnessMetricsInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ReleaseGatesError(
      `invalid harness metrics JSON: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  return {
    mean_capability_adequacy_rate: parsed.data.tracks.capability.mean_capability_adequacy_rate,
    mean_quality_retention: parsed.data.tracks.capability.mean_quality_retention,
    mean_over_routing_rate: parsed.data.tracks.capability.mean_over_routing_rate,
    mean_pin_preserved_rate: parsed.data.tracks.continuity.mean_pin_preserved_rate,
  };
}

/** Load harness metrics from a JSON file. */
export function loadHarnessMetricsFromFile(metricsPath: string): ReturnType<
  typeof parseHarnessMetricsInput
> {
  const abs = resolve(metricsPath);
  const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
  return parseHarnessMetricsInput(raw);
}

function checkMinGate(
  gate: keyof AbsoluteGates,
  actual: number,
  threshold: number,
  label: string,
): FailedGate | null {
  const roundedActual = roundRate(actual);
  if (roundedActual >= threshold) {
    return null;
  }
  return {
    gate,
    actual: roundedActual,
    threshold,
    comparison: 'min',
    message: `${label} ${roundedActual} < min ${threshold}`,
  };
}

function checkMaxGate(
  gate: keyof AbsoluteGates,
  actual: number,
  threshold: number,
  label: string,
): FailedGate | null {
  const roundedActual = roundRate(actual);
  if (roundedActual <= threshold) {
    return null;
  }
  return {
    gate,
    actual: roundedActual,
    threshold,
    comparison: 'max',
    message: `${label} ${roundedActual} > max ${threshold}`,
  };
}

/** Assert absolute release gates against harness aggregate track metrics. */
export function assertAbsoluteGates(
  metrics: Pick<
    HarnessAggregateMetrics['tracks']['capability'],
    'mean_capability_adequacy_rate' | 'mean_quality_retention' | 'mean_over_routing_rate'
  > &
    Pick<HarnessAggregateMetrics['tracks']['continuity'], 'mean_pin_preserved_rate'>,
  config: ReleaseGatesConfig,
): AssertAbsoluteGatesResult {
  const gates = config.absolute_gates;

  const checks: Array<FailedGate | null> = [
    checkMinGate(
      'mean_capability_adequacy_rate_min',
      metrics.mean_capability_adequacy_rate,
      gates.mean_capability_adequacy_rate_min,
      'mean_capability_adequacy_rate',
    ),
    checkMinGate(
      'mean_quality_retention_min',
      metrics.mean_quality_retention,
      gates.mean_quality_retention_min,
      'mean_quality_retention',
    ),
    checkMaxGate(
      'mean_over_routing_rate_max',
      metrics.mean_over_routing_rate,
      gates.mean_over_routing_rate_max,
      'mean_over_routing_rate',
    ),
    checkMinGate(
      'mean_pin_preserved_rate_min',
      metrics.mean_pin_preserved_rate,
      gates.mean_pin_preserved_rate_min,
      'mean_pin_preserved_rate',
    ),
  ];

  const failed_gates = checks.filter((entry): entry is FailedGate => entry !== null);

  return {
    passed: failed_gates.length === 0,
    failed_gates,
  };
}

/** Format failed gates as structured JSON for stderr. */
export function formatFailedGatesStderr(result: AssertAbsoluteGatesResult): string {
  return JSON.stringify(
    {
      release_gates_passed: result.passed,
      failed_gate_count: result.failed_gates.length,
      failed_gates: result.failed_gates.map((gate) => ({
        gate: gate.gate,
        actual: gate.actual,
        threshold: gate.threshold,
        comparison: gate.comparison,
        message: gate.message,
      })),
    },
    null,
    2,
  );
}

export interface AssertReleaseGatesOptions {
  readonly configPath?: string;
  readonly metricsPath?: string;
  readonly fixturesDir?: string;
}

/** Run release gate assertions from metrics file or fixtures directory. */
export function assertReleaseGates(options: AssertReleaseGatesOptions): AssertAbsoluteGatesResult {
  const config = loadReleaseGatesConfigFromFile(options.configPath ?? DEFAULT_CONFIG_PATH);

  let metrics: ReturnType<typeof parseHarnessMetricsInput>;

  if (options.metricsPath) {
    metrics = loadHarnessMetricsFromFile(options.metricsPath);
  } else if (options.fixturesDir) {
    const aggregate = runHarnessOnDir(options.fixturesDir);
    metrics = {
      mean_capability_adequacy_rate: aggregate.tracks.capability.mean_capability_adequacy_rate,
      mean_quality_retention: aggregate.tracks.capability.mean_quality_retention,
      mean_over_routing_rate: aggregate.tracks.capability.mean_over_routing_rate,
      mean_pin_preserved_rate: aggregate.tracks.continuity.mean_pin_preserved_rate,
    };
  } else {
    throw new ReleaseGatesError('either --metrics or --fixtures is required');
  }

  return assertAbsoluteGates(metrics, config);
}

interface ParsedCliArgs {
  readonly configPath: string;
  readonly metricsPath?: string | undefined;
  readonly fixturesDir?: string | undefined;
  readonly help?: boolean;
}

function parseArgs(argv: readonly string[]): ParsedCliArgs {
  let configPath = DEFAULT_CONFIG_PATH;
  let metricsPath: string | undefined;
  let fixturesDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' && argv[i + 1]) {
      configPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--metrics' && argv[i + 1]) {
      metricsPath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--fixtures' && argv[i + 1]) {
      fixturesDir = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      return { configPath, help: true };
    }
  }

  return { configPath, metricsPath, fixturesDir };
}

function usage(): void {
  console.error(`Usage: assert-release-gates (--metrics FILE | --fixtures DIR) [--config PATH]

Asserts eval harness aggregate metrics against versioned absolute release gates.
Exits 0 on pass, 1 with structured JSON on stderr when any gate fails.

Options:
  --metrics FILE    Harness aggregate metrics JSON (from routing:eval-harness)
  --fixtures DIR    Run harness on fixture directory, then assert
  --config PATH     Release gate config (default: config/release-gates.json)`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    usage();
    process.exit(0);
  }

  if (!parsed.metricsPath && !parsed.fixturesDir) {
    usage();
    process.exit(1);
  }

  const result = assertReleaseGates({
    configPath: parsed.configPath,
    ...(parsed.metricsPath ? { metricsPath: parsed.metricsPath } : {}),
    ...(parsed.fixturesDir ? { fixturesDir: parsed.fixturesDir } : {}),
  });

  if (result.passed) {
    console.log('release-gates: PASS');
    process.exit(0);
  }

  console.error(formatFailedGatesStderr(result));
  process.exit(1);
}

const isMain =
  import.meta.url === new URL(process.argv[1] ?? '', 'file:').href ||
  process.argv[1]?.endsWith('assert-release-gates.ts');

if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
