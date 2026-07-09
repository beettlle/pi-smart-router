/**
 * Planning delegate integration test — SP-145, #71 part 4.
 *
 * End-to-end verification that cache-preserving planning delegate:
 * - Keeps primary inference on the pinned economical model when delegate path is active
 * - Survives multi-turn planning sessions without switching the primary model
 * - Surfaces delegate vs direct route in explain output (features.planning_delegate)
 */

import { describe, expect, it } from 'vitest';

import { createExplainHandler } from '../../src/api/explain/router-explain.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import { DEFAULT_SAAR_CONFIG } from '../../src/domain/types/schemas.js';

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

const anthropicFrontier = makeModel({
  id: 'claude-opus',
  tier: 'frontier-cloud',
  provider: 'anthropic',
  pricing: { fallback_cost_per_1m: 15.0 },
});
const anthropicEcon = makeModel({
  id: 'claude-haiku',
  tier: 'economical-cloud',
  provider: 'anthropic',
  pricing: { fallback_cost_per_1m: 1.0 },
});
const openaiEcon = makeModel({
  id: 'gpt-4o-mini',
  tier: 'economical-cloud',
  provider: 'openai',
});

const fleet: ModelProfile[] = [anthropicFrontier, anthropicEcon, openaiEcon];

const SESSION_ID = 'planning-delegate-int';

const REQUEST_IDS = {
  turn0: '550e8400-e29b-41d4-a716-446655440001',
  planning: '550e8400-e29b-41d4-a716-446655440002',
  exec: '550e8400-e29b-41d4-a716-446655440003',
  plan2: '550e8400-e29b-41d4-a716-446655440004',
  explainWarmup: '550e8400-e29b-41d4-a716-446655440010',
  explainPlanning: '550e8400-e29b-41d4-a716-446655440011',
  directWarmup: '550e8400-e29b-41d4-a716-446655440012',
  explainDirect: '550e8400-e29b-41d4-a716-446655440013',
  parityWarmup: '550e8400-e29b-41d4-a716-446655440014',
  parityPlanning: '550e8400-e29b-41d4-a716-446655440015',
} as const;

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: REQUEST_IDS.turn0,
    session_id: SESSION_ID,
    prompt_text: 'Continue working on the auth module',
    ...overrides,
  };
}

