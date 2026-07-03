import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'test',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: '00000000-0000-0000-0000-000000000001',
    session_id: 'sess-1',
    prompt_text: 'Hello world',
    ...overrides,
  };
}

const fleet: ModelProfile[] = [
  makeModel({ id: 'local-llama', tier: 'zero-tier' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
];

describe('RouterPipeline', () => {
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

  describe('safe default fallback on failure', () => {
    it('returns safe default when fleet has only frontier models', async () => {
      const frontierOnly = [makeModel({ id: 'opus', tier: 'frontier-cloud' })];
      const pipeline = new RouterPipeline(frontierOnly);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('opus');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.stage).toBe('fallback');
    });

    it('returns unknown model when fleet is empty', async () => {
      const pipeline = new RouterPipeline([]);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('unknown');
      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
    });

    it('never throws even with empty fleet', async () => {
      const pipeline = new RouterPipeline([]);
      await expect(pipeline.route(makeRequest())).resolves.toBeDefined();
    });

    it('skips unhealthy economical models and falls back to frontier', async () => {
      const mixedFleet = [
        makeModel({ id: 'econ-down', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'frontier-up', tier: 'frontier-cloud' }),
      ];
      const pipeline = new RouterPipeline(mixedFleet);
      const decision = await pipeline.route(makeRequest());

      expect(decision.selected_model_id).toBe('frontier-up');
      expect(decision.tier).toBe('frontier-cloud');
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
