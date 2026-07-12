/**
 * Community-bench report JSON schema + email `.txt` formatter — SP-194 / #105.
 *
 * No SMTP send and no upload. The `.txt` is the source of truth for email /
 * GitHub issue paste; optional `--mailto` only prints a hint URL.
 */

import { z } from 'zod';

import type { AssertReleaseGatesResult, HarnessGateMetrics } from './assert-release-gates.js';
import type { SetupFingerprint } from './community-bench-fingerprint.js';

/** Maintainer contact for report footer (SP-195 README must match). */
export const COMMUNITY_BENCH_MAINTAINER_CONTACT =
  'https://github.com/beettlle/pi-smart-router/issues/new?labels=community-bench' as const;

/** Alternate GitHub issues list (footer). */
export const COMMUNITY_BENCH_ISSUES_URL =
  'https://github.com/beettlle/pi-smart-router/issues' as const;

export const COMMUNITY_BENCH_REPORT_VERSION = 1 as const;

export const PRIVACY_BLURB =
  'This report contains a privacy-safe setup fingerprint only: package version, OS/arch/Node, hardware class, hashed fleet provider/id list, tier counts, capability-source percentages, encoder/hydra mode, and corpus pin ids. It does not include raw prompts, API keys, endpoints, or plaintext model identifiers.' as const;

const CapabilitySourcePctSchema = z.object({
  benchmark: z.number().min(0).max(1),
  pattern_default: z.number().min(0).max(1),
});

const CorpusPinsSchema = z.object({
  twinrouterbench_commit: z.string().min(1),
  twinrouterbench_ci_subset_sha256: z.string().min(1),
  catalog_freeze_date: z.string().optional(),
  benchmark_profiles_scrape_date: z.string().optional(),
});

export const SetupFingerprintSchema = z.object({
  package_version: z.string().min(1),
  os: z.string().min(1),
  arch: z.string().min(1),
  node: z.string().min(1),
  hardware_class: z.enum(['full_local', 'classification_only', 'disabled']),
  fleet_hash: z.string().regex(/^[a-f0-9]{64}$/),
  fleet_size: z.number().int().nonnegative(),
  tier_counts: z.record(z.string(), z.number().int().nonnegative()),
  capability_source_pct: CapabilitySourcePctSchema,
  encoder: z.string().nullable(),
  hydra_heads: z.string().nullable(),
  corpus_pins: CorpusPinsSchema,
});

const HarnessGateMetricsSchema = z.object({
  mean_capability_adequacy_rate: z.number(),
  mean_quality_retention: z.number(),
  mean_over_routing_rate: z.number(),
  mean_pin_preserved_rate: z.number(),
});

const FailedGateSchema = z.object({
  gate: z.string(),
  actual: z.number(),
  threshold: z.number(),
  comparison: z.enum(['min', 'max']),
  message: z.string(),
});

const FailedBaselineGateSchema = z.object({
  gate: z.string(),
  baseline_value: z.number(),
  current_value: z.number(),
  delta: z.number(),
  threshold: z.number(),
  message: z.string(),
});

const AssertReleaseGatesResultSchema = z.object({
  passed: z.boolean(),
  absolute_gates: z.object({
    passed: z.boolean(),
    failed_gates: z.array(FailedGateSchema).readonly(),
  }),
  baseline_regression: z
    .object({
      passed: z.boolean(),
      reference_version: z.string(),
      failed_gates: z.array(FailedBaselineGateSchema).readonly(),
    })
    .optional(),
});

const TrackASchema = z.object({
  name: z.literal('TwinRouterBench'),
  status: z.enum(['ran', 'skipped']),
  corpus_path: z.string().min(1),
  metrics: HarnessGateMetricsSchema.optional(),
  gates: AssertReleaseGatesResultSchema.optional(),
  passed: z.boolean(),
  skip_reason: z.string().optional(),
});

const SkippedTrackSchema = z.object({
  status: z.literal('skipped'),
  reason: z.string().min(1),
});

/**
 * Track B skip when `--dogfood-export` is omitted.
 * @deprecated Prefer {@link TRACK_B_SKIP_REASON_NOT_REQUESTED}. Kept as alias for older tests.
 */
