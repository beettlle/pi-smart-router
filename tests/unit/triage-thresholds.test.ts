/**
 * Serve-time triage threshold loader tests (#171).
 */

import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { CYCLOMATIC_THRESHOLD, triage } from '../../src/domain/triage/triage-engine.js';
import {
  createDefaultTriageThresholdsArtifact,
  isTriageThresholdsTrained,
  parseTriageThresholdsFromBundle,
  resolveTriageCyclomaticThreshold,
} from '../../src/domain/triage/triage-thresholds.js';

describe('triage-thresholds loader (#171)', () => {
  it('defaults to honest-untrained artifact at threshold 15', () => {
    const artifact = createDefaultTriageThresholdsArtifact();
    expect(artifact.cyclomatic_threshold).toBe(CYCLOMATIC_THRESHOLD);
    expect(isTriageThresholdsTrained(artifact)).toBe(false);
  });

  it('uses trained threshold when sample floor is met', () => {
    const parsed = parseTriageThresholdsFromBundle({
      minimum_training_samples: { triage_thresholds: 50 },
      triage_thresholds: {
        version: 1,
        cyclomatic_threshold: 5,
        trained_sample_count: 57,
      },
    });
    expect(isTriageThresholdsTrained(parsed.artifact, parsed.minSamples)).toBe(true);
    expect(parsed.artifact.cyclomatic_threshold).toBe(5);
  });

  it('resolveTriageCyclomaticThreshold returns default when undertrained', () => {
    const dir = mkdtempSync(join(tmpdir(), 'triage-thresh-'));
    const path = join(dir, 'routing-calibration.json');
    try {
      writeFileSync(
        path,
        JSON.stringify({
          minimum_training_samples: { triage_thresholds: 50 },
          triage_thresholds: {
            version: 1,
            cyclomatic_threshold: 5,
            trained_sample_count: 10,
          },
        }),
      );
      expect(resolveTriageCyclomaticThreshold({ filePath: path })).toBe(CYCLOMATIC_THRESHOLD);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolveTriageCyclomaticThreshold returns trained value when floor met', () => {
    const dir = mkdtempSync(join(tmpdir(), 'triage-thresh-'));
    const path = join(dir, 'routing-calibration.json');
    try {
      writeFileSync(
        path,
        JSON.stringify({
          minimum_training_samples: { triage_thresholds: 50 },
          triage_thresholds: {
            version: 1,
            cyclomatic_threshold: 5,
            trained_sample_count: 57,
          },
        }),
      );
      expect(resolveTriageCyclomaticThreshold({ filePath: path })).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('triage respects cyclomaticThreshold option', () => {
    // A prompt with moderate branching should flip complex only when threshold is low.
    const prompt =
      'if (a) { if (b) { if (c) { if (d) { if (e) { return 1; } } } } } else { return 0; }';
    const atDefault = triage(prompt);
    const atFive = triage(prompt, { cyclomaticThreshold: 5 });
    // Score is independent of threshold; verdict may differ.
    expect(atDefault.cyclomatic_score).toBe(atFive.cyclomatic_score);
    if (atFive.cyclomatic_score >= 5 && atFive.cyclomatic_score < CYCLOMATIC_THRESHOLD) {
      expect(atFive.verdict).toBe('complex');
      expect(atFive.reason_code).toBe('cyclomatic_high');
    }
  });
});
