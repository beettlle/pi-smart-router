/**
 * Session pinning integration test — T038, SC-006, FR-006, FR-007, FR-023.
 *
 * Validates multi-turn pin stability through the full pipeline:
 * - Pin holds across non-sub-routable turns (SC-006)
 * - Pin hit skips downstream stages like triage/HyDRA (FR-007)
 * - Same-provider sub-routing does not break the pin (SC-006)
 * - Break events trigger re-routing correctly (FR-008)
 * - Cache markers are preserved on same-provider paths (FR-023)
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  buildRoutingRequest,
  createDispatchOptions,
  formatStatusMessage,
} from '../../.pi/extensions/smart-router/index.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import { extractToolFailureSignature } from '../../src/domain/pinning/loop-escalation.js';
import {
  GatewayDispatch,
} from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import { SqliteStore } from '../../src/infrastructure/persistence/sqlite-store.js';
import {
  LifecycleHookState,
  type PiExtensionContext,
  type PiExtensionHooks,
  type PiSessionManager,
} from '../../src/api/middleware/pi-router-middleware.js';
import { createRouterFromFleet } from '../../src/index.js';
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

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'pin-int-001',
    session_id: 'session-pin-int',
    prompt_text: 'Continue working on the auth module',
    ...overrides,
  };
}

const anthropicFrontier = makeModel({
  id: 'claude-opus',
  tier: 'frontier-cloud',
  provider: 'anthropic',
  performance: { cache_friendly: true },
});
const anthropicEcon = makeModel({
  id: 'claude-haiku',
  tier: 'economical-cloud',
  provider: 'anthropic',
});
const openaiEcon = makeModel({
  id: 'gpt-4o-mini',
  tier: 'economical-cloud',
  provider: 'openai',
});
const openaiFrontier = makeModel({
  id: 'gpt-4o',
  tier: 'frontier-cloud',
  provider: 'openai',
  performance: { cache_friendly: true },
});

const fleet: ModelProfile[] = [
  anthropicFrontier,
  anthropicEcon,
  openaiEcon,
  openaiFrontier,
];

function makeExtensionCtx(sessionId: string): PiExtensionContext {
  const sessionManager: PiSessionManager = {
    getSessionFile: () => undefined,
    getSessionId: () => sessionId,
  };
  return { cwd: '/tmp/pi-smart-router-test', sessionManager };
}

function createHookCapture(): {
  hooks: PiExtensionHooks;
  fireCompaction: (sessionId: string) => void;
  fireModelSelect: (sessionId: string, modelId: string) => void;
} {
  const handlers: {
    session_compact: ((event: unknown, ctx: PiExtensionContext) => void)[];
    model_select: ((event: { source: string; model: { provider: string; id: string } }, ctx: PiExtensionContext) => void)[];
  } = {
    session_compact: [],
    model_select: [],
  };

  const hooks = {
    on(event: string, handler: unknown): void {
      if (event === 'session_compact') {
        handlers.session_compact.push(
          handler as (event: unknown, ctx: PiExtensionContext) => void,
        );
      }
      if (event === 'model_select') {
        handlers.model_select.push(
          handler as (
            event: { source: string; model: { provider: string; id: string } },
            ctx: PiExtensionContext,
          ) => void,
        );
      }
    },
  } as PiExtensionHooks;

  return {
    hooks,
    fireCompaction(sessionId: string) {
      handlers.session_compact[0]!({}, makeExtensionCtx(sessionId));
    },
    fireModelSelect(sessionId: string, modelId: string) {
      handlers.model_select[0]!(
        { source: 'set', model: { provider: 'openai', id: modelId } },
        makeExtensionCtx(sessionId),
      );
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Session pinning integration', () => {
  describe('SC-006: multi-turn pin stability', () => {
    it('pin holds across multiple non-sub-routable turns', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      const first = await pipeline.route(makeRequest({ request_id: 'turn-0' }));
      const pinnedModelId = first.selected_model_id;

      for (let i = 1; i <= 5; i++) {
        const decision = await pipeline.route(
          makeRequest({
            request_id: `turn-${i}`,
            prompt_text: `Turn ${i} prompt`,
            turn_type: 'main_loop',
          }),
        );

        expect(decision.selected_model_id).toBe(pinnedModelId);
        expect(decision.stage).toBe('session_pin');
        expect(decision.reason_code).toBe('session_pinned');
      }
    });

    it('pin holds across different non-tool-result turn types', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      const first = await pipeline.route(makeRequest({ request_id: 'init' }));
      const pinnedModelId = first.selected_model_id;

      const turnExpectations: Array<{
        turnType: 'main_loop' | 'unknown';
        stage: string;
      }> = [
        { turnType: 'main_loop', stage: 'session_pin' },
        { turnType: 'unknown', stage: 'session_pin' },
      ];

      for (const { turnType, stage } of turnExpectations) {
        const decision = await pipeline.route(
          makeRequest({
            request_id: `turn-${turnType}`,
            turn_type: turnType,
          }),
        );

        expect(decision.selected_model_id).toBe(pinnedModelId);
        expect(decision.stage).toBe(stage);
      }
    });

    it('turn envelope overrides pin for planning and subagent turns (SP-064)', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('session-pin-int', 'claude-haiku', 'initial');
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      const planning = await pipeline.route(
        makeRequest({ request_id: 'planning-override', turn_type: 'planning' }),
      );
      expect(planning.stage).toBe('turn_envelope');
      expect(planning.reason_code).toBe('turn_planning');
      expect(planning.tier).toBe('frontier-cloud');
      expect(planning.selected_model_id).toBe('claude-opus');
      expect(pinner.getPin('session-pin-int')!.pinned_model_id).toBe('claude-haiku');

      const subagent = await pipeline.route(
        makeRequest({ request_id: 'subagent-override', turn_type: 'subagent' }),
      );
      expect(subagent.stage).toBe('turn_envelope');
      expect(subagent.reason_code).toBe('turn_subagent');
      expect(subagent.tier).toBe('economical-cloud');
    });

    it('tool_result downgrade via turn_envelope preserves frontier pin (SP-064)', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('session-pin-int', 'claude-opus', 'initial');
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      const downgraded = await pipeline.route(
        makeRequest({
          request_id: 'tool-result-downgrade',
          turn_type: 'tool_result',
          estimated_input_tokens: 100,
        }),
      );

      expect(downgraded.stage).toBe('turn_envelope');
      expect(downgraded.reason_code).toBe('turn_tool_result');
      expect(downgraded.tier).toBe('economical-cloud');
      expect(downgraded.selected_model_id).toBe('claude-haiku');
      expect(pinner.getPin('session-pin-int')!.pinned_model_id).toBe('claude-opus');
    });

    it('same-provider sub-routing does not break session pin state', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('session-pin-int', 'claude-opus', 'initial');
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      const subRouted = await pipeline.route(
        makeRequest({
          request_id: 'sub-route-turn',
          turn_type: 'tool_result',
          estimated_input_tokens: 100,
        }),
      );

      expect(subRouted.stage).toBe('turn_envelope');
      expect(subRouted.reason_code).toBe('turn_tool_result');
      expect(subRouted.selected_model_id).toBe('claude-haiku');

      const pin = pinner.getPin('session-pin-int');
      expect(pin?.pinned_model_id).toBe('claude-opus');
      expect(pin?.pin_reason).toBe('initial');

      const nextTurn = await pipeline.route(
        makeRequest({
          request_id: 'post-sub-route',
          turn_type: 'main_loop',
        }),
      );

      expect(nextTurn.selected_model_id).toBe('claude-opus');
      expect(nextTurn.stage).toBe('session_pin');
      expect(nextTurn.reason_code).toBe('session_pinned');
    });
  });

  describe('FR-007: skip re-match on pin hits', () => {
    it('pinned session does not re-run triage for trivial prompts', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      await pipeline.route(makeRequest({ request_id: 'init' }));
      const pinnedModelId = pinner.getPin('session-pin-int')?.pinned_model_id;

      const trivialDecision = await pipeline.route(
        makeRequest({
          request_id: 'trivial-while-pinned',
          prompt_text: 'Format this JSON file',
          turn_type: 'main_loop',
        }),
      );

      expect(trivialDecision.stage).toBe('session_pin');
      expect(trivialDecision.reason_code).toBe('session_pinned');
      expect(trivialDecision.selected_model_id).toBe(pinnedModelId);
    });

    it('pin prevents model switching even when cheaper options exist', async () => {
      const pinner = new SessionPinner();
      const expensiveFleet = [
        makeModel({
          id: 'expensive-frontier',
          tier: 'frontier-cloud',
          provider: 'premium',
          pricing: { fallback_cost_per_1m: 50.0 },
        }),
        makeModel({
          id: 'dirt-cheap-econ',
          tier: 'economical-cloud',
          provider: 'budget',
          pricing: { fallback_cost_per_1m: 0.01 },
        }),
      ];

      const pipeline = new RouterPipeline(expensiveFleet, { sessionPinner: pinner });

      await pipeline.route(
        makeRequest({ request_id: 'init', session_id: 'sess-expensive' }),
      );

      const pin = pinner.getPin('sess-expensive');

      for (let i = 0; i < 5; i++) {
        const decision = await pipeline.route(
          makeRequest({
            request_id: `turn-${i}`,
            session_id: 'sess-expensive',
            prompt_text: `Continue turn ${i}`,
          }),
        );

        expect(decision.selected_model_id).toBe(pin?.pinned_model_id);
        expect(decision.stage).toBe('session_pin');
      }
    });
  });

  describe('FR-008: qualified pin break events', () => {
    it('compaction breaks pin and allows full re-route', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      await pipeline.route(makeRequest({ request_id: 'init' }));
      const initialPin = pinner.getPin('session-pin-int');
      expect(initialPin).not.toBeNull();

      const postCompaction = await pipeline.route(
        makeRequest({
          request_id: 'compacted',
          compaction_flag: true,
        }),
      );

      expect(postCompaction.stage).not.toBe('session_pin');
    });

    it('force override switches to the specified model', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      await pipeline.route(makeRequest({ request_id: 'init' }));

      const forced = await pipeline.route(
        makeRequest({
          request_id: 'forced',
          force_model_id: 'gpt-4o',
        }),
      );

      expect(forced.selected_model_id).toBe('gpt-4o');
      expect(forced.stage).toBe('session_pin');

      const pin = pinner.getPin('session-pin-int');
      expect(pin?.pinned_model_id).toBe('gpt-4o');
      expect(pin?.pin_reason).toBe('user_forced');
    });
  });

  describe('FR-023: cache markers via GatewayDispatch', () => {
    it('establishes cache marker on initial dispatch', async () => {
      const pinner = new SessionPinner();
      const gateway = new GatewayDispatch(fleet, { sessionPinner: pinner });

      await gateway.dispatch(makeRequest({ request_id: 'init' }));

      const marker = gateway.getCacheMarker('session-pin-int');
      expect(marker).not.toBeNull();
      expect(marker!.sessionId).toBe('session-pin-int');
      expect(marker!.provider).toBeDefined();
      expect(typeof marker!.cacheFriendly).toBe('boolean');
    });

    it('preserves cache marker on turn_envelope tool_result downgrade', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('session-pin-int', 'claude-opus', 'initial');
      const gateway = new GatewayDispatch(fleet, { sessionPinner: pinner });

      await gateway.dispatch(
        makeRequest({ request_id: 'pin-setup', turn_type: 'main_loop' }),
      );
      const markerBefore = gateway.getCacheMarker('session-pin-int');

      await gateway.dispatch(
        makeRequest({
          request_id: 'sub-route',
          turn_type: 'tool_result',
          estimated_input_tokens: 100,
        }),
      );
      const markerAfter = gateway.getCacheMarker('session-pin-int');

      expect(markerAfter!.provider).toBe(markerBefore!.provider);
      // turn_envelope downgrade routes to economical model; pin model stays frontier
      expect(pinner.getPin('session-pin-int')!.pinned_model_id).toBe('claude-opus');
    });

    it('updates cache marker when provider changes after compaction', async () => {
      const pinner = new SessionPinner();
      const gateway = new GatewayDispatch(fleet, { sessionPinner: pinner });

      await gateway.dispatch(makeRequest({ request_id: 'init' }));

      await gateway.dispatch(
        makeRequest({
          request_id: 'compacted',
          compaction_flag: true,
        }),
      );

      const postMarker = gateway.getCacheMarker('session-pin-int');
      expect(postMarker).not.toBeNull();
      expect(postMarker!.sessionId).toBe('session-pin-int');
    });

    it('tracks cache_friendly from model performance metadata', async () => {
      const cacheFriendlyFleet = [
        makeModel({
          id: 'cache-model',
          tier: 'economical-cloud',
          provider: 'cache-co',
          performance: { cache_friendly: true },
        }),
      ];
      const pinner = new SessionPinner();
      const gateway = new GatewayDispatch(cacheFriendlyFleet, { sessionPinner: pinner });

      await gateway.dispatch(makeRequest({ request_id: 'init' }));
      const marker = gateway.getCacheMarker('session-pin-int');

      expect(marker!.cacheFriendly).toBe(true);
    });

    it('returns null for unknown session cache marker', () => {
      const gateway = new GatewayDispatch(fleet);
      expect(gateway.getCacheMarker('nonexistent')).toBeNull();
    });
  });

  describe('SP-123: SAAR turn envelope and session pin wiring', () => {
    const saarConfig = {
      ...DEFAULT_SAAR_CONFIG,
      planning_turn_buffer: 2,
    };

    function createSaarPipeline(pinner: SessionPinner): RouterPipeline {
      return new RouterPipeline(fleet, {
        sessionPinner: pinner,
        saarConfig,
      });
    }

    it('planning inside buffer routes frontier without overwriting economical pin', async () => {
      const pinner = new SessionPinner({ saarConfig });
      const pipeline = createSaarPipeline(pinner);

      const initial = await pipeline.route(
        makeRequest({ request_id: 'saar-turn-0', turn_type: 'main_loop' }),
      );
      expect(initial.selected_model_id).toBe('claude-haiku');

      const planning = await pipeline.route(
        makeRequest({ request_id: 'saar-planning-buffer', turn_type: 'planning' }),
      );

      expect(planning.stage).toBe('turn_envelope');
      expect(planning.reason_code).toBe('turn_planning');
      expect(planning.tier).toBe('frontier-cloud');
      expect(planning.selected_model_id).toBe('claude-opus');
      expect(pinner.getPin('session-pin-int')!.pinned_model_id).toBe('claude-haiku');
      expect(pinner.getSaarState('session-pin-int')?.turn_index).toBe(2);
    });

    it('execution turns after buffer respect hard-lock on warm economical pin', async () => {
      const pinner = new SessionPinner({ saarConfig });
      const pipeline = createSaarPipeline(pinner);

      await pipeline.route(makeRequest({ request_id: 'saar-exec-0', turn_type: 'main_loop' }));
      await pipeline.route(
        makeRequest({ request_id: 'saar-exec-plan', turn_type: 'planning' }),
      );

      expect(pinner.getSaarState('session-pin-int')?.hard_lock).toBe(true);

      const execution = await pipeline.route(
        makeRequest({ request_id: 'saar-exec-2', turn_type: 'main_loop' }),
      );
      expect(execution.stage).toBe('session_pin');
      expect(execution.reason_code).toBe('session_pinned');
      expect(execution.selected_model_id).toBe('claude-haiku');

      const planningAfterBuffer = await pipeline.route(
        makeRequest({ request_id: 'saar-exec-plan-2', turn_type: 'planning' }),
      );
      expect(planningAfterBuffer.stage).toBe('session_pin');
      expect(planningAfterBuffer.reason_code).toBe('saar_hard_lock');
      expect(planningAfterBuffer.selected_model_id).toBe('claude-haiku');
      expect(pinner.getPin('session-pin-int')!.pinned_model_id).toBe('claude-haiku');
    });

    it('loop escalation still breaks pin after SAAR hard-lock', async () => {
      const pinner = new SessionPinner({ saarConfig });
      const pipeline = new RouterPipeline(fleet, {
        sessionPinner: pinner,
        saarConfig,
        loopEscalationConfig: { threshold: 3 },
      });

      const failureContent = 'Error: ENOENT file not found';
      const failureRequest = makeRequest({
        turn_type: 'tool_result',
        messages: [{ role: 'tool', content: failureContent }],
      });

      await pipeline.route(makeRequest({ request_id: 'loop-0', turn_type: 'main_loop' }));
      await pipeline.route(makeRequest({ request_id: 'loop-1', turn_type: 'planning' }));

      const initialPin = pinner.getPin('session-pin-int')!;
      pinner.loadPin({
        ...initialPin,
        consecutive_tool_failures: 2,
        last_tool_failure_signature: extractToolFailureSignature(failureRequest)!,
        updated_at: new Date().toISOString(),
      });

      await pipeline.route({ ...failureRequest, request_id: 'loop-fail-3' });

      expect(pinner.getPin('session-pin-int')!.pin_reason).toBe('loop_escalation');
      expect(pinner.getPin('session-pin-int')!.pinned_model_id).toBe('claude-opus');
    });

    it('context overflow still breaks pin after SAAR hard-lock', async () => {
      const overflowFleet = [
        makeModel({
          id: 'small-econ',
          tier: 'economical-cloud',
          provider: 'anthropic',
          limits: { max_input_tokens: 1000 },
        }),
        makeModel({
          id: 'large-frontier',
          tier: 'frontier-cloud',
          provider: 'anthropic',
          limits: { max_input_tokens: 200_000 },
        }),
      ];
      const pinner = new SessionPinner({ saarConfig });
      const pipeline = new RouterPipeline(overflowFleet, {
        sessionPinner: pinner,
        saarConfig,
      });

      await pipeline.route(
        makeRequest({
          request_id: 'overflow-0',
          session_id: 'overflow-sess',
          turn_type: 'main_loop',
        }),
      );
      await pipeline.route(
        makeRequest({
          request_id: 'overflow-1',
          session_id: 'overflow-sess',
          turn_type: 'planning',
        }),
      );

      const overflow = await pipeline.route(
        makeRequest({
          request_id: 'overflow-2',
          session_id: 'overflow-sess',
          turn_type: 'main_loop',
          estimated_input_tokens: 950,
        }),
      );

      expect(overflow.stage).toBe('fallback');
      expect(overflow.reason_code).toBe('context_overflow_same_provider_fallback');
      expect(overflow.selected_model_id).toBe('large-frontier');
      expect(pinner.getPin('overflow-sess')!.pinned_model_id).toBe('large-frontier');
    });
  });

  describe('multi-session isolation', () => {
    it('pins for different sessions are independent through pipeline', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      await pipeline.route(
        makeRequest({ request_id: 'a-init', session_id: 'sess-a' }),
      );
      await pipeline.route(
        makeRequest({ request_id: 'b-init', session_id: 'sess-b' }),
      );

      const pinA = pinner.getPin('sess-a');
      const pinB = pinner.getPin('sess-b');

      expect(pinA).not.toBeNull();
      expect(pinB).not.toBeNull();

      const decisionA = await pipeline.route(
        makeRequest({
          request_id: 'a-turn-2',
          session_id: 'sess-a',
          turn_type: 'main_loop',
        }),
      );
      const decisionB = await pipeline.route(
        makeRequest({
          request_id: 'b-turn-2',
          session_id: 'sess-b',
          turn_type: 'main_loop',
        }),
      );

      expect(decisionA.selected_model_id).toBe(pinA!.pinned_model_id);
      expect(decisionB.selected_model_id).toBe(pinB!.pinned_model_id);
      expect(decisionA.stage).toBe('session_pin');
      expect(decisionB.stage).toBe('session_pin');
    });

    it('breaking one session pin does not affect another', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(fleet, { sessionPinner: pinner });

      await pipeline.route(
        makeRequest({ request_id: 'x-init', session_id: 'sess-x' }),
      );
      await pipeline.route(
        makeRequest({ request_id: 'y-init', session_id: 'sess-y' }),
      );

      const yPinBefore = pinner.getPin('sess-y');

      await pipeline.route(
        makeRequest({
          request_id: 'x-compaction',
          session_id: 'sess-x',
          compaction_flag: true,
        }),
      );

      // Compaction broke the old pin; pipeline re-routes and creates a fresh one.
      // The key assertion: sess-y is unaffected.
      const yDecision = await pipeline.route(
        makeRequest({ request_id: 'y-check', session_id: 'sess-y' }),
      );

      expect(yDecision.stage).toBe('session_pin');
      expect(yDecision.reason_code).toBe('session_pinned');
      expect(yDecision.selected_model_id).toBe(yPinBefore!.pinned_model_id);
    });
  });

  describe('SP-051: extension-path lifecycle hook wiring', () => {
    it('compaction hook breaks pin on next extension routing request', async () => {
      const sessionId = 'ext-compact-sess';
      const lifecycleHookState = new LifecycleHookState();
      const sessionPinner = new SessionPinner();
      const store = new MemoryStore();
      const router = createRouterFromFleet(fleet, {
        ...createDispatchOptions(store, sessionPinner),
        lifecycleHookState,
      });
      const { hooks, fireCompaction } = createHookCapture();
      router.register(hooks);

      const initial = await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'initial turn' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );
      expect(initial.stage).not.toBe('session_pin');
      const pinnedModelId = sessionPinner.getPin(sessionId)?.pinned_model_id;
      expect(pinnedModelId).toBeDefined();

      const pinnedTurn = await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'pinned turn' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );
      expect(pinnedTurn.stage).toBe('session_pin');
      expect(pinnedTurn.selected_model_id).toBe(pinnedModelId);

      fireCompaction(sessionId);

      const postCompaction = await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'after compaction' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );

      expect(postCompaction.stage).not.toBe('session_pin');
      expect(sessionPinner.getPin(sessionId)?.pinned_model_id).toBe(
        postCompaction.selected_model_id,
      );
    });

    it('model_select hook applies force_model_id on next extension routing request', async () => {
      const sessionId = 'ext-force-sess';
      const lifecycleHookState = new LifecycleHookState();
      const sessionPinner = new SessionPinner();
      const store = new MemoryStore();
      const router = createRouterFromFleet(fleet, {
        ...createDispatchOptions(store, sessionPinner),
        lifecycleHookState,
      });
      const { hooks, fireModelSelect } = createHookCapture();
      router.register(hooks);

      await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'initial' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );

      fireModelSelect(sessionId, 'gpt-4o');

      const forced = await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'forced turn' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );

      expect(forced.selected_model_id).toBe('gpt-4o');
      expect(forced.stage).toBe('session_pin');
      expect(sessionPinner.getPin(sessionId)?.pin_reason).toBe('user_forced');
    });

    it('status reflects reroute after compaction break via lifecycle hooks', async () => {
      const sessionId = 'ext-status-sess';
      const lifecycleHookState = new LifecycleHookState();
      const sessionPinner = new SessionPinner();
      const store = new MemoryStore();
      const router = createRouterFromFleet(fleet, {
        ...createDispatchOptions(store, sessionPinner),
        lifecycleHookState,
      });
      const { hooks, fireCompaction } = createHookCapture();
      router.register(hooks);

      let lastDecision: RoutingDecision | undefined;
      const initial = await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'seed pin' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );
      lastDecision = initial;

      const pinned = await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'still pinned' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );
      lastDecision = pinned;
      expect(pinned.stage).toBe('session_pin');

      const statusWhilePinned = formatStatusMessage(
        {
          fleetMode: 'scoped',
          lastDecision,
          priceCatalog: null,
          modelRegistry: {} as never,
          store,
          sessionPinner,
          executionLedger: {} as never,
          lifecycleHookState,
          hydraMatcher: undefined,
          sessionRouting: new Map(),
          streamDeps: { router, modelRegistry: {} as never, fleet, executionLedger: {} as never },
        },
        lastDecision,
      );
      expect(statusWhilePinned).toContain('session_pin');

      fireCompaction(sessionId);
      const rerouted = await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'post compaction reroute' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );
      lastDecision = rerouted;

      expect(rerouted.stage).not.toBe('session_pin');
      const statusAfterBreak = formatStatusMessage(
        {
          fleetMode: 'scoped',
          lastDecision,
          priceCatalog: null,
          modelRegistry: {} as never,
          store,
          sessionPinner,
          executionLedger: {} as never,
          lifecycleHookState,
          hydraMatcher: undefined,
          sessionRouting: new Map(),
          streamDeps: { router, modelRegistry: {} as never, fleet, executionLedger: {} as never },
        },
        lastDecision,
      );
      expect(statusAfterBreak).toContain(`Stage: ${rerouted.stage}`);
      expect(statusAfterBreak).not.toContain('Stage: session_pin');
    });
  });

  describe('SP-054: pin persistence across simulated session reload', () => {
    it('extension-path pin survives store-backed SessionPinner reload', async () => {
      const sessionId = 'ext-persist-sess';
      const lifecycleHookState = new LifecycleHookState();
      const store = new SqliteStore({ dbPath: ':memory:', models: fleet });
      const sessionPinner = new SessionPinner({ store });
      const router = createRouterFromFleet(fleet, {
        ...createDispatchOptions(store, sessionPinner),
        lifecycleHookState,
      });

      const initial = await router.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'initial turn' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );
      expect(initial.stage).not.toBe('session_pin');
      const pinnedModelId = sessionPinner.getPin(sessionId)?.pinned_model_id;
      expect(pinnedModelId).toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const reloadedPinner = new SessionPinner({ store });
      await reloadedPinner.restoreSessionPin(sessionId);
      const reloadedRouter = createRouterFromFleet(fleet, {
        ...createDispatchOptions(store, reloadedPinner),
        lifecycleHookState,
      });

      const pinnedTurn = await reloadedRouter.dispatch.dispatch(
        buildRoutingRequest(
          { messages: [{ role: 'user', content: 'still pinned after reload' }] } as never,
          { sessionId },
          lifecycleHookState,
        ),
      );

      expect(pinnedTurn.stage).toBe('session_pin');
      expect(pinnedTurn.selected_model_id).toBe(pinnedModelId);
      expect(reloadedPinner.getPin(sessionId)?.pinned_model_id).toBe(pinnedModelId);
    });

    it('SQLite file store persists pin across separate SessionPinner instances', async () => {
      const dbPath = join(tmpdir(), `pin-persist-${Date.now()}.db`);
      const sessionId = 'sqlite-reload-sess';

      const storeA = new SqliteStore({ dbPath, models: fleet });
      const pinnerA = new SessionPinner({ store: storeA });
      pinnerA.recordPin(sessionId, 'claude-opus', 'initial');
      await new Promise((resolve) => setTimeout(resolve, 0));
      storeA.close();

      const storeB = new SqliteStore({ dbPath, models: fleet });
      const pinnerB = new SessionPinner({ store: storeB });
      await pinnerB.restoreSessionPin(sessionId);

      const result = pinnerB.lookupPin(
        makeRequest({ session_id: sessionId }),
        fleet,
      );

      expect(result.action).toBe('use_pin');
      expect(result.pinnedModel?.id).toBe('claude-opus');
      storeB.close();
    });
  });
});
