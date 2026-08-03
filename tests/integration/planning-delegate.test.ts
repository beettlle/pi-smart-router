/**
 * Planning delegate integration test — SP-145, #71 part 4.
 *
 * End-to-end verification that cache-preserving planning delegate:
 * - Keeps primary inference on the pinned economical model when delegate path is active
 * - Survives multi-turn planning sessions without switching the primary model
 * Release matrix: cache-preserving planning delegate (SP-145, #71).
 */

import { describe, expect, it } from 'vitest';

import type { Api, Context, Model } from '@earendil-works/pi-ai/compat';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';

import {
  resolvePlanningDelegatePath,
  type PlanningDelegateSpawnFn,
  type PlanningDelegateSpawnResult,
} from '../../.pi/extensions/smart-router/planning-delegate.js';
import type { StreamDelegationDeps } from '../../.pi/extensions/smart-router/types.js';
import { createExplainHandler } from '../../src/api/explain/router-explain.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import { ExecutionLedger } from '../../src/domain/delegation/execution-ledger.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import { DEFAULT_SAAR_CONFIG, DEFAULT_PLANNING_DELEGATE_CONFIG } from '../../src/domain/types/schemas.js';
import type { RouterHandle } from '../../src/index.js';

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
  slowWarmup: '550e8400-e29b-41d4-a716-446655440016',
  slowPlanning: '550e8400-e29b-41d4-a716-446655440017',
  fastWarmup: '550e8400-e29b-41d4-a716-446655440018',
  fastPlanning: '550e8400-e29b-41d4-a716-446655440019',
  globalWarmup: '550e8400-e29b-41d4-a716-446655440020',
  globalPlanning: '550e8400-e29b-41d4-a716-446655440021',
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

describe('@release', () => {
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
          ...DEFAULT_PLANNING_DELEGATE_CONFIG,
          enabled: false,
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

  describe('bounded delegate timeouts (SP-213, #120)', () => {
    const emptyContext = { messages: [] } as unknown as Context;

    const timeoutRegistry = {
      find(provider: string, id: string) {
        return {
          provider,
          id,
          api: 'anthropic-messages',
        } as unknown as Model<Api>;
      },
    } as unknown as ModelRegistry;

    function makeTimeoutDeps(
      spawnPlanningDelegate: PlanningDelegateSpawnFn,
      planningDelegateConfig: typeof DEFAULT_PLANNING_DELEGATE_CONFIG,
    ): StreamDelegationDeps {
      return {
        router: {} as unknown as RouterHandle,
        modelRegistry: timeoutRegistry,
        fleet,
        executionLedger: new ExecutionLedger(),
        spawnPlanningDelegate,
        planningDelegateConfig,
      };
    }

    async function routePlanningDecision(warmupId: string, planningId: string) {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });
      await pipeline.route(
        makeRequest({ request_id: warmupId, turn_type: 'main_loop' }),
      );
      return pipeline.route(
        makeRequest({ request_id: planningId, turn_type: 'planning' }),
      );
    }

    it('slow worker is cancelled on per-call timeout and falls back without hanging', async () => {
      const decision = await routePlanningDecision(
        REQUEST_IDS.slowWarmup,
        REQUEST_IDS.slowPlanning,
      );
      expect(decision.reason_code).toBe('planning_delegate');

      let observedSignal: AbortSignal | undefined;
      const slowWorker: PlanningDelegateSpawnFn = (_model, _ctx, options) => {
        observedSignal = options?.signal;
        // Stalled worker: never settles (llm-use test_spawn_workers_global_timeout intent).
        return new Promise<PlanningDelegateSpawnResult>(() => {});
      };
      const deps = makeTimeoutDeps(slowWorker, {
        ...DEFAULT_PLANNING_DELEGATE_CONFIG,
        sub_call_timeout_ms: 25,
      });

      const started = Date.now();
      const resolution = await resolvePlanningDelegatePath(
        emptyContext,
        decision,
        undefined,
        deps,
      );
      // No hang: fallback resolves promptly even though the worker never settles.
      expect(Date.now() - started).toBeLessThan(5_000);

      // Cancellation signal forwarded to the abandoned worker.
      expect(observedSignal?.aborted).toBe(true);

      expect(resolution.usedDelegatePath).toBe(false);
      expect(resolution.decision.reason_code).toBe('planning_direct_frontier');
      expect(resolution.decision.selected_model_id).toBe('claude-opus');
      expect(resolution.decision.features?.planning_delegate).toMatchObject({
        path: 'direct',
        fallback_reason: 'planning_delegate_timeout',
        workers_spawned: 1,
        workers_succeeded: 0,
        worker_timeout_count: 1,
      });
    });

    it('global timeout caps the stage when tighter than the per-call timeout', async () => {
      const decision = await routePlanningDecision(
        REQUEST_IDS.globalWarmup,
        REQUEST_IDS.globalPlanning,
      );

      const stalledWorker: PlanningDelegateSpawnFn = () =>
        new Promise<PlanningDelegateSpawnResult>(() => {});
      const deps = makeTimeoutDeps(stalledWorker, {
        ...DEFAULT_PLANNING_DELEGATE_CONFIG,
        global_timeout_ms: 20,
        sub_call_timeout_ms: 60_000,
      });

      const started = Date.now();
      const resolution = await resolvePlanningDelegatePath(
        emptyContext,
        decision,
        undefined,
        deps,
      );
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(resolution.usedDelegatePath).toBe(false);
      expect(
        resolution.decision.features?.planning_delegate?.fallback_reason,
      ).toBe('planning_delegate_timeout');
      expect(
        resolution.decision.features?.planning_delegate?.worker_timeout_count,
      ).toBe(1);
    });

    it('fast worker within budget keeps delegate path and records worker success', async () => {
      const decision = await routePlanningDecision(
        REQUEST_IDS.fastWarmup,
        REQUEST_IDS.fastPlanning,
      );

      const fastWorker: PlanningDelegateSpawnFn = async () => ({
        ok: true,
        observationText: 'Plan: modular service layout.',
      });
      const deps = makeTimeoutDeps(fastWorker, DEFAULT_PLANNING_DELEGATE_CONFIG);

      const resolution = await resolvePlanningDelegatePath(
        emptyContext,
        decision,
        undefined,
        deps,
      );

      expect(resolution.usedDelegatePath).toBe(true);
      expect(resolution.decision.reason_code).toBe('planning_delegate');
      expect(resolution.decision.selected_model_id).toBe('claude-haiku');
      expect(resolution.decision.features?.planning_delegate).toMatchObject({
        path: 'delegate',
        workers_spawned: 1,
        workers_succeeded: 1,
        worker_timeout_count: 0,
      });

      const observation = resolution.context.messages.at(-1);
      expect(typeof observation?.content).toBe('string');
      if (typeof observation?.content === 'string') {
        expect(observation.content).toContain('Plan: modular service layout.');
      }
    });

    it('default config leaves happy path unbounded by tight test budgets', async () => {
      // Defaults mirror llm-use: 120s global / 30s per-call — existing behavior preserved.
      expect(DEFAULT_PLANNING_DELEGATE_CONFIG.global_timeout_ms).toBe(120_000);
      expect(DEFAULT_PLANNING_DELEGATE_CONFIG.sub_call_timeout_ms).toBe(30_000);
    });
  });
});
});
