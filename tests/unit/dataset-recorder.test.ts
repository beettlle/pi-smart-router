import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHmac } from 'node:crypto';

import type { RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import {
  DatasetRecorder,
  buildDatasetRecord,
  computePromptFingerprint,
  getDatasetPepperPath,
  isDatasetFingerprintEnabled,
  isDatasetRecordingEnabled,
  loadOrCreateDatasetPepper,
  normalizePromptForFingerprint,
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
      tier_hint: null,
      tier_hint_reason_code: null,
      low_intensity_score: null,
    },
    ...overrides,
  };
}

describe('dataset-recorder', () => {
  const originalDatasetEnv = process.env.SMART_ROUTER_DATASET;
  const originalFingerprintEnv = process.env.SMART_ROUTER_DATASET_FINGERPRINT;

  beforeEach(() => {
    delete process.env.SMART_ROUTER_DATASET;
    delete process.env.SMART_ROUTER_DATASET_FINGERPRINT;
  });

  afterEach(() => {
    if (originalDatasetEnv === undefined) {
      delete process.env.SMART_ROUTER_DATASET;
    } else {
      process.env.SMART_ROUTER_DATASET = originalDatasetEnv;
    }

    if (originalFingerprintEnv === undefined) {
      delete process.env.SMART_ROUTER_DATASET_FINGERPRINT;
    } else {
      process.env.SMART_ROUTER_DATASET_FINGERPRINT = originalFingerprintEnv;
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

  describe('isDatasetFingerprintEnabled', () => {
    it('is off by default', () => {
      expect(isDatasetFingerprintEnabled()).toBe(false);
    });

    it('requires SMART_ROUTER_DATASET=1 and SMART_ROUTER_DATASET_FINGERPRINT=1', () => {
      process.env.SMART_ROUTER_DATASET_FINGERPRINT = '1';
      expect(isDatasetFingerprintEnabled()).toBe(false);

      process.env.SMART_ROUTER_DATASET = '1';
      expect(isDatasetFingerprintEnabled()).toBe(true);
    });
  });

  describe('normalizePromptForFingerprint', () => {
    it('trims and collapses whitespace', () => {
      expect(normalizePromptForFingerprint('  hello   world  ')).toBe('hello world');
    });
  });

  describe('computePromptFingerprint', () => {
    it('returns HMAC-SHA256 hex of normalized prompt', () => {
      const pepper = Buffer.from('a'.repeat(64), 'hex');
      const prompt = '  duplicate   prompt  ';
      const expected = createHmac('sha256', pepper)
        .update('duplicate prompt')
        .digest('hex');

      expect(computePromptFingerprint(pepper, prompt)).toBe(expected);
    });
  });

  describe('loadOrCreateDatasetPepper', () => {
    it('creates and reuses install-local pepper file', () => {
      const cwd = mkdtempSync(join(tmpdir(), 'dataset-pepper-'));
      try {
        const pepperPath = getDatasetPepperPath(cwd);
        const first = loadOrCreateDatasetPepper(cwd);
        const second = loadOrCreateDatasetPepper(cwd);

        expect(first).toHaveLength(32);
        expect(second.equals(first)).toBe(true);
        expect(readFileSync(pepperPath, 'utf8')).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
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
      expect(record.prompt_fingerprint).toBeNull();
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

    it('stores fingerprint when fingerprint mode is enabled', () => {
      process.env.SMART_ROUTER_DATASET = '1';
      process.env.SMART_ROUTER_DATASET_FINGERPRINT = '1';
      const pepper = Buffer.from('b'.repeat(64), 'hex');
      const onRecord = vi.fn();
      const recorder = new DatasetRecorder({
        onRecord,
        loadPepper: () => pepper,
      });

      recorder.record(makeRequest(), makeDecision());

      const record = onRecord.mock.calls[0]?.[0];
      expect(record?.prompt_fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(record?.prompt_fingerprint).toBe(
        computePromptFingerprint(pepper, makeRequest().prompt_text),
      );
      expect(JSON.stringify(record)).not.toContain(pepper.toString('hex'));
    });

    it('leaves fingerprint null when fingerprint mode is disabled', () => {
      process.env.SMART_ROUTER_DATASET = '1';
      const onRecord = vi.fn();
      const recorder = new DatasetRecorder({ onRecord });

      recorder.record(makeRequest(), makeDecision());

      expect(onRecord.mock.calls[0]?.[0]?.prompt_fingerprint).toBeNull();
    });
  });
});
