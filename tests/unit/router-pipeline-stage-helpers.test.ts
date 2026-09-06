// Extracted from tests/unit/router-pipeline.test.ts in SP-277 (wave 1, #155).
// Aligned with src/domain/pipeline/stage-helpers.ts (resolveLocalEligible, estimateCheapToolUseRequirement).
import { describe, expect, it } from 'vitest';

import {
  estimateCheapToolUseRequirement,
  resolveLocalEligible,
  resolveLocalZeroToolUseCeiling,
} from '../../src/domain/pipeline/stage-helpers.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';

describe('resolveLocalEligible (SP-111)', () => {
  const highThreshold = DEFAULT_OPERATOR_CONFIG.low_intensity.high_threshold;

  it('prefers triage_trivial over cluster and low-intensity signals', () => {
    const result = resolveLocalEligible({
      triageVerdict: 'trivial',
      tierHint: 'zero-tier',
      lowIntensityScore: 0.9,
      highThreshold,
      clusterMatch: {
        clusterId: 'low_stakes_general',
        tierBias: 'zero-tier',
        similarity: 0.9,
        margin: 0.1,
        confidence: 'high',
        elapsedMs: 1,
      },
    });

    expect(result).toEqual({ eligible: true, reason: 'triage_trivial' });
  });

  it('uses cluster reason when high-confidence zero-tier cluster matches', () => {
    const result = resolveLocalEligible({
      triageVerdict: 'ambiguous',
      tierHint: 'zero-tier',
      lowIntensityScore: 0.7,
      highThreshold,
      clusterMatch: {
        clusterId: 'mechanical_edit',
        tierBias: 'zero-tier',
        similarity: 0.9,
        margin: 0.1,
        confidence: 'high',
        elapsedMs: 1,
      },
    });

    expect(result).toEqual({ eligible: true, reason: 'cluster_mechanical_edit' });
  });

  it('uses low_intensity_structural when only structural gate qualifies', () => {
    const result = resolveLocalEligible({
      triageVerdict: 'ambiguous',
      tierHint: 'zero-tier',
      lowIntensityScore: 0.7,
      highThreshold,
      clusterMatch: null,
    });

    expect(result).toEqual({ eligible: true, reason: 'low_intensity_structural' });
  });

  it('rejects when no eligibility signal is present', () => {
    const result = resolveLocalEligible({
      triageVerdict: 'complex',
      tierHint: 'frontier-cloud',
      lowIntensityScore: 0.2,
      highThreshold,
      clusterMatch: null,
    });

    expect(result).toEqual({ eligible: false, reason: null });
  });
});

describe('estimateCheapToolUseRequirement (SP-177)', () => {
  it('returns 0 for true trivial format/lint prompts', () => {
    expect(estimateCheapToolUseRequirement('Format this JSON file')).toBe(0);
    expect(estimateCheapToolUseRequirement('Lint the source file')).toBe(0);
  });

  it('scores agentic git/bash/edit/explore/delete/repo cues above local ceiling', () => {
    const predicted = estimateCheapToolUseRequirement(
      'run git status then explore the repo with bash and delete the bad files',
    );
    expect(predicted).toBeGreaterThan(0.25);
    expect(
      resolveLocalZeroToolUseCeiling(0.1, 0.25),
    ).toBe(0.1);
    expect(predicted).toBeGreaterThan(resolveLocalZeroToolUseCeiling(0.1, 0.25));
  });
});
