// Extracted from tests/unit/router-pipeline.test.ts in SP-278 (wave 2, #155).
// Aligned with src/domain/pipeline/router-pipeline.ts (orchestrator registration,
// placeholder chain, StageResult type contract).
import { describe, expect, it } from 'vitest';

import { RouterPipeline, PIPELINE_STAGE_ORDER } from '../../src/domain/pipeline/router-pipeline.js';
import { fleet, makeRequest } from './router-pipeline-fixtures.js';

describe('RouterPipeline', () => {
  describe('pipeline stage order (SP-119)', () => {
    it('registers stages in documented integration order', () => {
      const pipeline = new RouterPipeline(fleet);
      const registered = (pipeline as unknown as { stages: { name: string }[] }).stages.map(
        (stage) => stage.name,
      );

      expect(registered).toEqual([...PIPELINE_STAGE_ORDER]);
    });
  });

  describe('stage chain with placeholders', () => {
    it('runs through all placeholder stages and returns safe default', async () => {
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.pin_reason).toBeNull();
      expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('preserves request_id in the fallback decision', async () => {
      const pipeline = new RouterPipeline(fleet);
      const request = makeRequest({ request_id: '11111111-1111-1111-1111-111111111111' });
      const decision = await pipeline.route(request);

      expect(decision.request_id).toBe('11111111-1111-1111-1111-111111111111');
    });
  });

  describe('StageResult type contract', () => {
    it('fallback decision satisfies RoutingDecision shape', async () => {
      const pipeline = new RouterPipeline(fleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision).toHaveProperty('request_id');
      expect(decision).toHaveProperty('selected_model_id');
      expect(decision).toHaveProperty('tier');
      expect(decision).toHaveProperty('stage');
      expect(decision).toHaveProperty('reason_code');
      expect(decision).toHaveProperty('routing_latency_ms');
      expect(decision).toHaveProperty('pin_reason');
    });
  });
});
