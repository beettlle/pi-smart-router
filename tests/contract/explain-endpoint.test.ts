/**
 * Contract tests for the explain endpoint — T042.
 *
 * Validates that createExplainHandler conforms to the explain-endpoint contract:
 *   - 200: valid request → RoutingDecision (bit-for-bit same as live pipeline)
 *   - 400: invalid schema → { error: "validation_failed", details: [] }
 *   - 503: pipeline failure → fallback decision with stage "fallback"
 *   - MUST NOT call upstream LLM providers (no upstream cost in telemetry)
 *
 * Contract source: specs/001-build-smart-router/contracts/explain-endpoint.md v1.0.0
 */

import { describe, expect, it, beforeEach } from 'vitest';

import {
  createExplainHandler,
  type ExplainHandlerDeps,
  type ExplainResult,
} from '../../src/api/explain/router-explain.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { RoutingDecisionSchema } from '../../src/domain/types/schemas.js';
import type { ModelProfile } from '../../src/domain/types/index.js';

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

const testFleet: ModelProfile[] = [
  makeModel({ id: 'local-llama-3', tier: 'zero-tier', provider: 'ollama' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
];

function validRequestBody(): Record<string, unknown> {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    session_id: 'sess-explain-001',
    prompt_text: 'Refactor the auth module to use JWT tokens',
  };
}

function fullRequestBody(): Record<string, unknown> {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    session_id: 'sess-explain-002',
    prompt_text: 'Implement caching layer for database queries',
    messages: [
      { role: 'user', content: 'Add Redis caching' },
      { role: 'assistant', content: 'I will add a caching layer.' },
    ],
    turn_type: 'tool_result',
    compaction_flag: false,
    estimated_input_tokens: 2048,
  };
}

// ─── Test suites ─────────────────────────────────────────────────────────────

