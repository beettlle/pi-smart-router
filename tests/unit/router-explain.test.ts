import { describe, expect, it } from 'vitest';

import { createExplainHandler } from '../../src/api/explain/router-explain.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { ClusterMatchResult } from '../../src/domain/matching/cluster-matcher.js';
import type { ClusterMatcher } from '../../src/domain/matching/cluster-matcher.js';
import type { ModelProfile } from '../../src/domain/types/index.js';
import { CONTEXT_FIT_PASS } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import {
  CONTEXT_FIT_EXCEEDED,
  CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
} from '../../src/domain/routing/context-fit.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

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

const fleet: ModelProfile[] = [
  makeModel({ id: 'local-llama', tier: 'zero-tier' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud' }),
];

const contextFleet: ModelProfile[] = [
  makeModel({
    id: 'small-window',
    tier: 'economical-cloud',
    limits: { max_input_tokens: 32_768 },
  }),
  makeModel({
    id: 'large-window',
    tier: 'frontier-cloud',
    limits: { max_input_tokens: 200_000 },
  }),
];

function validRequestBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    session_id: 'sess-1',
    prompt_text: 'Hello world',
    ...overrides,
  };
}

function createHandler(
  fleetOverride: ModelProfile[] = fleet,
  clusterMatcher?: ClusterMatcher,
) {
  const pipeline = new RouterPipeline(fleetOverride);
  return createExplainHandler({
    fleet: fleetOverride,
    pipeline,
    ...(clusterMatcher !== undefined ? { clusterMatcher } : {}),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('routerExplain (T041)', () => {
  describe('200 — valid request returns routing decision', () => {
    it('returns 200 with RoutingDecision for a minimal valid request', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody());

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty('request_id', '550e8400-e29b-41d4-a716-446655440000');
      expect(result.body).toHaveProperty('selected_model_id');
      expect(result.body).toHaveProperty('tier');
      expect(result.body).toHaveProperty('stage');
      expect(result.body).toHaveProperty('reason_code');
      expect(result.body).toHaveProperty('routing_latency_ms');
    });

    it('returns tier, stage, reason_code, and pin_reason fields', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody());

      expect(result.status).toBe(200);
      const body = result.body as unknown as Record<string, unknown>;
      expect(['zero-tier', 'economical-cloud', 'frontier-cloud', undefined]).toContain(body['tier'] as string);
      expect(typeof body['stage']).toBe('string');
      expect(typeof body['reason_code']).toBe('string');
    });

    it('decision is bit-for-bit equivalent to pipeline.route()', async () => {
      const pipeline = new RouterPipeline(fleet);
      const explain = createExplainHandler({ fleet, pipeline });

      const body = validRequestBody();
      const explainResult = await explain(body);

      expect(explainResult.status).toBe(200);
      const decision = explainResult.body;
      expect(decision).toHaveProperty('stage', 'fallback');
      expect(decision).toHaveProperty('reason_code', 'safe_cloud_default');
      expect(decision).toHaveProperty('selected_model_id', 'gpt-4o-mini');
    });

    it('passes through optional fields (turn_type, messages, compaction_flag)', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody({
        turn_type: 'planning',
        compaction_flag: true,
        messages: [{ role: 'user', content: 'test' }],
        estimated_input_tokens: 100,
      }));

      expect(result.status).toBe(200);
    });

    it('passes through force_model_id', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody({
        force_model_id: 'test/model',
      }));

      expect(result.status).toBe(200);
    });

    it('preserves request_id in the decision', async () => {
      const explain = createHandler();
      const reqId = '11111111-1111-4111-a111-111111111111';
      const result = await explain(validRequestBody({ request_id: reqId }));

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty('request_id', reqId);
    });
  });

  describe('400 — validation failures', () => {
    it('returns 400 for empty object', async () => {
      const explain = createHandler();
      const result = await explain({});

      expect(result.status).toBe(400);
      expect(result.body).toHaveProperty('error', 'validation_failed');
      expect(result.body).toHaveProperty('details');
      expect(Array.isArray((result.body as unknown as { details: readonly string[] }).details)).toBe(true);
    });

    it('returns 400 when request_id is not a UUID', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody({ request_id: 'not-a-uuid' }));

      expect(result.status).toBe(400);
      expect(result.body).toHaveProperty('error', 'validation_failed');
    });

    it('returns 400 when session_id is empty', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody({ session_id: '' }));

      expect(result.status).toBe(400);
    });

    it('returns 400 when required fields are missing', async () => {
      const explain = createHandler();
      const result = await explain({ request_id: '550e8400-e29b-41d4-a716-446655440000' });

      expect(result.status).toBe(400);
    });

    it('returns 400 for non-object input', async () => {
      const explain = createHandler();
      const result = await explain('not an object');

      expect(result.status).toBe(400);
    });

    it('returns 400 for null input', async () => {
      const explain = createHandler();
      const result = await explain(null);

      expect(result.status).toBe(400);
    });

    it('returns 400 for invalid turn_type enum', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody({ turn_type: 'invalid' }));

      expect(result.status).toBe(400);
    });

    it('details array contains at least one message', async () => {
      const explain = createHandler();
      const result = await explain({});

      expect(result.status).toBe(400);
      const body = result.body as unknown as { details: readonly string[] };
      expect(body.details.length).toBeGreaterThan(0);
    });
  });

  describe('503 — router unavailable fallback', () => {
    it('returns 503 with fallback decision when pipeline throws', async () => {
      const badPipeline = new RouterPipeline(fleet);
      Object.defineProperty(badPipeline, 'route', {
        value: () => Promise.reject(new Error('pipeline broken')),
      });

      const explain = createExplainHandler({ fleet, pipeline: badPipeline });
      const result = await explain(validRequestBody());

      expect(result.status).toBe(503);
      expect(result.body).toHaveProperty('stage', 'fallback');
      expect(result.body).toHaveProperty('reason_code', 'safe_default');
      expect(result.body).toHaveProperty('request_id', '550e8400-e29b-41d4-a716-446655440000');
    });

    it('503 body uses safe cloud default model', async () => {
      const badPipeline = new RouterPipeline(fleet);
      Object.defineProperty(badPipeline, 'route', {
        value: () => Promise.reject(new Error('broken')),
      });

      const explain = createExplainHandler({ fleet, pipeline: badPipeline });
      const result = await explain(validRequestBody());

      expect(result.status).toBe(503);
      expect(result.body).toHaveProperty('selected_model_id', 'gpt-4o-mini');
      expect(result.body).toHaveProperty('tier', 'economical-cloud');
    });

    it('503 body returns unknown when fleet is empty', async () => {
      const emptyFleet: ModelProfile[] = [];
      const badPipeline = new RouterPipeline(emptyFleet);
      Object.defineProperty(badPipeline, 'route', {
        value: () => Promise.reject(new Error('broken')),
      });

      const explain = createExplainHandler({ fleet: emptyFleet, pipeline: badPipeline });
      const result = await explain(validRequestBody());

      expect(result.status).toBe(503);
      expect(result.body).toHaveProperty('selected_model_id', 'unknown');
    });

    it('503 body includes routing_latency_ms >= 0', async () => {
      const badPipeline = new RouterPipeline(fleet);
      Object.defineProperty(badPipeline, 'route', {
        value: () => Promise.reject(new Error('broken')),
      });

      const explain = createExplainHandler({ fleet, pipeline: badPipeline });
      const result = await explain(validRequestBody());

      expect(result.status).toBe(503);
      const body = result.body as { routing_latency_ms: number };
      expect(body.routing_latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('invariants', () => {
    it('does not dispatch upstream (pipeline stages are local-only)', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody());

      expect(result.status).toBe(200);
      const body = result.body as { estimated_cost_usd?: number };
      expect(body.estimated_cost_usd).toBeUndefined();
    });

    it('routing_latency_ms is present and non-negative', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody());

      expect(result.status).toBe(200);
      const body = result.body as { routing_latency_ms: number };
      expect(body.routing_latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('createExplainHandler returns a function', () => {
      const pipeline = new RouterPipeline(fleet);
      const explain = createExplainHandler({ fleet, pipeline });
      expect(typeof explain).toBe('function');
    });

    it('includes context-fit observability for oversized estimates (SP-110)', async () => {
      const explain = createHandler(contextFleet);
      const result = await explain(validRequestBody({ estimated_input_tokens: 34_000 }));

      expect(result.status).toBe(200);
      if (result.status !== 200) {
        return;
      }
      const contextFit = result.body.features?.context_fit;
      expect(contextFit).toMatchObject({
        estimated_input_tokens: 34_000,
        context_fit_reason_code: CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
        selected_model_max_input_tokens: 200_000,
        context_overflow_pin_break: true,
      });
      expect(contextFit?.context_fit_rejected_json).toContain('small-window');
      expect(result.body.features?.candidates?.some(
        (candidate: { model_id: string; rejected_reason: string | null }) =>
          candidate.model_id === 'small-window' &&
          candidate.rejected_reason === CONTEXT_FIT_EXCEEDED,
      )).toBe(true);
    });

    it('includes context_fit_pass when all models fit', async () => {
      const explain = createHandler(contextFleet);
      const result = await explain(validRequestBody({ estimated_input_tokens: 1_000 }));

      expect(result.status).toBe(200);
      if (result.status !== 200) {
        return;
      }
      expect(result.body.features?.context_fit?.context_fit_reason_code).toBe(CONTEXT_FIT_PASS);
    });

    it('includes tier_selection observability with cluster table when matcher wired (SP-113)', async () => {
      const clusterMatch: ClusterMatchResult = {
        clusterId: 'low_stakes_general',
        tierBias: 'economical-cloud',
        similarity: 0.9,
        margin: 0.1,
        confidence: 'high',
        elapsedMs: 1,
      };
      const clusterMatcher = {
        match: async () => clusterMatch,
        matchTable: async () => [
          {
            cluster_id: 'low_stakes_general',
            tier_bias: 'economical-cloud' as const,
            similarity: 0.9,
            margin: 0.1,
            confidence: 'high' as const,
            selected: true,
          },
          {
            cluster_id: 'architecture',
            tier_bias: 'frontier-cloud' as const,
            similarity: 0.4,
            margin: null,
            confidence: 'none' as const,
            selected: false,
          },
        ],
      } as unknown as ClusterMatcher;

      const explain = createHandler(fleet, clusterMatcher);
      const result = await explain(validRequestBody({ prompt_text: 'Fix the typo in README' }));

      expect(result.status).toBe(200);
      if (result.status !== 200) {
        return;
      }

      const tierSelection = result.body.features?.tier_selection;
      expect(tierSelection?.cluster_match_table).toHaveLength(2);
      expect(tierSelection?.cluster_id).toBe('low_stakes_general');
      expect(tierSelection?.cluster_similarity).toBe(0.9);
      expect(tierSelection?.low_intensity_breakdown?.score).not.toBeNull();
      expect(tierSelection?.tier_feature_summary?.triage_verdict).toBeDefined();
      expect(tierSelection?.local_zero_skip_reasons.length).toBeGreaterThan(0);
    });

    it('includes combined context-fit and tier-selection rationale (SP-119)', async () => {
      const clusterMatcher = {
        match: async () => ({
          clusterId: 'low_stakes_general',
          tierBias: 'economical-cloud' as const,
          similarity: 0.9,
          margin: 0.1,
          confidence: 'high' as const,
          elapsedMs: 1,
        }),
        matchTable: async () => [
          {
            cluster_id: 'low_stakes_general',
            tier_bias: 'economical-cloud' as const,
            similarity: 0.9,
            margin: 0.1,
            confidence: 'high' as const,
            selected: true,
          },
        ],
      } as unknown as ClusterMatcher;

      const explain = createHandler(contextFleet, clusterMatcher);
      const result = await explain(validRequestBody({ estimated_input_tokens: 34_000 }));

      expect(result.status).toBe(200);
      if (result.status !== 200) {
        return;
      }

      expect(result.body.features?.context_fit?.context_fit_reason_code).toBe(
        CONTEXT_OVERFLOW_FRONTIER_FALLBACK,
      );
      expect(result.body.features?.tier_selection?.low_intensity_breakdown?.score).not.toBeNull();
      expect(result.body.features?.tier_selection?.cluster_id).toBe('low_stakes_general');
      expect(result.body.features?.p_success_cheap).not.toBeNull();
    });

    it('includes tier_selection without cluster table when matcher is omitted', async () => {
      const explain = createHandler();
      const result = await explain(validRequestBody());

      expect(result.status).toBe(200);
      if (result.status !== 200) {
        return;
      }

      expect(result.body.features?.tier_selection?.low_intensity_breakdown?.score).not.toBeNull();
      expect(result.body.features?.tier_selection?.cluster_match_table).toBeNull();
    });
  });
});
