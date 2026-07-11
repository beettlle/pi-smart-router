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

import { resolveBaselinePath } from './capture-baseline.js';
import type { HarnessAggregateMetrics } from './harness-tracks.js';
import {
  computeQualityRetentionRegression,
  DEFAULT_QR_REGRESSION_THRESHOLD,
} from './quality-retention.js';
import { runHarnessOnDir } from './run-harness.js';

export const RELEASE_GATES_CONFIG_VERSION = 1 as const;

export const AbsoluteGatesSchema = z.object({
  mean_capability_adequacy_rate_min: z.number().min(0).max(1),
  mean_quality_retention_min: z.number().min(0).max(1),
  mean_over_routing_rate_max: z.number().min(0).max(1),
  mean_pin_preserved_rate_min: z.number().min(0).max(1),
});

export const BaselineRegressionGatesSchema = z.object({
  reference_version: z.string().min(1),
  max_quality_retention_drop: z.number().min(0).max(1).optional(),
  max_capability_adequacy_rate_drop: z.number().min(0).max(1).optional(),
  max_pin_preserved_rate_drop: z.number().min(0).max(1).optional(),
  max_over_routing_rate_increase: z.number().min(0).max(1).optional(),
});

export const ReleaseGatesConfigSchema = z.object({
  version: z.literal(RELEASE_GATES_CONFIG_VERSION),
  absolute_gates: AbsoluteGatesSchema,
  baseline_regression: BaselineRegressionGatesSchema.optional(),
});

export type AbsoluteGates = z.infer<typeof AbsoluteGatesSchema>;
export type BaselineRegressionGates = z.infer<typeof BaselineRegressionGatesSchema>;
export type ReleaseGatesConfig = z.infer<typeof ReleaseGatesConfigSchema>;

export type HarnessGateMetrics = Pick<
  HarnessAggregateMetrics['tracks']['capability'],
  'mean_capability_adequacy_rate' | 'mean_quality_retention' | 'mean_over_routing_rate'
> &
  Pick<HarnessAggregateMetrics['tracks']['continuity'], 'mean_pin_preserved_rate'>;

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

export type BaselineRegressionGate =
  | 'max_quality_retention_drop'
  | 'max_capability_adequacy_rate_drop'
  | 'max_pin_preserved_rate_drop'
  | 'max_over_routing_rate_increase';

export interface FailedBaselineGate {
  readonly gate: BaselineRegressionGate;
  readonly baseline_value: number;
  readonly current_value: number;
  readonly delta: number;
  readonly threshold: number;
  readonly message: string;
}

export interface AssertBaselineRegressionResult {
  readonly passed: boolean;
  readonly reference_version: string;
  readonly failed_gates: readonly FailedBaselineGate[];
}

