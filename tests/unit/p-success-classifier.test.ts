import { describe, expect, it, vi } from 'vitest';

import type { RoutingDatasetRecord, RoutingOutcomeRecord } from '../../src/domain/types/index.js';
import {
  MIN_TRAINING_SAMPLES,
  NEUTRAL_P_SUCCESS,
  attachOutcomeLabelsToExport,
  createDefaultPSuccessWeights,
  deriveSuccessLabel,
  deriveSuccessLabelFromExportRow,
  deriveVerifierFailureSignals,
  extractFailureProxies,
  extractPSuccessFeatures,
  joinDatasetWithOutcomes,
  loadPSuccessWeights,
  parseTrainingExportLine,
  predictPSuccessCheap,
  predictPSuccessCheapTimed,
  resolvePSuccessWeights,
  trainFromExportJsonl,
  trainFromLabeledSamples,
} from '../../src/domain/routing/p-success-classifier.js';
import { DEFAULT_CONTEXT_FIT_DATASET_FIELDS, DEFAULT_TIER_SELECTION_DATASET_FIELDS } from '../../src/infrastructure/telemetry/routing-telemetry.js';

function makeDatasetRecord(
  overrides: Partial<RoutingDatasetRecord> = {},
): RoutingDatasetRecord {
  return {
    request_id: 'req-1',
    timestamp: '2026-07-06T12:00:00.000Z',
    turn_type: 'main_loop',
    stage: 'hydra_match',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    candidates_json: null,
    prompt_length_chars: 400,
    estimated_input_tokens: 100,
    message_count: 2,
    has_tool_context: false,
    compaction_flag: false,
    triage_verdict: 'ambiguous',
    triage_reason_code: 'mixed_signals',
    triage_cyclomatic_score: 0.2,
    triage_trivial_hits: 0,
    triage_complex_hits: 1,
    triage_sanitized_length_delta: 0,
    requirement_reasoning: 0.3,
    requirement_code_gen: 0.4,
    requirement_tool_use: 0.1,
    routing_latency_ms: 25,
    estimated_cost_usd: 0.001,
    prompt_fingerprint: null,
    ...DEFAULT_CONTEXT_FIT_DATASET_FIELDS,
    ...DEFAULT_TIER_SELECTION_DATASET_FIELDS,
    ...overrides,
  };
}

function makeOutcome(
  overrides: Partial<RoutingOutcomeRecord> = {},
): RoutingOutcomeRecord {
  return {
    request_id: 'req-1',
    session_id: 'sess-1',
    timestamp: '2026-07-06T12:01:00.000Z',
    signal_type: 'feedback_good',
    routed_model_id: 'gpt-4o-mini',
    override_model_id: null,
    ...overrides,
  };
}

describe('deriveSuccessLabel', () => {
  it('marks model_override as failure', () => {
    const result = deriveSuccessLabel([
      makeOutcome({ signal_type: 'model_override', override_model_id: 'claude-opus' }),
    ]);
    expect(result.success).toBe(false);
    expect(result.outcome_signals).toContain('model_override');
  });

  it('marks feedback_bad as failure', () => {
    const result = deriveSuccessLabel([makeOutcome({ signal_type: 'feedback_bad' })]);
    expect(result.success).toBe(false);
  });

  it('marks feedback_good as success', () => {
    const result = deriveSuccessLabel([makeOutcome({ signal_type: 'feedback_good' })]);
    expect(result.success).toBe(true);
  });

  it('returns null success when no outcomes are linked', () => {
    const result = deriveSuccessLabel([]);
    expect(result.success).toBeNull();
    expect(result.outcome_signals).toEqual([]);
  });

  it('marks verifier failure proxies as failure when provided', () => {
    const result = deriveSuccessLabel([], {
      failureProxies: {
        tool_failure_chain_count: 2,
        stop_reason_invalid: true,
        reprompt_rate: 0.8,
        edit_distance_proxy: 0.9,
      },
    });

    expect(result.success).toBe(false);
    expect(result.outcome_signals).toEqual(
      expect.arrayContaining([
        'tool_failure_chain',
        'stop_reason_invalid',
        'reprompt_detected',
        'high_edit_distance',
      ]),
    );
  });

  it('wires execution telemetry failure signals into training labels', () => {
    const result = deriveSuccessLabelFromExportRow({
      request_id: 'req-exec',
      outcome_signals: ['stop_reason_length', 'provider_failover'],
      success_label: true,
    });

    expect(result.success).toBe(false);
    expect(result.outcome_signals).toEqual(
      expect.arrayContaining(['stop_reason_length', 'provider_failover']),
    );
  });
});

