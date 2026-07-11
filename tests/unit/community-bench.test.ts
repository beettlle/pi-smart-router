/**
 * Unit tests for community-bench fingerprint + report schema — SP-194.
 */

import { describe, expect, it } from 'vitest';

import {
  buildSetupFingerprint,
  computeCapabilitySourcePct,
  countTiers,
  hashFleetIds,
  TWINROUTERBENCH_CI_SUBSET_SHA256,
  TWINROUTERBENCH_PINNED_COMMIT,
  type FleetIdEntry,
} from '../../scripts/eval/community-bench-fingerprint.js';
import {
  buildCommunityBenchReport,
  collectReportKeys,
  COMMUNITY_BENCH_MAINTAINER_CONTACT,
  COMMUNITY_BENCH_REPORT_VERSION,
  FORBIDDEN_REPORT_FIELD_PATTERNS,
  formatCommunityBenchEmail,
  formatCommunityBenchIssueBody,
  formatMailtoHint,
  parseCommunityBenchReport,
  PRIVACY_BLURB,
  SetupFingerprintSchema,
} from '../../scripts/eval/community-bench-report.js';
import type { AssertReleaseGatesResult } from '../../scripts/eval/assert-release-gates.js';

const SAMPLE_FLEET: readonly FleetIdEntry[] = [
  { provider: 'anthropic', id: 'claude-3.5-sonnet', tier: 'frontier-cloud' },
  { provider: 'anthropic', id: 'claude-3.5-haiku', tier: 'economical-cloud' },
  { provider: 'lmstudio', id: 'local-gemma-4-7b', tier: 'zero-tier' },
];

const PASSING_GATES: AssertReleaseGatesResult = {
  passed: true,
  absolute_gates: { passed: true, failed_gates: [] },
  baseline_regression: {
    passed: true,
    reference_version: '0.6.0',
    failed_gates: [],
  },
};

const SAMPLE_METRICS = {
  mean_capability_adequacy_rate: 0.95,
  mean_quality_retention: 0.88,
  mean_over_routing_rate: 0.05,
  mean_pin_preserved_rate: 0.9,
};