export interface AssertReleaseGatesResult {
  readonly passed: boolean;
  readonly absolute_gates: AssertAbsoluteGatesResult;
  readonly baseline_regression?: AssertBaselineRegressionResult;
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
export function parseHarnessMetricsInput(raw: unknown): HarnessGateMetrics {
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
  metrics: HarnessGateMetrics,
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

function checkBaselineMinDrop(
  gate: Extract<
    BaselineRegressionGate,
    'max_quality_retention_drop' | 'max_capability_adequacy_rate_drop' | 'max_pin_preserved_rate_drop'
  >,
  baselineValue: number,
  currentValue: number,
  threshold: number,
  label: string,
): FailedBaselineGate | null {
  const delta = Math.max(0, baselineValue - currentValue);
  if (delta <= threshold) {
    return null;
  }
  return {
    gate,
    baseline_value: roundRate(baselineValue),
    current_value: roundRate(currentValue),
    delta: roundRate(delta),
    threshold,
    message: `${label} dropped ${roundRate(delta)} > max ${threshold} (baseline ${roundRate(baselineValue)}, current ${roundRate(currentValue)})`,
  };
}

function checkBaselineMaxIncrease(
  gate: 'max_over_routing_rate_increase',
  baselineValue: number,
  currentValue: number,
  threshold: number,
  label: string,
): FailedBaselineGate | null {
  const delta = Math.max(0, currentValue - baselineValue);
  if (delta <= threshold) {
    return null;
  }
  return {
    gate,
    baseline_value: roundRate(baselineValue),
    current_value: roundRate(currentValue),
    delta: roundRate(delta),
    threshold,
    message: `${label} increased ${roundRate(delta)} > max ${threshold} (baseline ${roundRate(baselineValue)}, current ${roundRate(currentValue)})`,
  };
}

/** Assert semver baseline regression gates against a frozen harness snapshot. */
export function assertBaselineRegression(
  current: HarnessGateMetrics,
  baseline: HarnessGateMetrics,
  gates: BaselineRegressionGates,
): AssertBaselineRegressionResult {
  const qrThreshold = gates.max_quality_retention_drop ?? DEFAULT_QR_REGRESSION_THRESHOLD;
  const qrCheck = computeQualityRetentionRegression({
    shadowQualityRetention: current.mean_quality_retention,
    baselineQualityRetention: baseline.mean_quality_retention,
    regressionThreshold: qrThreshold,
  });

  const checks: Array<FailedBaselineGate | null> = [
    qrCheck.quality_regressed
      ? {
          gate: 'max_quality_retention_drop',
          baseline_value: roundRate(qrCheck.baseline_quality_retention),
          current_value: roundRate(qrCheck.shadow_quality_retention),
          delta: roundRate(qrCheck.regression_delta),
          threshold: qrThreshold,
          message: `mean_quality_retention dropped ${roundRate(qrCheck.regression_delta)} > max ${qrThreshold} (baseline ${roundRate(qrCheck.baseline_quality_retention)}, current ${roundRate(qrCheck.shadow_quality_retention)})`,
        }
      : null,
  ];

  if (gates.max_capability_adequacy_rate_drop !== undefined) {
    checks.push(
      checkBaselineMinDrop(
        'max_capability_adequacy_rate_drop',
        baseline.mean_capability_adequacy_rate,
        current.mean_capability_adequacy_rate,
        gates.max_capability_adequacy_rate_drop,
        'mean_capability_adequacy_rate',
      ),
    );
  }

  if (gates.max_pin_preserved_rate_drop !== undefined) {
    checks.push(
      checkBaselineMinDrop(
        'max_pin_preserved_rate_drop',
        baseline.mean_pin_preserved_rate,
        current.mean_pin_preserved_rate,
        gates.max_pin_preserved_rate_drop,
        'mean_pin_preserved_rate',
      ),
    );
  }

  if (gates.max_over_routing_rate_increase !== undefined) {
    checks.push(
      checkBaselineMaxIncrease(
        'max_over_routing_rate_increase',
        baseline.mean_over_routing_rate,
        current.mean_over_routing_rate,
        gates.max_over_routing_rate_increase,
        'mean_over_routing_rate',
      ),
    );
  }

  const failed_gates = checks.filter((entry): entry is FailedBaselineGate => entry !== null);

  return {
    passed: failed_gates.length === 0,
    reference_version: gates.reference_version,
    failed_gates,
  };
}

/** Load baseline harness metrics from a versioned snapshot file. */
export function loadBaselineMetricsFromVersion(version: string, baselinesDir?: string): HarnessGateMetrics {
  const baselinePath = resolveBaselinePath(version, baselinesDir);
  return loadHarnessMetricsFromFile(baselinePath);
}

/** Format failed gates as structured JSON for stderr. */
export function formatFailedGatesStderr(result: AssertReleaseGatesResult): string {
  return JSON.stringify(
    {
      release_gates_passed: result.passed,
      absolute_gates_passed: result.absolute_gates.passed,
      failed_absolute_gate_count: result.absolute_gates.failed_gates.length,
      failed_absolute_gates: result.absolute_gates.failed_gates.map((gate) => ({
        gate: gate.gate,
        actual: gate.actual,
        threshold: gate.threshold,
        comparison: gate.comparison,
        message: gate.message,
      })),
      ...(result.baseline_regression
        ? {
            baseline_regression_passed: result.baseline_regression.passed,
            baseline_reference_version: result.baseline_regression.reference_version,
            failed_baseline_gate_count: result.baseline_regression.failed_gates.length,
            failed_baseline_gates: result.baseline_regression.failed_gates.map((gate) => ({
              gate: gate.gate,
              baseline_value: gate.baseline_value,
              current_value: gate.current_value,
              delta: gate.delta,
              threshold: gate.threshold,
              message: gate.message,
            })),
          }
        : {}),
    },
    null,
    2,
  );
}

export interface AssertReleaseGatesOptions {
  readonly configPath?: string;
  readonly metricsPath?: string;
  readonly fixturesDir?: string;
  readonly baselinePath?: string;
  readonly baselineVersion?: string;
  /** When true, print gate results but always exit 0 (corpus soft-feed / #95). */
  readonly reportOnly?: boolean;
}

/** Run release gate assertions from metrics file or fixtures directory. */
export function assertReleaseGates(options: AssertReleaseGatesOptions): AssertReleaseGatesResult {
  const config = loadReleaseGatesConfigFromFile(options.configPath ?? DEFAULT_CONFIG_PATH);

  let metrics: HarnessGateMetrics;

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

  const absolute_gates = assertAbsoluteGates(metrics, config);

  let baseline_regression: AssertBaselineRegressionResult | undefined;
  const baselineGates = config.baseline_regression;
  const baselineVersion = options.baselineVersion ?? baselineGates?.reference_version;

  if (baselineGates && baselineVersion) {
    const baselineMetrics = options.baselinePath
      ? loadHarnessMetricsFromFile(options.baselinePath)
      : loadBaselineMetricsFromVersion(baselineVersion);

    baseline_regression = assertBaselineRegression(metrics, baselineMetrics, {
      ...baselineGates,
      reference_version: baselineVersion,
    });
  }

  const passed =
    absolute_gates.passed && (baseline_regression === undefined || baseline_regression.passed);

  return {
    passed,
    absolute_gates,
    ...(baseline_regression ? { baseline_regression } : {}),
  };
}

interface ParsedCliArgs {
  readonly configPath: string;
  readonly metricsPath?: string | undefined;
  readonly fixturesDir?: string | undefined;
  readonly baselinePath?: string | undefined;
  readonly baselineVersion?: string | undefined;
  readonly reportOnly?: boolean;
  readonly help?: boolean;
}

/** Parse CLI argv for assert-release-gates (exported for unit tests). */
export function parseAssertReleaseGatesArgs(argv: readonly string[]): ParsedCliArgs {
  let configPath = DEFAULT_CONFIG_PATH;
  let metricsPath: string | undefined;
  let fixturesDir: string | undefined;
  let baselinePath: string | undefined;
  let baselineVersion: string | undefined;
  let reportOnly = false;

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
    } else if (arg === '--baseline' && argv[i + 1]) {
      baselinePath = resolve(argv[i + 1]!);
      i += 1;
    } else if (arg === '--baseline-version' && argv[i + 1]) {
      baselineVersion = argv[i + 1]!;
      i += 1;
    } else if (arg === '--report-only') {
      reportOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      return { configPath, help: true };
    }
  }

