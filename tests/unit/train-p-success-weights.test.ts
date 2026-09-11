import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MIN_TRAINING_SAMPLES } from '../../src/domain/routing/p-success-classifier.js';
import {
  aggregateRowRequestId,
  labeledSampleFromContribRecord,
} from '../../scripts/lib/contrib-training-samples.js';
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

  it('trains from privacy-safe aggregate rows without request_id (SP-270)', () => {
    // Aggregate rows: request_id stripped by calibration-aggregate; mixed labels.
    const aggregate = [
      JSON.stringify({
        tier: 'economical-cloud',
        success_label: true,
        outcome_signals: ['feedback_good'],
        estimated_input_tokens: 400,
        triage_cyclomatic_score: 0.3,
        routing_latency_ms: 9,
      }),
      JSON.stringify({
        tier: 'economical-cloud',
        success_label: false,
        outcome_signals: [],
        tool_failure_chain_count: 3,
        estimated_input_tokens: 900,
        triage_cyclomatic_score: 0.8,
        routing_latency_ms: 25,
      }),
      JSON.stringify({
        tier: 'economical-cloud',
        success_label: null,
        outcome_signals: [],
        estimated_input_tokens: 500,
        triage_cyclomatic_score: 0.4,
        routing_latency_ms: 10,
      }),
    ].join('\n');

    const samples = parseLabeledJsonl(aggregate);

    expect(samples).toHaveLength(2); // unlabeled row skipped, never coerced
    expect(samples[0]!.request_id).toBe('aggregate-row-0');
    expect(samples[0]!.success).toBe(true);
    expect(samples[1]!.request_id).toBe('aggregate-row-1');
    expect(samples[1]!.success).toBe(false); // verifier proxy → failure label
  });

  it('labeledSampleFromContribRecord keeps explicit ids and skips unlabeled rows', () => {
    const withId = labeledSampleFromContribRecord(
      {
        request_id: 'req-1',
        tier: 'zero-tier',
        success_label: true,
        outcome_signals: [],
        estimated_input_tokens: 120,
      },
      aggregateRowRequestId(0),
    );
    expect(withId?.request_id).toBe('req-1');

    const unlabeled = labeledSampleFromContribRecord(
      { tier: 'zero-tier', success_label: null, outcome_signals: [] },
      aggregateRowRequestId(1),
    );
    expect(unlabeled).toBeNull();
  });

  it('skips scripted_intent rows — quarantined labels never train (SP-281 / #168)', () => {
    const scriptedGood = labeledSampleFromContribRecord(
      {
        tier: 'economical-cloud',
        success_label: true,
        outcome_signals: ['feedback_good'],
        label_provenance: 'scripted_intent',
      },
      aggregateRowRequestId(0),
    );
    expect(scriptedGood).toBeNull();

    const humanGood = labeledSampleFromContribRecord(
      {
        tier: 'economical-cloud',
        success_label: true,
        outcome_signals: ['feedback_good'],
        label_provenance: 'human_feedback',
      },
      aggregateRowRequestId(1),
    );
    expect(humanGood?.success).toBe(true);

    const judgeBad = labeledSampleFromContribRecord(
      {
        tier: 'economical-cloud',
        success_label: false,
        outcome_signals: ['feedback_bad'],
        label_provenance: 'llm_judge',
      },
      aggregateRowRequestId(2),
    );
    expect(judgeBad?.success).toBe(false);

    // Untagged legacy rows still train install-local (synthetic fixture path).
    const untagged = labeledSampleFromContribRecord(
      {
        tier: 'economical-cloud',
        success_label: true,
        outcome_signals: ['feedback_good'],
      },
      aggregateRowRequestId(3),
    );
    expect(untagged?.success).toBe(true);
  });

  it('parseLabeledJsonl drops scripted_intent rows while keeping ship-grade ones', () => {
    const jsonl = [
      JSON.stringify({
        tier: 'economical-cloud',
        success_label: true,
        outcome_signals: ['feedback_good'],
        label_provenance: 'human_feedback',
      }),
      JSON.stringify({
        tier: 'economical-cloud',
        success_label: true,
        outcome_signals: ['feedback_good'],
        label_provenance: 'scripted_intent',
      }),
      JSON.stringify({
        tier: 'economical-cloud',
        success_label: true,
        outcome_signals: ['feedback_good'],
        // untagged legacy row
      }),
    ].join('\n');

    const samples = parseLabeledJsonl(jsonl);
    expect(samples).toHaveLength(2); // scripted row skipped, never coerced
    expect(samples.every((sample) => sample.success)).toBe(true);
  });
});
