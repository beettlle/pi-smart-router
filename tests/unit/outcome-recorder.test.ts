import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OutcomeRecorder,
  buildOutcomeRecord,
} from '../../src/infrastructure/telemetry/outcome-recorder.js';

const snapshot = {
  lastRequestId: 'req-auto-1',
  lastSelectedModelId: 'gpt-5-mini',
};

describe('outcome-recorder', () => {
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

  describe('buildOutcomeRecord', () => {
    it('builds privacy-safe outcome rows without prompt text', () => {
      const record = buildOutcomeRecord(
        'req-1',
        'session-1',
        'model_override',
        '2026-07-05T00:00:00.000Z',
        {
          routedModelId: 'gpt-5-mini',
          overrideModelId: 'gpt-4o',
        },
      );

      expect(record.request_id).toBe('req-1');
      expect(record.signal_type).toBe('model_override');
      expect(record.routed_model_id).toBe('gpt-5-mini');
      expect(record.override_model_id).toBe('gpt-4o');
      expect(JSON.stringify(record)).not.toContain('prompt');
      expect(record).not.toHaveProperty('prompt_text');
    });
  });

  describe('OutcomeRecorder', () => {
    it('does not persist when dataset mode is off', () => {
      const onRecord = vi.fn();
      const recorder = new OutcomeRecorder({ onRecord });

      expect(
        recorder.recordModelOverride(snapshot, 'session-1', 'gpt-4o'),
      ).toBeNull();
      expect(onRecord).not.toHaveBeenCalled();
    });

    it('records model override when dataset mode is enabled', () => {
      process.env.SMART_ROUTER_DATASET = '1';
      const onRecord = vi.fn();
      const recorder = new OutcomeRecorder({
        onRecord,
        clock: () => '2026-07-05T00:00:00.000Z',
      });

      const record = recorder.recordModelOverride(snapshot, 'session-1', 'gpt-4o');

      expect(record?.signal_type).toBe('model_override');
      expect(record?.request_id).toBe('req-auto-1');
      expect(onRecord).toHaveBeenCalledOnce();
    });

    it('skips model override when override matches routed model', () => {
      process.env.SMART_ROUTER_DATASET = '1';
      const onRecord = vi.fn();
      const recorder = new OutcomeRecorder({ onRecord });

      expect(
        recorder.recordModelOverride(snapshot, 'session-1', 'gpt-5-mini'),
      ).toBeNull();
      expect(onRecord).not.toHaveBeenCalled();
    });

    it('records compaction pin break and feedback labels', () => {
      process.env.SMART_ROUTER_DATASET = '1';
      const onRecord = vi.fn();
      const recorder = new OutcomeRecorder({ onRecord });

      recorder.recordCompactionPinBreak(snapshot, 'session-1');
      recorder.recordFeedback(snapshot, 'session-1', 'good');
      recorder.recordFeedback(snapshot, 'session-1', 'bad');

      expect(onRecord).toHaveBeenCalledTimes(3);
      expect(onRecord.mock.calls[0]?.[0]?.signal_type).toBe('compaction_pin_break');
      expect(onRecord.mock.calls[1]?.[0]?.signal_type).toBe('feedback_good');
      expect(onRecord.mock.calls[2]?.[0]?.signal_type).toBe('feedback_bad');
    });
  });
});