describe('joinDatasetWithOutcomes', () => {
  it('joins dataset rows with outcome-derived labels', () => {
    const samples = joinDatasetWithOutcomes(
      [makeDatasetRecord({ request_id: 'req-a' }), makeDatasetRecord({ request_id: 'req-b' })],
      [
        makeOutcome({ request_id: 'req-a', signal_type: 'feedback_good' }),
        makeOutcome({ request_id: 'req-b', signal_type: 'model_override', override_model_id: 'x' }),
      ],
    );

    expect(samples).toHaveLength(2);
    expect(samples[0]?.success).toBe(true);
    expect(samples[1]?.success).toBe(false);
  });
});

describe('failure proxy label mapping (SP-131)', () => {
  it('extracts normalized proxies from telemetry scalars', () => {
    const proxies = extractFailureProxies({
      consecutive_tool_failures: 1,
      stop_reason: 'content_filter',
      reprompt_count: 1,
      turn_index_in_session: 4,
      prompt_length_chars: 1_000,
      prior_prompt_length_chars: 200,
    });

    expect(proxies.tool_failure_chain_count).toBe(1);
    expect(proxies.stop_reason_invalid).toBe(true);
    expect(proxies.reprompt_rate).toBe(0.25);
    expect(proxies.edit_distance_proxy).toBeCloseTo(0.8);
  });

  it('derives verifier failure signals from proxy thresholds', () => {
    const signals = deriveVerifierFailureSignals({
      tool_failure_chain_count: 2,
      stop_reason_invalid: false,
      reprompt_rate: 0.6,
      edit_distance_proxy: 0.2,
    });

    expect(signals).toEqual(['tool_failure_chain', 'reprompt_detected']);
  });

  it('marks export rows failed when only failure proxies are present', () => {
    const labeled = deriveSuccessLabelFromExportRow({
      request_id: 'req-proxy',
      consecutive_tool_failures: 2,
      success_label: true,
      outcome_signals: [],
    });

    expect(labeled.success).toBe(false);
    expect(labeled.outcome_signals).toContain('tool_failure_chain');
    expect(labeled.failure_proxies.tool_failure_chain_count).toBe(2);
  });
});

describe('attachOutcomeLabelsToExport', () => {
  it('adds success_label and outcome_signals without prompt fields', () => {
    const labeled = attachOutcomeLabelsToExport(
      { request_id: 'req-1', prompt_length_chars: 10 },
      [makeOutcome({ signal_type: 'feedback_bad' })],
    );

    expect(labeled.success_label).toBe(false);
    expect(labeled.outcome_signals).toEqual(['feedback_bad']);
    expect(labeled).not.toHaveProperty('prompt_text');
    expect(labeled.tool_failure_chain_count).toBeNull();
  });

  it('includes failure proxy fields when telemetry scalars are present', () => {
    const labeled = attachOutcomeLabelsToExport(
      {
        request_id: 'req-1',
        prompt_length_chars: 10,
        stop_reason: 'length',
        reprompt_count: 2,
        turn_index_in_session: 2,
      },
      [makeOutcome({ signal_type: 'feedback_good' })],
    );

    expect(labeled.success_label).toBe(false);
    expect(labeled.outcome_signals).toEqual(
      expect.arrayContaining(['feedback_good', 'stop_reason_invalid', 'reprompt_detected']),
    );
    expect(labeled.stop_reason_invalid).toBe(true);
    expect(labeled.reprompt_rate).toBe(1);
  });
});

