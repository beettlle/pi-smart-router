/**
 * Unit tests for human-label-review CLI (SP-287 / close #168).
 */

import { describe, expect, it } from 'vitest';

import {
  answersFromExistingFeedback,
  applyReviewDecisions,
  assertNoTaintedPromptKeys,
  emitHumanFeedbackRow,
  HumanLabelReviewError,
  loadDatasetQueue,
  loadDisagreementQueue,
  loadTelemetryContribQueue,
  parseAnswersFile,
} from '../../scripts/calibration/human-label-review.js';

const sampleContrib = {
  version: 2,
  timestamp: '2026-09-11T12:00:00.000Z',
  row_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  session_id_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  turn_type: 'main_loop',
  stage: 'hydra_match',
  reason_code: 'hydra_embedding_match',
  selected_model_id: 'gpt-4o-mini',
  tier: 'economical-cloud',
  routing_latency_ms: 12,
  estimated_cost_usd: 0.001,
  estimated_input_tokens: 60,
  prompt_length_chars: 240,
  message_count: 1,
  has_tool_context: false,
  compaction_flag: false,
  success_label: true,
  outcome_signals: ['feedback_good'],
};

describe('human-label-review (SP-287)', () => {
  it('loads telemetry-contrib JSON and rejects tainted prompt keys', () => {
    const items = loadTelemetryContribQueue(JSON.stringify([sampleContrib]));
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe('telemetry_contrib');
    expect(items[0]!.display.signals).toContain('feedback_good');

    expect(() =>
      loadTelemetryContribQueue(
        JSON.stringify([{ ...sampleContrib, prompt_text: 'secret' }]),
      ),
    ).toThrow(HumanLabelReviewError);
  });

  it('dataset loader strips prompt text and keeps feature hash only', () => {
    const line = JSON.stringify({
      request_id: 'req-1',
      session_id: 'sess-1',
      prompt_text: 'do not leak',
      tier: 'frontier-cloud',
      selected_model_id: 'opus',
      outcome_signals: ['feedback_bad'],
      success_label: false,
      routing_latency_ms: 1,
      estimated_cost_usd: 0,
      estimated_input_tokens: 10,
      has_tool_context: false,
      compaction_flag: false,
      turn_type: 'main_loop',
      stage: 'triage',
      reason_code: 'x',
    });
    const items = loadDatasetQueue(line);
    expect(items).toHaveLength(1);
    expect(items[0]!.display.summary).toContain('prompt_hash=');
    expect(items[0]!.baseRecord).not.toHaveProperty('prompt_text');
    expect(items[0]!.baseRecord).not.toHaveProperty('session_id');
    expect(() =>
      assertNoTaintedPromptKeys(items[0]!.baseRecord as Record<string, unknown>),
    ).not.toThrow();
  });

  it('emits human_feedback provenance and correct success_label', () => {
    const [item] = loadTelemetryContribQueue(JSON.stringify([sampleContrib]));
    const good = emitHumanFeedbackRow(item!, 'good');
    expect(good.label_provenance).toBe('human_feedback');
    expect(good.success_label).toBe(true);
    expect(good.outcome_signals).toEqual(['feedback_good']);

    const bad = emitHumanFeedbackRow(item!, 'bad');
    expect(bad.success_label).toBe(false);
    expect(bad.outcome_signals).toEqual(['feedback_bad']);
  });

  it('skip never emits; from-existing-feedback reaffirms signals only', () => {
    const unlabeled = {
      ...sampleContrib,
      success_label: null,
      outcome_signals: [],
      row_id: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    };
    const items = loadTelemetryContribQueue(
      JSON.stringify([sampleContrib, unlabeled]),
    );
    const answers = answersFromExistingFeedback(items);
    expect(answers[items[0]!.id]).toBe('good');
    expect(answers[items[1]!.id]).toBe('skip');

    const result = applyReviewDecisions(items, answers);
    expect(result.emitted).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.emitted[0]!.label_provenance).toBe('human_feedback');
  });

  it('parseAnswersFile + labeled-only filter', () => {
    const items = loadTelemetryContribQueue(
      JSON.stringify([
        sampleContrib,
        { ...sampleContrib, outcome_signals: [], row_id: 'd'.repeat(64) },
      ]),
      { labeledOnly: true },
    );
    expect(items).toHaveLength(1);
    const answers = parseAnswersFile(`${items[0]!.id} bad\n`);
    const result = applyReviewDecisions(items, answers);
    expect(result.emitted[0]!.success_label).toBe(false);
  });

  it('loads campaign disagreements from report.disagreements', () => {
    const report = {
      campaign_valid: true,
      disagreements: [
        {
          taskId: 't1',
          generatorId: 'gen-a',
          graderScores: { 'grader-a': 2, 'grader-b': 9 },
        },
      ],
    };
    const items = loadDisagreementQueue(JSON.stringify(report));
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe('campaign_disagreement');
    expect(items[0]!.display.graderScores).toEqual({
      'grader-a': 2,
      'grader-b': 9,
    });
    const emitted = emitHumanFeedbackRow(items[0]!, 'good');
    expect(emitted.label_provenance).toBe('human_feedback');
    expect(emitted.outcome_signals).toContain('feedback_good');
  });

  it('fails closed when report lacks disagreements array', () => {
    expect(() => loadDisagreementQueue(JSON.stringify({ totals: {} }))).toThrow(
      /missing disagreements/,
    );
  });
});