  return { configPath, metricsPath, fixturesDir, baselinePath, baselineVersion, reportOnly };
}

function usage(): void {
  console.error(`Usage: assert-release-gates (--metrics FILE | --fixtures DIR) [--config PATH] [--baseline FILE | --baseline-version VERSION] [--report-only]

Asserts eval harness aggregate metrics against versioned absolute release gates.
Optional baseline regression compares current metrics to a frozen semver snapshot.
Exits 0 on pass, 1 with structured JSON on stderr when any gate fails.
With --report-only, always exits 0 and prints PASS/FAIL plus failed-gate JSON (corpus soft-feed).

Options:
  --metrics FILE           Harness aggregate metrics JSON (from routing:eval-harness)
  --fixtures DIR           Run harness on fixture directory, then assert
  --config PATH            Release gate config (default: config/release-gates.json)
  --baseline FILE          Frozen baseline metrics JSON for regression compare
  --baseline-version VER   Baseline file version (default: tests/eval/baselines/v{VER}.json)
  --report-only            Print gate outcome without failing the process (SP-188 / #95)`);
}

async function main(): Promise<void> {
  const parsed = parseAssertReleaseGatesArgs(process.argv.slice(2));
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
    ...(parsed.baselinePath ? { baselinePath: parsed.baselinePath } : {}),
    ...(parsed.baselineVersion ? { baselineVersion: parsed.baselineVersion } : {}),
    ...(parsed.reportOnly ? { reportOnly: true } : {}),
  });

  if (result.passed) {
    const baselineNote = result.baseline_regression
      ? ` (baseline v${result.baseline_regression.reference_version})`
      : '';
    console.log(`release-gates: PASS${baselineNote}`);
    process.exit(0);
  }

  if (parsed.reportOnly) {
    console.log('release-gates: FAIL (report-only; exit 0)');
    console.log(formatFailedGatesStderr(result));
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