describe('extractPSuccessFeatures', () => {
  it('normalizes dataset fields into bounded features', () => {
    const features = extractPSuccessFeatures(makeDatasetRecord());
    expect(features.prompt_length_norm).toBeGreaterThan(0);
    expect(features.economical_tier).toBe(1);
    expect(features.requirement_reasoning).toBe(0.3);
  });
});

describe('trainFromLabeledSamples', () => {
  it('learns separable weights from mocked training data', () => {
    const successSample = {
      request_id: 'ok',
      features: extractPSuccessFeatures(
        makeDatasetRecord({
          prompt_length_chars: 100,
          triage_cyclomatic_score: 0.1,
          requirement_reasoning: 0.1,
        }),
      ),
      success: true,
      outcome_signals: ['feedback_good'] as const,
      failure_proxies: {
        tool_failure_chain_count: null,
        stop_reason_invalid: null,
        reprompt_rate: null,
        edit_distance_proxy: null,
      },
    };
    const failureSample = {
      request_id: 'bad',
      features: extractPSuccessFeatures(
        makeDatasetRecord({
          prompt_length_chars: 7_000,
          triage_cyclomatic_score: 0.9,
          requirement_reasoning: 0.9,
          tier: 'frontier-cloud',
        }),
      ),
      success: false,
      outcome_signals: ['feedback_bad'] as const,
      failure_proxies: {
        tool_failure_chain_count: null,
        stop_reason_invalid: null,
        reprompt_rate: null,
        edit_distance_proxy: null,
      },
    };

    const repeated = Array.from({ length: 20 }, (_, index) =>
      index % 2 === 0 ? successSample : failureSample,
    );
    const weights = trainFromLabeledSamples(repeated, { epochs: 400, learningRate: 0.2 });
    expect(weights.trained_sample_count).toBe(20);

    const highP = predictPSuccessCheap(successSample.features, {
      ...weights,
      min_training_samples: 10,
    });
    const lowP = predictPSuccessCheap(failureSample.features, {
      ...weights,
      min_training_samples: 10,
    });

    expect(highP).toBeGreaterThan(lowP);
    expect(highP).toBeGreaterThanOrEqual(0);
    expect(highP).toBeLessThanOrEqual(1);
    expect(lowP).toBeGreaterThanOrEqual(0);
    expect(lowP).toBeLessThanOrEqual(1);
  });
});

describe('predictPSuccessCheap insufficient-data fallback', () => {
  it('returns neutral P when trained_sample_count is below min_training_samples', () => {
    const weights = createDefaultPSuccessWeights();
    const features = extractPSuccessFeatures(makeDatasetRecord());

    expect(weights.trained_sample_count).toBeLessThan(MIN_TRAINING_SAMPLES);
    expect(predictPSuccessCheap(features, weights)).toBe(NEUTRAL_P_SUCCESS);
  });

  it('returns neutral P for default example artifact', () => {
    const features = extractPSuccessFeatures(makeDatasetRecord());
    expect(predictPSuccessCheap(features, createDefaultPSuccessWeights())).toBe(NEUTRAL_P_SUCCESS);
  });
});