export const TRACK_B_SKIP_REASON_ADAPTER_INCOMPLETE =
  'Track B optional; pass --dogfood-export PATH with a labeled dogfood Track B export (success_label, min_tier, min_model_id); no dogfood labels invented' as const;

/** Default Track B skip when --dogfood-export is not passed. */
export const TRACK_B_SKIP_REASON_NOT_REQUESTED = TRACK_B_SKIP_REASON_ADAPTER_INCOMPLETE;

/** Skip when export is present but labels/schema incomplete — never invent labels. */
export const TRACK_B_SKIP_REASON_INCOMPLETE_LABELS =
  'Track B export incomplete or unlabeled; required outcome fields success_label, min_tier, min_model_id — no dogfood labels invented' as const;

/** Default Track C skip when --llmrouterbench / --full not passed. */
export const TRACK_C_SKIP_REASON_NOT_REQUESTED =
  'Track C LLMRouterBench optional; pass --llmrouterbench or --full to run offline on vendored subset (no full HF download)' as const;

const TrackBRanSchema = z.object({
  name: z.literal('DogfoodExport'),
  status: z.literal('ran'),
  export_path: z.string().min(1),
  record_count: z.number().int().nonnegative(),
  fixture_count: z.number().int().nonnegative(),
  catalog_id: z.string().min(1),
  checkpoint_date: z.string().min(1),
  metrics: HarnessGateMetricsSchema,
  gates: AssertReleaseGatesResultSchema,
  passed: z.boolean(),
});

const TrackBSchema = z.union([SkippedTrackSchema, TrackBRanSchema]);

const TrackCRanSchema = z.object({
  name: z.literal('LLMRouterBench'),
  status: z.literal('ran'),
  subset_path: z.string().min(1),
  offline: z.literal(true),
  downloads_corpus: z.literal(false),
  fixture_count: z.number().int().nonnegative(),
  catalog_id: z.string().min(1),
  checkpoint_date: z.string().min(1),
  cumulative_regret_usd: z.number(),
  mean_cost_savings_ratio: z.number(),
  mean_quality_retention: z.number(),
});

const TrackCSchema = z.union([SkippedTrackSchema, TrackCRanSchema]);

export const CommunityBenchReportSchema = z.object({
  version: z.literal(COMMUNITY_BENCH_REPORT_VERSION),
  generated_at: z.string().min(1),
  fingerprint: SetupFingerprintSchema,
  tracks: z.object({
    A: TrackASchema,
    B: TrackBSchema.optional(),
    C: TrackCSchema.optional(),
  }),
  overall_passed: z.boolean(),
});

export type CommunityBenchReport = z.infer<typeof CommunityBenchReportSchema>;
export type TrackAResult = z.infer<typeof TrackASchema>;
export type TrackBResult = z.infer<typeof TrackBSchema>;
export type TrackBRanResult = z.infer<typeof TrackBRanSchema>;
export type TrackCResult = z.infer<typeof TrackCSchema>;
export type TrackCRanResult = z.infer<typeof TrackCRanSchema>;

export interface BuildReportInput {
  readonly fingerprint: SetupFingerprint;
  readonly corpusPath: string;
  readonly metrics: HarnessGateMetrics;
  readonly gates: AssertReleaseGatesResult;
  readonly generatedAt?: string;
  readonly trackB?: TrackBResult;
  readonly trackC?: TrackCResult;
}