describe('community-bench fingerprint (SP-194)', () => {
  it('hashes fleet provider/id stably regardless of input order', () => {
    const a = hashFleetIds(SAMPLE_FLEET);
    const b = hashFleetIds([...SAMPLE_FLEET].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes hash when a fleet id changes', () => {
    const base = hashFleetIds(SAMPLE_FLEET);
    const mutated = hashFleetIds([
      ...SAMPLE_FLEET.slice(0, 2),
      { provider: 'lmstudio', id: 'other-local', tier: 'zero-tier' },
    ]);
    expect(mutated).not.toBe(base);
  });

  it('counts tiers without exposing provider/id plaintext in counts', () => {
    const counts = countTiers(SAMPLE_FLEET);
    expect(counts).toEqual({
      'frontier-cloud': 1,
      'economical-cloud': 1,
      'zero-tier': 1,
    });
    expect(JSON.stringify(counts)).not.toMatch(/claude|gemma|anthropic|lmstudio/i);
  });

  it('computes capability_source percentages', () => {
    const pct = computeCapabilitySourcePct(
      ['a', 'b', 'c', 'd'],
      (id) => (id === 'a' || id === 'b' ? 'benchmark' : 'pattern_default'),
    );
    expect(pct.benchmark).toBe(0.5);
    expect(pct.pattern_default).toBe(0.5);
  });

  it('buildSetupFingerprint omits raw fleet ids and embeds corpus pins', () => {
    const fp = buildSetupFingerprint({
      packageVersion: '0.9.2-test',
      fleet: SAMPLE_FLEET,
      systemInfo: {
        totalMemoryGb: 32,
        arch: 'arm64',
        platform: 'darwin',
        batteryLevel: null,
        isOnAcPower: true,
      },
      capabilitySourceForId: () => 'pattern_default',
      catalogFreezeDate: '2026-07-11',
    });

    expect(SetupFingerprintSchema.safeParse(fp).success).toBe(true);
    expect(fp.package_version).toBe('0.9.2-test');
    expect(fp.fleet_hash).toBe(hashFleetIds(SAMPLE_FLEET));
    expect(fp.fleet_size).toBe(3);
    expect(fp.hardware_class).toBe('full_local');
    expect(fp.corpus_pins.twinrouterbench_commit).toBe(TWINROUTERBENCH_PINNED_COMMIT);
    expect(fp.corpus_pins.twinrouterbench_ci_subset_sha256).toBe(
      TWINROUTERBENCH_CI_SUBSET_SHA256,
    );

    const serialized = JSON.stringify(fp);
    expect(serialized).not.toMatch(/claude-3\.5|local-gemma|api[_-]?key|prompt/i);
    expect(serialized).toContain(fp.fleet_hash);
  });
});

describe('community-bench report schema + email (SP-194)', () => {
  it('builds a schema-valid report with Track A PASS', () => {
    const fingerprint = buildSetupFingerprint({
      packageVersion: '0.9.2',
      fleet: SAMPLE_FLEET,
      systemInfo: {
        totalMemoryGb: 32,
        arch: 'arm64',
        platform: 'darwin',
        batteryLevel: null,
        isOnAcPower: true,
      },
      capabilitySourceForId: () => 'benchmark',
    });

    const report = buildCommunityBenchReport({
      fingerprint,
      corpusPath: 'tests/eval/corpus/twinrouterbench',
      metrics: SAMPLE_METRICS,
      gates: PASSING_GATES,
      generatedAt: '2026-07-11T00:00:00.000Z',
    });

    expect(report.version).toBe(COMMUNITY_BENCH_REPORT_VERSION);
    expect(report.overall_passed).toBe(true);
    expect(report.tracks.A.passed).toBe(true);
    expect(report.tracks.A.name).toBe('TwinRouterBench');
    expect(report.tracks.B?.status).toBe('skipped');
    expect(report.tracks.C?.status).toBe('skipped');
    expect(parseCommunityBenchReport(report)).toEqual(report);
  });

  it('email formatter includes Subject: + PASS/FAIL + privacy blurb + maintainer', () => {
    const fingerprint = buildSetupFingerprint({
      packageVersion: '0.9.2',
      fleet: SAMPLE_FLEET,
      systemInfo: {
        totalMemoryGb: 8,
        arch: 'x64',
        platform: 'linux',
        batteryLevel: null,
        isOnAcPower: true,
      },
      capabilitySourceForId: () => 'pattern_default',
    });

    const report = buildCommunityBenchReport({
      fingerprint,
      corpusPath: 'tests/eval/corpus/twinrouterbench',
      metrics: SAMPLE_METRICS,
      gates: {
        passed: false,
        absolute_gates: {
          passed: false,
          failed_gates: [
            {
              gate: 'mean_quality_retention_min',
              actual: 0.5,
              threshold: 0.7,
              comparison: 'min',
              message: 'mean_quality_retention 0.5 < min 0.7',
            },
          ],
        },
      },
      generatedAt: '2026-07-11T12:00:00.000Z',
    });

    const email = formatCommunityBenchEmail(report);
    expect(email.startsWith('Subject:')).toBe(true);
    expect(email).toContain('FAIL');
    expect(email).toContain(PRIVACY_BLURB);
    expect(email).toContain(COMMUNITY_BENCH_MAINTAINER_CONTACT);
    expect(email).toContain(fingerprint.fleet_hash);
    expect(email).toContain('Track A');
    expect(email).not.toMatch(/api[_-]?key/i);
    expect(email).not.toMatch(/\bprompt\b/i);

    const issueBody = formatCommunityBenchIssueBody(report);
    expect(issueBody.startsWith('Subject:')).toBe(false);
    expect(issueBody).toContain('FAIL');

    const mailto = formatMailtoHint(report, 'maintainers@example.com');
    expect(mailto.startsWith('mailto:maintainers@example.com?subject=')).toBe(true);
  });

  it('report JSON keys never match forbidden prompt/API-key patterns', () => {
    const fingerprint = buildSetupFingerprint({
      packageVersion: '0.9.2',
      fleet: SAMPLE_FLEET,
      systemInfo: {
        totalMemoryGb: 16,
        arch: 'arm64',
        platform: 'darwin',
        batteryLevel: null,
        isOnAcPower: true,
      },
      capabilitySourceForId: () => 'benchmark',
    });

    const report = buildCommunityBenchReport({
      fingerprint,
      corpusPath: 'tests/eval/corpus/twinrouterbench',
      metrics: SAMPLE_METRICS,
      gates: PASSING_GATES,
    });

    const keys = collectReportKeys(report);
    for (const key of keys) {
      for (const pattern of FORBIDDEN_REPORT_FIELD_PATTERNS) {
        expect(key).not.toMatch(pattern);
      }
    }
  });
});
