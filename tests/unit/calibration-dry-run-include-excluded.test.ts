/**
 * SP-201 / #106 — `--include-excluded-in-fit` grows the fit pool with weak rows
 * while holdout ECE stays verifier-grade only.
 */
import { describe, expect, it } from 'vitest';

import { LABEL_PACK_SCHEMA_VERSION, type LabelPackRow } from '../../scripts/lib/label-pack-schema.js';
import { P_SUCCESS_FEATURE_NAMES } from '../../src/domain/routing/p-success-classifier.js';
import {
  parseDryRunCliArgs,
  runCalibrationDryRunFromRows,
} from '../../scripts/verify-routing-calibration.js';

function makePackRow(
  sampleId: string,
  success: boolean,
  overrides: Partial<LabelPackRow> = {},
): LabelPackRow {
  const features: Record<string, number> = {};
  for (const name of P_SUCCESS_FEATURE_NAMES) {
    features[name] = 0.1;
  }
  features.triage_cyclomatic_score = success ? 0.2 : 0.8;
  features.requirement_reasoning = success ? 0.4 : 0.9;
  features.economical_tier = success ? 1 : 0;

  return {
    schema_version: LABEL_PACK_SCHEMA_VERSION,
    sample_id: sampleId,
    source: 'swe-gym',
    features,
    success,
    ...overrides,
  };
}

describe('calibration dry-run --include-excluded-in-fit (SP-201)', () => {
  it('parses --include-excluded-in-fit on the dry-run CLI', () => {
    const withFlag = parseDryRunCliArgs([
      '--dry-run-packs',
      '--packs',
      'a.jsonl',
      'b.jsonl',
      '--include-excluded-in-fit',
    ]);
    expect(withFlag.dryRun).toBe(true);
    expect(withFlag.includeExcludedInFit).toBe(true);
    expect(withFlag.packPaths).toEqual(['a.jsonl', 'b.jsonl']);

    const withoutFlag = parseDryRunCliArgs(['--ci-fixtures']);
    expect(withoutFlag.includeExcludedInFit).toBe(false);
    expect(withoutFlag.ciFixtures).toBe(true);
  });

  it('grows fit sample count with weak rows but keeps holdout ECE-eligible counts unchanged', () => {
    const eligible = Array.from({ length: 40 }, (_, index) =>
      makePackRow(`ece-${index}`, index % 3 !== 0, {
        features: {
          ...makePackRow(`ece-${index}`, index % 3 !== 0).features,
          triage_cyclomatic_score: index / 40,
          requirement_reasoning: (index % 5) / 5,
        },
      }),
    );
    const weak = Array.from({ length: 12 }, (_, index) =>
      makePackRow(`weak-${index}`, index % 2 === 0, {
        source: 'twinrouterbench-weak',
        outcome_signals: ['weak_tier_proxy', 'exclude_from_holdout_ece'],
      }),
    );

    const baseline = runCalibrationDryRunFromRows([...eligible, ...weak]);
    const withWeakFit = runCalibrationDryRunFromRows([...eligible, ...weak], {
      includeExcludedInFit: true,
    });

    expect(baseline.mode).toBe('evaluated');
    expect(withWeakFit.mode).toBe('evaluated');

    // ECE / soft-ECE boundary: weak never enters eligible or holdout counts.
    expect(baseline.ece_eligible_rows).toBe(40);
    expect(withWeakFit.ece_eligible_rows).toBe(40);
    expect(baseline.excluded_from_ece_rows).toBe(12);
    expect(withWeakFit.excluded_from_ece_rows).toBe(12);
    expect(withWeakFit.holdout_sample_count).toBe(baseline.holdout_sample_count);

    // Fit pool grows when weak rows join the isotonic fit set.
    expect(withWeakFit.fit_sample_count).toBe(baseline.fit_sample_count + weak.length);
    expect(withWeakFit.fit_sample_count).toBeGreaterThan(baseline.fit_sample_count);

    // Soft ECE still computed only on verifier holdout (boolean, not null).
    expect(typeof withWeakFit.soft_ece_passed).toBe('boolean');
    expect(withWeakFit.holdout_ece_calibrated).not.toBeNull();
  });

  it('does not change ECE-eligible counts when flag is set without weak rows', () => {
    const eligible = Array.from({ length: 36 }, (_, index) =>
      makePackRow(`only-${index}`, index % 2 === 0),
    );

    const off = runCalibrationDryRunFromRows(eligible);
    const on = runCalibrationDryRunFromRows(eligible, { includeExcludedInFit: true });

    expect(on.ece_eligible_rows).toBe(off.ece_eligible_rows);
    expect(on.excluded_from_ece_rows).toBe(0);
    expect(on.fit_sample_count).toBe(off.fit_sample_count);
    expect(on.holdout_sample_count).toBe(off.holdout_sample_count);
  });
});