/** Validate and return a typed community-bench report. */
export function parseCommunityBenchReport(raw: unknown): CommunityBenchReport {
  const parsed = CommunityBenchReportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `invalid community-bench report: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  return parsed.data;
}

/** Assemble Track A report from fingerprint + assert-release-gates result. */
export function buildCommunityBenchReport(input: BuildReportInput): CommunityBenchReport {
  const passed = input.gates.passed;
  const report: CommunityBenchReport = {
    version: COMMUNITY_BENCH_REPORT_VERSION,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    fingerprint: input.fingerprint,
    tracks: {
      A: {
        name: 'TwinRouterBench',
        status: 'ran',
        corpus_path: input.corpusPath,
        metrics: input.metrics,
        gates: input.gates,
        passed,
      },
      B: input.trackB ?? {
        status: 'skipped',
        reason: TRACK_B_SKIP_REASON_NOT_REQUESTED,
      },
      C: input.trackC ?? {
        status: 'skipped',
        reason: TRACK_C_SKIP_REASON_NOT_REQUESTED,
      },
    },
    overall_passed: passed,
  };
  return parseCommunityBenchReport(report);
}

function formatTierCounts(counts: Readonly<Record<string, number>>): string {
  const keys = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) {
    return '(none)';
  }
  return keys.map((k) => `${k}=${counts[k]}`).join(', ');
}

function formatFingerprintBlock(fp: CommunityBenchReport['fingerprint']): string {
  const pins = fp.corpus_pins;
  const lines = [
    `package_version: ${fp.package_version}`,
    `os/arch/node: ${fp.os}/${fp.arch}/${fp.node}`,
    `hardware_class: ${fp.hardware_class}`,
    `fleet_hash: ${fp.fleet_hash}`,
    `fleet_size: ${fp.fleet_size}`,
    `tier_counts: ${formatTierCounts(fp.tier_counts)}`,
    `capability_source_pct: benchmark=${fp.capability_source_pct.benchmark} pattern_default=${fp.capability_source_pct.pattern_default}`,
    `encoder: ${fp.encoder ?? 'n/a'}`,
    `hydra_heads: ${fp.hydra_heads ?? 'n/a'}`,
    `corpus pin twinrouterbench_commit: ${pins.twinrouterbench_commit}`,
    `corpus pin twinrouterbench_ci_subset_sha256: ${pins.twinrouterbench_ci_subset_sha256}`,
  ];
  if (typeof pins.catalog_freeze_date === 'string') {
    lines.push(`catalog_freeze_date: ${pins.catalog_freeze_date}`);
  }
  if (typeof pins.benchmark_profiles_scrape_date === 'string') {
    lines.push(`benchmark_profiles_scrape_date: ${pins.benchmark_profiles_scrape_date}`);
  }
  return lines.join('\n');
}

function formatTrackABlock(track: TrackAResult): string {
  const lines = [
    `Track A (${track.name}): ${track.passed ? 'PASS' : 'FAIL'}`,
    `  status: ${track.status}`,
    `  corpus_path: ${track.corpus_path}`,
  ];
  if (track.metrics) {
    lines.push(
      `  mean_capability_adequacy_rate: ${track.metrics.mean_capability_adequacy_rate}`,
      `  mean_quality_retention: ${track.metrics.mean_quality_retention}`,
      `  mean_over_routing_rate: ${track.metrics.mean_over_routing_rate}`,
      `  mean_pin_preserved_rate: ${track.metrics.mean_pin_preserved_rate}`,
    );
  }
  if (track.gates) {
    lines.push(`  absolute_gates: ${track.gates.absolute_gates.passed ? 'PASS' : 'FAIL'}`);
    if (track.gates.baseline_regression) {
      lines.push(
        `  baseline_regression (v${track.gates.baseline_regression.reference_version}): ${track.gates.baseline_regression.passed ? 'PASS' : 'FAIL'}`,
      );
    }
    for (const g of track.gates.absolute_gates.failed_gates) {
      lines.push(`  failed_gate: ${g.message}`);
    }
    for (const g of track.gates.baseline_regression?.failed_gates ?? []) {
      lines.push(`  failed_baseline_gate: ${g.message}`);
    }
  }
  return lines.join('\n');
}

function formatTrackBBlock(track: TrackBResult | undefined): string {
  if (!track) {
    return '';
  }
  if (track.status === 'skipped') {
    return `Track B: SKIPPED — ${track.reason}`;
  }
  const lines = [
    `Track B (${track.name}): ${track.passed ? 'PASS' : 'FAIL'}`,
    `  status: ${track.status}`,
    `  export_path: ${track.export_path}`,
    `  record_count: ${track.record_count}`,
    `  fixture_count: ${track.fixture_count}`,
    `  catalog_id: ${track.catalog_id}`,
    `  checkpoint_date: ${track.checkpoint_date}`,
    `  mean_capability_adequacy_rate: ${track.metrics.mean_capability_adequacy_rate}`,
    `  mean_quality_retention: ${track.metrics.mean_quality_retention}`,
    `  mean_over_routing_rate: ${track.metrics.mean_over_routing_rate}`,
    `  mean_pin_preserved_rate: ${track.metrics.mean_pin_preserved_rate}`,
    `  absolute_gates: ${track.gates.absolute_gates.passed ? 'PASS' : 'FAIL'}`,
  ];
  if (track.gates.baseline_regression) {
    lines.push(
      `  baseline_regression (v${track.gates.baseline_regression.reference_version}): ${track.gates.baseline_regression.passed ? 'PASS' : 'FAIL'}`,
    );
  }
  return lines.join('\n');
}

function formatTrackCBlock(track: TrackCResult | undefined): string {
  if (!track) {
    return '';
  }
  if (track.status === 'skipped') {
    return `Track C: SKIPPED — ${track.reason}`;
  }
  return [
    `Track C (${track.name}): ran (offline)`,
    `  subset_path: ${track.subset_path}`,
    `  offline: ${track.offline}`,
    `  downloads_corpus: ${track.downloads_corpus}`,
    `  fixture_count: ${track.fixture_count}`,
    `  catalog_id: ${track.catalog_id}`,
    `  checkpoint_date: ${track.checkpoint_date}`,
    `  cumulative_regret_usd: ${track.cumulative_regret_usd}`,
    `  mean_cost_savings_ratio: ${track.mean_cost_savings_ratio}`,
    `  mean_quality_retention: ${track.mean_quality_retention}`,
  ].join('\n');
}

/**
 * Email-ready `.txt` body with Subject: line, privacy blurb, fingerprint,
 * pins, Track A metrics, PASS/FAIL, and maintainer footer.
 */
export function formatCommunityBenchEmail(report: CommunityBenchReport): string {
  const overall = report.overall_passed ? 'PASS' : 'FAIL';
  const subject = `pi-smart-router community-bench ${overall} v${report.fingerprint.package_version}`;

  const trackBLine = formatTrackBBlock(report.tracks.B);
  const trackCLine = formatTrackCBlock(report.tracks.C);

  const parts = [
    `Subject: ${subject}`,
    '',
    PRIVACY_BLURB,
    '',
    `generated_at: ${report.generated_at}`,
    `overall: ${overall}`,
    '',
    '=== Setup fingerprint ===',
    formatFingerprintBlock(report.fingerprint),
    '',
    '=== Tracks ===',
    formatTrackABlock(report.tracks.A),
    trackBLine,
    trackCLine,
    '',
    '=== Footer ===',
    'Attach or paste the companion community-bench-report.json for machine-readable metrics.',
    `Open a GitHub issue: ${COMMUNITY_BENCH_ISSUES_URL}`,
    `Maintainer contact: ${COMMUNITY_BENCH_MAINTAINER_CONTACT}`,
    'Do not auto-send this email (no SMTP). Copy the .txt into your mail client or issue body.',
  ];

  return parts.filter((line) => line !== undefined).join('\n') + '\n';
}

/** Issue body = email body without the Subject: header line (for --print-issue-body). */
export function formatCommunityBenchIssueBody(report: CommunityBenchReport): string {
  const email = formatCommunityBenchEmail(report);
  return email.replace(/^Subject:.*\n\n?/, '');
}

/** Optional mailto: URL hint; `.txt` remains source of truth (no auto-send). */
export function formatMailtoHint(report: CommunityBenchReport, address: string): string {
  const email = formatCommunityBenchEmail(report);
  const subjectMatch = /^Subject:\s*(.+)$/m.exec(email);
  const subject = encodeURIComponent(subjectMatch?.[1]?.trim() ?? 'pi-smart-router community-bench');
  // Keep body empty in mailto — clients truncate; instruct user to attach .txt
  return `mailto:${address}?subject=${subject}`;
}

/** Keys that must never appear in serialized reports (defense-in-depth). */
export const FORBIDDEN_REPORT_FIELD_PATTERNS = [
  /prompt/i,
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /endpoint/i,
] as const;

/** Recursively collect object keys; used by tests to assert privacy. */
export function collectReportKeys(value: unknown, acc: string[] = []): string[] {
  if (value === null || typeof value !== 'object') {
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectReportKeys(item, acc);
    }
    return acc;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    acc.push(k);
    collectReportKeys(v, acc);
  }
  return acc;
}
