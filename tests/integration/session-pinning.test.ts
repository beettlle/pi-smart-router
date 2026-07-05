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

import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import {
  GatewayDispatch,
} from '../../src/infrastructure/gateway/gateway-dispatch.js';
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
            turn_type: 'planning',
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

      const turnTypes = ['planning', 'main_loop', 'subagent', 'unknown'] as const;

      for (const turnType of turnTypes) {
        const decision = await pipeline.route(
          makeRequest({
            request_id: `turn-${turnType}`,
            turn_type: turnType,
          }),
        );

        expect(decision.selected_model_id).toBe(pinnedModelId);
        expect(decision.stage).toBe('session_pin');
      }
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

      expect(subRouted.reason_code).toBe('tool_result_sub_route');
      expect(subRouted.selected_model_id).toBe('claude-haiku');

      const pin = pinner.getPin('session-pin-int');
      expect(pin?.pinned_model_id).toBe('claude-opus');
      expect(pin?.pin_reason).toBe('initial');

      const nextTurn = await pipeline.route(
        makeRequest({
          request_id: 'post-sub-route',
          turn_type: 'planning',
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

    it('preserves cache marker on same-provider sub-route', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('session-pin-int', 'claude-opus', 'initial');
      const gateway = new GatewayDispatch(fleet, { sessionPinner: pinner });

      await gateway.dispatch(
        makeRequest({ request_id: 'pin-setup', turn_type: 'planning' }),
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
      expect(markerAfter!.modelId).toBe(markerBefore!.modelId);
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
          turn_type: 'planning',
        }),
      );
      const decisionB = await pipeline.route(
        makeRequest({
          request_id: 'b-turn-2',
          session_id: 'sess-b',
          turn_type: 'planning',
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
});