describe('trainFromExportJsonl', () => {
  it('trains from labeled JSONL export lines', () => {
    const line = JSON.stringify({
      ...makeDatasetRecord({ request_id: 'export-1' }),
      success_label: true,
      outcome_signals: ['feedback_good'],
    });
    const weights = trainFromExportJsonl(`${line}\n`);
    expect(weights.trained_sample_count).toBe(1);
    expect(weights.feature_names).toHaveLength(10);
  });

  it('parses export lines with verifier failure proxies via parseTrainingExportLine', () => {
    const parsed = parseTrainingExportLine(
      JSON.stringify({
        request_id: 'export-2',
        prompt_length_chars: 50,
        estimated_input_tokens: 12,
        triage_cyclomatic_score: 0.5,
        requirement_reasoning: 0.2,
        requirement_code_gen: 0.2,
        requirement_tool_use: 0.2,
        has_tool_context: false,
        compaction_flag: false,
        routing_latency_ms: 10,
        tier: 'economical-cloud',
        consecutive_tool_failures: 2,
        stop_reason: 'unknown',
      }),
    );

    expect(parsed?.request_id).toBe('export-2');
    expect(parsed?.success).toBe(false);
    expect(parsed?.outcome_signals).toEqual(
      expect.arrayContaining(['tool_failure_chain', 'stop_reason_invalid']),
    );
    expect(parsed?.failure_proxies.tool_failure_chain_count).toBe(2);
  });

  it('parses export lines via parseTrainingExportLine (behavioral only)', () => {
    const parsed = parseTrainingExportLine(
      JSON.stringify({
        request_id: 'export-3',
        prompt_length_chars: 50,
        estimated_input_tokens: 12,
        triage_cyclomatic_score: 0.5,
        requirement_reasoning: 0.2,
        requirement_code_gen: 0.2,
        requirement_tool_use: 0.2,
        has_tool_context: false,
        compaction_flag: false,
        routing_latency_ms: 10,
        tier: 'economical-cloud',
        success_label: false,
        outcome_signals: ['model_override'],
      }),
    );

    expect(parsed?.request_id).toBe('export-3');
    expect(parsed?.success).toBe(false);
  });
});

describe('loadPSuccessWeights (SP-105)', () => {
  it('returns null when artifact file is missing', () => {
    expect(loadPSuccessWeights({ filePath: '/nonexistent/p-success-weights.json' })).toBeNull();
  });

  it('resolvePSuccessWeights falls back to default when missing', () => {
    const weights = resolvePSuccessWeights({ filePath: '/nonexistent/p-success-weights.json' });
    expect(weights.trained_sample_count).toBe(0);
    expect(predictPSuccessCheap(extractPSuccessFeatures(makeDatasetRecord()), weights)).toBe(
      NEUTRAL_P_SUCCESS,
    );
  });
});

describe('predictPSuccessCheapTimed (SP-105)', () => {
  it('returns probability within latency budget for trained weights', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(101);

    const weights = {
      ...createDefaultPSuccessWeights(),
      intercept: 2,
      trained_sample_count: 50,
    };
    const features = extractPSuccessFeatures(makeDatasetRecord());
    const result = predictPSuccessCheapTimed(features, weights);

    expect(result.probability).toBeGreaterThan(0.5);
    expect(result.elapsed_ms).toBe(1);
    expect(result.within_budget).toBe(true);
    expect(Object.keys(result.feature_importances)).toHaveLength(10);

    nowSpy.mockRestore();
  });

  it('flags predictions that exceed the latency budget', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(106);

    const weights = createDefaultPSuccessWeights();
    const features = extractPSuccessFeatures(makeDatasetRecord());
    const result = predictPSuccessCheapTimed(features, weights, 5);

    expect(result.elapsed_ms).toBe(6);
    expect(result.within_budget).toBe(false);

    nowSpy.mockRestore();
  });
});

describe('shipped dogfood P(success) weights (SP-175)', () => {
  it('loads config/p-success-weights.json above the min-sample gate with non-neutral scores', () => {
    const weights = loadPSuccessWeights();
    expect(weights).not.toBeNull();
    expect(weights!.trained_sample_count).toBeGreaterThanOrEqual(MIN_TRAINING_SAMPLES);
    expect(weights!.min_training_samples).toBe(MIN_TRAINING_SAMPLES);

    const easy = extractPSuccessFeatures(
      makeDatasetRecord({
        prompt_length_chars: 120,
        triage_cyclomatic_score: 0.1,
        requirement_reasoning: 0.15,
      }),
    );
    const hard = extractPSuccessFeatures(
      makeDatasetRecord({
        prompt_length_chars: 4_000,
        triage_cyclomatic_score: 0.85,
        requirement_reasoning: 0.85,
        has_tool_context: true,
      }),
    );

    const easyP = predictPSuccessCheap(easy, weights!);
    const hardP = predictPSuccessCheap(hard, weights!);
    expect(easyP).not.toBe(NEUTRAL_P_SUCCESS);
    expect(hardP).not.toBe(NEUTRAL_P_SUCCESS);
    expect(easyP).toBeGreaterThan(hardP);
  });
});
