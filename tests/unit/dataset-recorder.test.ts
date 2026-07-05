import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import {
  DatasetRecorder,
  buildDatasetRecord,
  isDatasetRecordingEnabled,
} from '../../src/infrastructure/telemetry/dataset-recorder.js';

function makeRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    request_id: 'req-1',
    session_id: 'session-1',
    prompt_text: 'Fix the failing unit test for dataset capture',
    messages: [
      { role: 'user', content: 'Fix the failing unit test for dataset capture' },
    ],
    turn_type: 'main_loop',
    ...overrides,
  };
}

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    request_id: 'req-1',
    selected_model_id: 'gpt-5-mini',
    tier: 'economical-cloud',
    stage: 'hydra_match',
    reason_code: 'hydra_embedding_match',
    routing_latency_ms: 42,
    pin_reason: null,
    features: {
      triage: {
        verdict: 'complex',
        reason_code: 'complex_keywords',
        cyclomatic_score: 4,
      },
      requirements: {
        reasoning: 0.7,
        code_gen: 0.8,
        tool_use: 0.5,
      },
      candidates: [
        {
          model_id: 'gpt-5-mini',
          score: 0.9,
          shortfall: 0,
          rejected_reason: null,
        },
      ],
    },
    ...overrides,
  };
}

describe('dataset-recorder', () => {
  const originalDatasetEnv = process.env.SMART_ROUTER_DATASET;

  beforeEach(() => {
    delete process.env.SMART_ROUTER_DATASET;
  });

  afterEach(() => {
    if (originalDatasetEnv === undefined) {
      delete process.env.SMART_ROUTER_DATASET;
    } else {
      process.env.SMART_ROUTER_DATASET = originalDatasetEnv;
    }
  });

  describe('isDatasetRecordingEnabled', () => {
    it('is off by default', () => {
      expect(isDatasetRecordingEnabled()).toBe(false);
    });

    it('is on only when SMART_ROUTER_DATASET=1', () => {
      process.env.SMART_ROUTER_DATASET = '1';
      expect(isDatasetRecordingEnabled()).toBe(true);

      process.env.SMART_ROUTER_DATASET = 'true';
      expect(isDatasetRecordingEnabled()).toBe(false);
    });
  });

  describe('buildDatasetRecord', () => {
    it('maps routing metadata and feature sidecar without prompt text', () => {
      const request = makeRequest();
      const decision = makeDecision();

      const record = buildDatasetRecord(request, decision, '2026-07-04T12:00:00.000Z');

      expect(record.request_id).toBe('req-1');
      expect(record.turn_type).toBe('main_loop');
      expect(record.stage).toBe('hydra_match');
      expect(record.triage_verdict).toBe('complex');
      expect(record.requirement_code_gen).toBe(0.8);
      expect(record.candidates_json).toContain('gpt-5-mini');
      expect(record.prompt_length_chars).toBe(request.prompt_text.length);
      expect(JSON.stringify(record)).not.toContain(request.prompt_text);
      expect(record).not.toHaveProperty('prompt_text');
      expect(record).not.toHaveProperty('messages');
    });

    it('marks tool context from tool_result turns', () => {
      const record = buildDatasetRecord(
        makeRequest({ turn_type: 'tool_result' }),
        makeDecision(),
        '2026-07-04T12:00:00.000Z',
      );

      expect(record.has_tool_context).toBe(true);
    });
  });

  describe('DatasetRecorder', () => {
    it('does not persist when dataset mode is off', () => {
      const onRecord = vi.fn();
      const recorder = new DatasetRecorder({ onRecord });

      expect(recorder.record(makeRequest(), makeDecision())).toBeNull();
      expect(onRecord).not.toHaveBeenCalled();
    });

    it('persists and notifies once when dataset mode is enabled', () => {
      process.env.SMART_ROUTER_DATASET = '1';
      const onRecord = vi.fn();
      const onFirstEnable = vi.fn();
      const recorder = new DatasetRecorder({ onRecord, onFirstEnable });

      recorder.record(makeRequest(), makeDecision());
      recorder.record(makeRequest({ request_id: 'req-2' }), makeDecision({ request_id: 'req-2' }));

      expect(onRecord).toHaveBeenCalledTimes(2);
      expect(onFirstEnable).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(onRecord.mock.calls[0]?.[0])).not.toContain(
        'Fix the failing unit test for dataset capture',
      );
    });
  });
});
