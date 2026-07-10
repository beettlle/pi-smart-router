import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MIN_TRAINING_SAMPLES } from '../../src/domain/routing/p-success-classifier.js';
import {
  parseLabeledJsonl,
  trainPSuccessArtifacts,
} from '../../scripts/train-p-success-weights.js';

describe('train-p-success-weights (SP-175)', () => {
  it('trains ≥30 samples from the synthetic fixture without prompt text fields', () => {
    const fixturePath = resolve('scripts/fixtures/p-success-synthetic-train.jsonl');
    const text = readFileSync(fixturePath, 'utf8');
    expect(text).not.toMatch(/"prompt_text"|"messages"|"tool_args"/);

    const samples = parseLabeledJsonl(text);
    expect(samples.length).toBeGreaterThanOrEqual(MIN_TRAINING_SAMPLES);

    const trained = trainPSuccessArtifacts(samples);
    expect(trained.weights.trained_sample_count).toBe(samples.length);
    expect(trained.weights.trained_sample_count).toBeGreaterThanOrEqual(
      trained.weights.min_training_samples,
    );
    expect(trained.isotonic.trained_sample_count).toBe(samples.length);
  });
});