function explainBody(overrides?: Partial<RoutingRequest>): Record<string, unknown> {
  const request = makeRequest(overrides);
  return {
    request_id: request.request_id,
    session_id: request.session_id,
    prompt_text: request.prompt_text,
    ...(request.turn_type !== undefined ? { turn_type: request.turn_type } : {}),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Planning delegate integration (SP-145, #71)', () => {
  describe('multi-turn primary model preservation', () => {
    it('planning turn keeps primary on pinned economical model when delegate path active', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      const initial = await pipeline.route(
        makeRequest({ request_id: REQUEST_IDS.turn0, turn_type: 'main_loop' }),
      );
      expect(initial.selected_model_id).toBe('claude-haiku');

      const planning = await pipeline.route(
        makeRequest({ request_id: REQUEST_IDS.planning, turn_type: 'planning' }),
      );

      expect(planning.stage).toBe('turn_envelope');
      expect(planning.reason_code).toBe('planning_delegate');
      expect(planning.selected_model_id).toBe('claude-haiku');
      expect(planning.tier).toBe('economical-cloud');
      expect(planning.features?.planning_delegate).toMatchObject({
        path: 'delegate',
        primary_model_id: 'claude-haiku',
        delegate_model_id: 'claude-opus',
        planning_delegate_reason_code: 'planning_delegate',
      });
      expect(pinner.getPin(SESSION_ID)!.pinned_model_id).toBe('claude-haiku');
    });

    it('multi-turn planning session preserves economical pin across delegate and execution turns', async () => {
      const saarConfig = { ...DEFAULT_SAAR_CONFIG, planning_turn_buffer: 2 };
      const pinner = new SessionPinner({ saarConfig });
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner, saarConfig });

      const pinnedModelId = (
        await pipeline.route(makeRequest({ request_id: REQUEST_IDS.turn0, turn_type: 'main_loop' }))
      ).selected_model_id;
      expect(pinnedModelId).toBe('claude-haiku');

      const planningOne = await pipeline.route(
        makeRequest({ request_id: REQUEST_IDS.planning, turn_type: 'planning' }),
      );
      expect(planningOne.reason_code).toBe('planning_delegate');
      expect(planningOne.selected_model_id).toBe(pinnedModelId);

      const execution = await pipeline.route(
        makeRequest({ request_id: REQUEST_IDS.exec, turn_type: 'main_loop' }),
      );
      expect(execution.stage).toBe('session_pin');
      expect(execution.reason_code).toBe('session_pinned');
      expect(execution.selected_model_id).toBe(pinnedModelId);

      const planningTwo = await pipeline.route(
        makeRequest({ request_id: REQUEST_IDS.plan2, turn_type: 'planning' }),
      );
      expect(planningTwo.selected_model_id).toBe(pinnedModelId);
      expect(pinner.getPin(SESSION_ID)!.pinned_model_id).toBe(pinnedModelId);
    });
  });

  describe('explain output: delegate vs direct route', () => {
    it('explain documents delegate path when warm economical pin would use frontier reasoning', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });
      const explain = createExplainHandler({ fleet, pipeline, sessionPinner: pinner });

      await pipeline.route(
        makeRequest({ request_id: REQUEST_IDS.explainWarmup, turn_type: 'main_loop' }),
      );

      const result = await explain(
        explainBody({
          request_id: REQUEST_IDS.explainPlanning,
          turn_type: 'planning',
        }),
      );

      expect(result.status).toBe(200);
      const decision = result.body as RoutingDecision;
      expect(decision.reason_code).toBe('planning_delegate');
      expect(decision.selected_model_id).toBe('claude-haiku');
      expect(decision.features?.planning_delegate).toMatchObject({
        path: 'delegate',
        primary_model_id: 'claude-haiku',
        delegate_model_id: 'claude-opus',
        planning_delegate_reason_code: 'planning_delegate',
        fallback_reason: null,
        compressed_context: DEFAULT_OPERATOR_CONFIG.planning_delegate.compressed_context,
      });
    });

    it('explain documents direct frontier fallback when delegate is disabled', async () => {
      const saarConfig = { ...DEFAULT_SAAR_CONFIG, planning_turn_buffer: 2 };
      const pinner = new SessionPinner({ saarConfig });
      const pipeline = new RouterPipeline(fleet, {
        sessionPinner: pinner,
        saarConfig,
        planningDelegateConfig: {
          enabled: false,
          compressed_context: DEFAULT_OPERATOR_CONFIG.planning_delegate.compressed_context,
        },
      });
      const explain = createExplainHandler({
        fleet,
        pipeline,
        sessionPinner: pinner,
        saarConfig,
      });

      await pipeline.route(
        makeRequest({ request_id: REQUEST_IDS.directWarmup, turn_type: 'main_loop' }),
      );

      const result = await explain(
        explainBody({
          request_id: REQUEST_IDS.explainDirect,
          turn_type: 'planning',
        }),
      );

      expect(result.status).toBe(200);
      const decision = result.body as RoutingDecision;
      expect(decision.reason_code).toBe('planning_direct_frontier');
      expect(decision.selected_model_id).toBe('claude-opus');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.features?.planning_delegate).toMatchObject({
        path: 'direct',
        delegate_model_id: 'claude-opus',
        planning_delegate_reason_code: 'planning_direct_frontier',
        fallback_reason: 'planning_delegate_disabled',
      });
    });

    it('explain and live pipeline agree on planning delegate decisions', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });
      const explain = createExplainHandler({ fleet, pipeline, sessionPinner: pinner });

      await pipeline.route(
        makeRequest({ request_id: REQUEST_IDS.parityWarmup, turn_type: 'main_loop' }),
      );

      const body = explainBody({
        request_id: REQUEST_IDS.parityPlanning,
        turn_type: 'planning',
      });
      const liveRequest = makeRequest({
        request_id: REQUEST_IDS.parityPlanning,
        turn_type: 'planning',
      });

      const explainResult = await explain(body);
      const liveDecision = await pipeline.route(liveRequest);

      expect(explainResult.status).toBe(200);
      const explainDecision = explainResult.body as RoutingDecision;
      expect(explainDecision.selected_model_id).toBe(liveDecision.selected_model_id);
      expect(explainDecision.reason_code).toBe(liveDecision.reason_code);
      expect(explainDecision.features?.planning_delegate?.path).toBe(
        liveDecision.features?.planning_delegate?.path,
      );
    });
  });
});
