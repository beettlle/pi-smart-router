import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadEvalTraceFixture } from '../../scripts/eval/fixture-schema.js';
import {
  compareK4HeadModeOfflineEval,
  deriveK4CapabilitiesFromPrefix,
  deriveRequirementsFromHeadMode,
  K4_OFFLINE_EVAL_FIXTURE_SUBSET,
  runK4OfflineEvalSmoke,
  validateK4SmokeHeadShapes,
} from '../../scripts/eval/counterfactual-replay.js';
import { MODERNBERT_K4_HEAD_COUNT } from '../../src/domain/matching/modernbert-heads.js';

const FIXTURES_DIR = join('tests', 'eval', 'fixtures');

function loadFixture(name: string) {
  return loadEvalTraceFixture(
    JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8')) as unknown,
  );
}

describe('K=4 offline eval smoke (SP-160)', () => {
  it('derives valid K=4 head shapes from fixture prefix hashes', () => {
    const fixtures = K4_OFFLINE_EVAL_FIXTURE_SUBSET.map((name) => loadFixture(name));
    const validation = validateK4SmokeHeadShapes(fixtures);

    expect(validation.step_count).toBeGreaterThan(0);
    expect(validation.all_valid).toBe(true);

    const vector = deriveK4CapabilitiesFromPrefix('prefix0003aabbccdd');
    expect(Object.keys(vector)).toHaveLength(MODERNBERT_K4_HEAD_COUNT);
    expect(vector.debugging).toBeGreaterThanOrEqual(0);
    expect(vector.debugging).toBeLessThanOrEqual(1);
  });

  it('excludes debugging from K=4 requirements used for offline QR', () => {
    const requirements = deriveRequirementsFromHeadMode('prefix0003aabbccdd', 'modernbert_k4');

    expect(requirements).toHaveProperty('reasoning');
    expect(requirements).toHaveProperty('code_gen');
    expect(requirements).toHaveProperty('tool_use');
    expect(requirements).not.toHaveProperty('debugging');
  });

  it('compares modernbert_k4 QR vs learned_projection on fixture subset', () => {
    const comparison = runK4OfflineEvalSmoke(FIXTURES_DIR);

    expect(comparison.fixture_ids).toEqual([
      'debug-session-cheap-escalation',
      'trivial-pin-session',
    ]);
    expect(comparison.catalog_id).toBe('pi-smart-router-v0.5.0-eval');
    expect(comparison.checkpoint_date).toBe('2026-07-01');
    expect(comparison.learned_projection.fixture_count).toBe(2);
    expect(comparison.modernbert_k4.fixture_count).toBe(2);
    expect(comparison.learned_projection.hydra_heads).toBe('learned_projection');
    expect(comparison.modernbert_k4.hydra_heads).toBe('modernbert_k4');
    expect(typeof comparison.qr_delta).toBe('number');
    expect(typeof comparison.k4_retains_baseline).toBe('boolean');
  });

  it('reports aggregate QR for both head modes via compareK4HeadModeOfflineEval', () => {
    const fixtures = K4_OFFLINE_EVAL_FIXTURE_SUBSET.map((name) => loadFixture(name));
    const comparison = compareK4HeadModeOfflineEval(fixtures);

    expect(comparison.learned_projection.mean_quality_retention).toBeGreaterThanOrEqual(0);
    expect(comparison.modernbert_k4.mean_quality_retention).toBeGreaterThanOrEqual(0);
    expect(comparison.qr_delta).toBeCloseTo(
      comparison.modernbert_k4.mean_quality_retention -
        comparison.learned_projection.mean_quality_retention,
      6,
    );
  });
});
