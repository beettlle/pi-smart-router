/**
 * MVP integration test — T023, SC-001.
 *
 * Validates the full Request → Decision → Dispatch path through
 * the router pipeline. Verifies that every request receives a tier
 * Release matrix: MVP Request → Decision → Dispatch path (SC-001).
 */

import { describe, expect, it } from 'vitest';

import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'test-provider',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'mvp-test-0001',
    session_id: 'session-mvp-001',
    prompt_text: 'Fix the failing test in auth module',
    ...overrides,
  };
}

const mvpFleet: ModelProfile[] = [
  makeModel({ id: 'local-llama-3', tier: 'zero-tier', provider: 'ollama' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
  makeModel({ id: 'claude-sonnet', tier: 'economical-cloud', provider: 'anthropic' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
];

// ─── Integration: Request → Decision → Dispatch ──────────────────────────────

describe('@release', () => {
describe('MVP Integration: pipeline-mvp', () => {
  describe('SC-001: automatic model selection without manual picking', () => {
    it('routes a request and returns a tier assignment via GatewayDispatch', async () => {
      const gateway = new GatewayDispatch(mvpFleet);
      const request = makeRequest();

      const decision = await gateway.dispatch(request);

      expect(decision.request_id).toBe(request.request_id);
      expect(decision.selected_model_id).toBeDefined();
      expect(decision.selected_model_id).not.toBe('');
      expect(decision.tier).toMatch(/^(zero-tier|economical-cloud|frontier-cloud)$/);
      expect(decision.stage).toBeDefined();
      expect(decision.reason_code).toBeDefined();
      expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('routes varied prompts without requiring manual model config', async () => {
      const gateway = new GatewayDispatch(mvpFleet);
      const prompts = [
        'Format this JSON file',
        'Design a distributed caching architecture for our microservices',
        'Run the linter',
        'Debug the memory leak in the WebSocket handler',
        'Add a comment to this function',
      ];

      for (const prompt of prompts) {
        const request = makeRequest({
          request_id: `req-${prompt.slice(0, 8)}`,
          prompt_text: prompt,
        });
        const decision = await gateway.dispatch(request);

        expect(decision.request_id).toBe(request.request_id);
        expect(decision.tier).toMatch(/^(zero-tier|economical-cloud|frontier-cloud)$/);
        expect(decision.selected_model_id).toBeDefined();
      }
    });

    it('completes routing within bounded latency', async () => {
      const gateway = new GatewayDispatch(mvpFleet);
      const request = makeRequest();

      const start = Date.now();
      const decision = await gateway.dispatch(request);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
      expect(decision.routing_latency_ms).toBeLessThan(100);
    });
  });

  describe('end-to-end pipeline flow', () => {
    it('pipeline.route produces a complete RoutingDecision', async () => {
      const pipeline = new RouterPipeline(mvpFleet);
      const request = makeRequest();

      const decision = await pipeline.route(request);

      expect(decision).toEqual(
        expect.objectContaining({
          request_id: request.request_id,
          selected_model_id: expect.any(String),
          tier: expect.stringMatching(/^(zero-tier|economical-cloud|frontier-cloud)$/),
          stage: expect.any(String),
          reason_code: expect.any(String),
          routing_latency_ms: expect.any(Number),
        }),
      );
    });

    it('gateway.dispatch delegates to pipeline and returns same shape', async () => {
      const pipeline = new RouterPipeline(mvpFleet);
      const gateway = new GatewayDispatch(mvpFleet);
      const request = makeRequest();

      const pipelineDecision = await pipeline.route(request);
      const gatewayDecision = await gateway.dispatch(request);

      expect(gatewayDecision.stage).toBe(pipelineDecision.stage);
      expect(gatewayDecision.reason_code).toBe(pipelineDecision.reason_code);
      expect(gatewayDecision.tier).toBe(pipelineDecision.tier);
      expect(gatewayDecision.selected_model_id).toBe(pipelineDecision.selected_model_id);
    });

    it('handles multiple sequential requests on same session', async () => {
      const gateway = new GatewayDispatch(mvpFleet);
      const sessionId = 'session-multi-turn';

      const decisions = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          gateway.dispatch(
            makeRequest({
              request_id: `turn-${i}`,
              session_id: sessionId,
              prompt_text: `Turn ${i} prompt content`,
            }),
          ),
        ),
      );

      for (const decision of decisions) {
        expect(decision.tier).toMatch(/^(zero-tier|economical-cloud|frontier-cloud)$/);
        expect(decision.selected_model_id).toBeDefined();
      }
    });

    it('handles requests with different turn types', async () => {
      const gateway = new GatewayDispatch(mvpFleet);
      const turnTypes = ['planning', 'tool_result', 'subagent', 'main_loop', 'unknown'] as const;

      for (const turnType of turnTypes) {
        const decision = await gateway.dispatch(
          makeRequest({
            request_id: `turn-type-${turnType}`,
            turn_type: turnType,
          }),
        );
        expect(decision.tier).toMatch(/^(zero-tier|economical-cloud|frontier-cloud)$/);
      }
    });
  });

  describe('FR-022: safe default on routing failure', () => {
    it('returns safe default when all stages pass through', async () => {
      const gateway = new GatewayDispatch(mvpFleet);
      const decision = await gateway.dispatch(makeRequest());

      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.selected_model_id).toBe('gpt-4o-mini');
      expect(decision.tier).toBe('economical-cloud');
    });

    it('selects economical-cloud as safe default per FR-022', async () => {
      const gateway = new GatewayDispatch(mvpFleet);
      const decision = await gateway.dispatch(makeRequest());

      expect(decision.tier).toBe('economical-cloud');
    });

    it('falls back to frontier when no healthy economical models exist', async () => {
      const degradedFleet = [
        makeModel({ id: 'econ-down', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'frontier-ok', tier: 'frontier-cloud' }),
      ];
      const gateway = new GatewayDispatch(degradedFleet);
      const decision = await gateway.dispatch(makeRequest());

      expect(decision.selected_model_id).toBe('frontier-ok');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.stage).toBe('fallback');
    });

    it('never crashes even with completely empty fleet', async () => {
      const gateway = new GatewayDispatch([]);
      const decision = await gateway.dispatch(makeRequest());

      expect(decision).toBeDefined();
      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.selected_model_id).toBe('unknown');
    });

    it('never throws to the host agent', async () => {
      const gateway = new GatewayDispatch([]);
      await expect(gateway.dispatch(makeRequest())).resolves.toBeDefined();

      const gatewayEmpty = new GatewayDispatch([]);
      await expect(
        gatewayEmpty.dispatch(makeRequest({ prompt_text: '' })),
      ).resolves.toBeDefined();
    });
  });
});
});