describe('explain-endpoint contract', () => {
  let explain: (body: unknown) => Promise<ExplainResult>;

  beforeEach(() => {
    const pipeline = new RouterPipeline(testFleet);
    const deps: ExplainHandlerDeps = { fleet: testFleet, pipeline };
    explain = createExplainHandler(deps);
  });

  describe('200 — valid request returns RoutingDecision', () => {
    it('returns status 200 for a minimal valid request', async () => {
      const result = await explain(validRequestBody());
      expect(result.status).toBe(200);
    });

    it('response body conforms to RoutingDecision schema', async () => {
      const result = await explain(validRequestBody());
      expect(result.status).toBe(200);

      const zodResult = RoutingDecisionSchema.safeParse(result.body);
      expect(zodResult.success).toBe(true);
    });

    it('decision includes the same request_id as the input', async () => {
      const result = await explain(validRequestBody());
      expect(result.status).toBe(200);
      expect((result.body as { request_id: string }).request_id).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('returns valid decision for a full request with all optional fields', async () => {
      const result = await explain(fullRequestBody());
      expect(result.status).toBe(200);

      const zodResult = RoutingDecisionSchema.safeParse(result.body);
      expect(zodResult.success).toBe(true);
    });

    it('decision routing_latency_ms is non-negative', async () => {
      const result = await explain(validRequestBody());
      expect(result.status).toBe(200);
      expect((result.body as { routing_latency_ms: number }).routing_latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('decision has a valid tier', async () => {
      const result = await explain(validRequestBody());
      expect(result.status).toBe(200);
      expect((result.body as { tier: string }).tier).toMatch(
        /^(zero-tier|economical-cloud|frontier-cloud)$/,
      );
    });

    it('decision has a valid stage', async () => {
      const result = await explain(validRequestBody());
      expect(result.status).toBe(200);
      expect((result.body as { stage: string }).stage).toMatch(
        /^(triage|turn_envelope|session_pin|local_zero|hydra_match|fallback)$/,
      );
    });
  });

  describe('400 — invalid request returns validation error', () => {
    it('rejects missing request_id', async () => {
      const body = { ...validRequestBody() };
      delete (body as { request_id?: string }).request_id;
      const result = await explain(body);
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({
        error: 'validation_failed',
        details: expect.any(Array),
      });
    });

    it('rejects missing session_id', async () => {
      const body = { ...validRequestBody() };
      delete (body as { session_id?: string }).session_id;
      const result = await explain(body);
      expect(result.status).toBe(400);
      expect((result.body as { error: string }).error).toBe('validation_failed');
    });

    it('rejects missing prompt_text', async () => {
      const body = { ...validRequestBody() };
      delete (body as { prompt_text?: string }).prompt_text;
      const result = await explain(body);
      expect(result.status).toBe(400);
      expect((result.body as { error: string }).error).toBe('validation_failed');
    });

    it('rejects empty session_id', async () => {
      const body = { ...validRequestBody(), session_id: '' };
      const result = await explain(body);
      expect(result.status).toBe(400);
    });

    it('rejects non-uuid request_id', async () => {
      const body = { ...validRequestBody(), request_id: 'not-a-uuid' };
      const result = await explain(body);
      expect(result.status).toBe(400);
    });

    it('rejects invalid turn_type', async () => {
      const body = { ...validRequestBody(), turn_type: 'invalid_turn' };
      const result = await explain(body);
      expect(result.status).toBe(400);
    });

    it('rejects negative estimated_input_tokens', async () => {
      const body = { ...validRequestBody(), estimated_input_tokens: -1 };
      const result = await explain(body);
      expect(result.status).toBe(400);
    });

    it('details array is non-empty on validation failure', async () => {
      const result = await explain({});
      expect(result.status).toBe(400);
      expect((result.body as unknown as { details: string[] }).details.length).toBeGreaterThan(0);
    });
  });

  describe('503 — pipeline failure returns fallback decision', () => {
    it('returns 503 with stage "fallback" when pipeline throws', async () => {
      const brokenPipeline = new RouterPipeline(testFleet);
      // Force pipeline to throw by monkey-patching route
      brokenPipeline.route = () => {
        throw new Error('simulated pipeline failure');
      };
      const deps: ExplainHandlerDeps = { fleet: testFleet, pipeline: brokenPipeline };
      const brokenExplain = createExplainHandler(deps);

      const result = await brokenExplain(validRequestBody());
      expect(result.status).toBe(503);
      expect((result.body as { stage: string }).stage).toBe('fallback');
    });

    it('503 body includes safe_default reason_code', async () => {
      const brokenPipeline = new RouterPipeline(testFleet);
      brokenPipeline.route = () => {
        throw new Error('simulated');
      };
      const deps: ExplainHandlerDeps = { fleet: testFleet, pipeline: brokenPipeline };
      const brokenExplain = createExplainHandler(deps);

      const result = await brokenExplain(validRequestBody());
      expect(result.status).toBe(503);
      expect((result.body as { reason_code: string }).reason_code).toBe('safe_default');
    });

    it('503 body includes routing_latency_ms', async () => {
      const brokenPipeline = new RouterPipeline(testFleet);
      brokenPipeline.route = () => {
        throw new Error('simulated');
      };
      const deps: ExplainHandlerDeps = { fleet: testFleet, pipeline: brokenPipeline };
      const brokenExplain = createExplainHandler(deps);

      const result = await brokenExplain(validRequestBody());
      expect(result.status).toBe(503);
      expect((result.body as { routing_latency_ms: number }).routing_latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('invariants', () => {
    it('does not produce upstream cost in decision (no estimated_cost_usd by default)', async () => {
      const result = await explain(validRequestBody());
      expect(result.status).toBe(200);
      // Explain path should not include estimated_cost_usd since no upstream call is made
      expect((result.body as unknown as Record<string, unknown>)['estimated_cost_usd']).toBeUndefined();
    });

    it('same input produces deterministic output', async () => {
      const body = validRequestBody();
      const result1 = await explain(body);
      const result2 = await explain(body);
      expect(result1.status).toBe(result2.status);
      expect((result1.body as { selected_model_id: string }).selected_model_id).toBe(
        (result2.body as { selected_model_id: string }).selected_model_id,
      );
      expect((result1.body as { stage: string }).stage).toBe(
        (result2.body as { stage: string }).stage,
      );
      expect((result1.body as { reason_code: string }).reason_code).toBe(
        (result2.body as { reason_code: string }).reason_code,
      );
    });
  });
});
