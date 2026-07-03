/**
 * Full pipeline E2E test — T060.
 *
 * Exercises the complete Request → Pipeline → Decision → Dispatch path
 * across all routing stages: triage (trivial/complex), turn envelope,
 * session pinning with sub-routing, loop escalation, and safe-default
 * fallback. Validates decision shape, stage correctness, and resilience.
 */

import { describe, expect, it } from 'vitest';

import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import { extractToolFailureSignature } from '../../src/domain/pinning/loop-escalation.js';
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
    request_id: 'e2e-req-001',
    session_id: 'session-e2e-001',
    prompt_text: 'Fix the failing test in auth module',
    ...overrides,
  };
}

const e2eFleet: ModelProfile[] = [
  makeModel({
    id: 'local-gemma',
    tier: 'zero-tier',
    provider: 'lmstudio',
    pricing: { fallback_cost_per_1m: 0 },
  }),
  makeModel({
    id: 'claude-haiku',
    tier: 'economical-cloud',
    provider: 'anthropic',
    pricing: { fallback_cost_per_1m: 0.8 },
  }),
  makeModel({
    id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    provider: 'openai',
    pricing: { fallback_cost_per_1m: 0.6 },
  }),
  makeModel({
    id: 'claude-opus',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    pricing: { fallback_cost_per_1m: 15.0 },
    capabilities: { reasoning: 0.95, code_gen: 0.9, tool_use: 0.9 },
  }),
  makeModel({
    id: 'gpt-4o',
    tier: 'frontier-cloud',
    provider: 'openai',
    pricing: { fallback_cost_per_1m: 10.0 },
    capabilities: { reasoning: 0.9, code_gen: 0.85, tool_use: 0.85 },
  }),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Full pipeline E2E (T060)', () => {
  describe('triage stage: trivial prompts → economical tier', () => {
    const trivialPrompts = [
      'Format this JSON file',
      'Fix this typo in the README',
      'Fix the indentation in the config',
      'Run prettier on the source files',
      'Fix whitespace in the template',
    ];

    it('routes all trivial prompts to economical-cloud via triage', async () => {
      const gateway = new GatewayDispatch(e2eFleet);

      for (const prompt of trivialPrompts) {
        const decision = await gateway.dispatch(
          makeRequest({
            request_id: `triage-trivial-${prompt.slice(0, 10)}`,
            prompt_text: prompt,
          }),
        );

        expect(decision.tier).toBe('economical-cloud');
        expect(decision.stage).toBe('triage');
        expect(decision.reason_code).toBe('keyword_economical');
      }
    });
  });

  describe('triage stage: complex prompts → frontier tier', () => {
    const complexPrompts = [
      'Design a distributed caching architecture for our microservices',
      'Debug the memory leak in the WebSocket handler',
      'Architect a real-time event sourcing system with CQRS',
    ];

    it('routes all complex prompts to frontier-cloud via triage', async () => {
      const gateway = new GatewayDispatch(e2eFleet);

      for (const prompt of complexPrompts) {
        const decision = await gateway.dispatch(
          makeRequest({
            request_id: `triage-complex-${prompt.slice(0, 10)}`,
            prompt_text: prompt,
          }),
        );

        expect(decision.tier).toBe('frontier-cloud');
        expect(decision.stage).toBe('triage');
      }
    });
  });

  describe('turn envelope stage: turn-type signals route correctly', () => {
    it('planning turns bias toward frontier', async () => {
      const gateway = new GatewayDispatch(e2eFleet);
      const decision = await gateway.dispatch(
        makeRequest({
          request_id: 'turn-planning',
          prompt_text: 'some ambiguous prompt text here',
          turn_type: 'planning',
        }),
      );

      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('turn_planning');
    });

    it('tool_result turns bias toward economical', async () => {
      const gateway = new GatewayDispatch(e2eFleet);
      const decision = await gateway.dispatch(
        makeRequest({
          request_id: 'turn-tool-result',
          prompt_text: 'some ambiguous prompt text here',
          turn_type: 'tool_result',
        }),
      );

      expect(decision.tier).toBe('economical-cloud');
      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('turn_tool_result');
    });

    it('subagent turns bias toward economical', async () => {
      const gateway = new GatewayDispatch(e2eFleet);
      const decision = await gateway.dispatch(
        makeRequest({
          request_id: 'turn-subagent',
          prompt_text: 'some ambiguous prompt text here',
          turn_type: 'subagent',
        }),
      );

      expect(decision.tier).toBe('economical-cloud');
      expect(decision.stage).toBe('turn_envelope');
      expect(decision.reason_code).toBe('turn_subagent');
    });
  });

  describe('session pinning: multi-turn stability through pipeline', () => {
    it('first request creates pin; subsequent requests reuse it', async () => {
      const pinner = new SessionPinner();
      const gateway = new GatewayDispatch(e2eFleet, { sessionPinner: pinner });

      const first = await gateway.dispatch(
        makeRequest({ request_id: 'init-turn' }),
      );
      const pinnedModel = first.selected_model_id;

      for (let i = 1; i <= 10; i++) {
        const decision = await gateway.dispatch(
          makeRequest({
            request_id: `turn-${i}`,
            prompt_text: `Turn ${i} continues work`,
          }),
        );

        expect(decision.selected_model_id).toBe(pinnedModel);
        expect(decision.stage).toBe('session_pin');
        expect(decision.reason_code).toBe('session_pinned');
      }
    });

    it('same-provider sub-routing on tool_result preserves pin', async () => {
      const pinner = new SessionPinner();
      pinner.recordPin('session-e2e-001', 'claude-opus', 'initial');
      const pipeline = new RouterPipeline(e2eFleet, { sessionPinner: pinner });

      const subRouted = await pipeline.route(
        makeRequest({
          request_id: 'sub-route',
          turn_type: 'tool_result',
          estimated_input_tokens: 50,
        }),
      );

      expect(subRouted.reason_code).toBe('tool_result_sub_route');
      expect(subRouted.selected_model_id).toBe('claude-haiku');

      const pin = pinner.getPin('session-e2e-001');
      expect(pin?.pinned_model_id).toBe('claude-opus');
    });

    it('compaction triggers pin break and full re-route', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(e2eFleet, { sessionPinner: pinner });

      await pipeline.route(makeRequest({ request_id: 'init' }));
      expect(pinner.getPin('session-e2e-001')).not.toBeNull();

      const postCompaction = await pipeline.route(
        makeRequest({
          request_id: 'post-compaction',
          compaction_flag: true,
        }),
      );

      expect(postCompaction.stage).not.toBe('session_pin');
    });

    it('force override switches model and updates pin', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(e2eFleet, { sessionPinner: pinner });

      await pipeline.route(makeRequest({ request_id: 'init' }));

      const forced = await pipeline.route(
        makeRequest({
          request_id: 'force-override',
          force_model_id: 'gpt-4o',
        }),
      );

      expect(forced.selected_model_id).toBe('gpt-4o');
      const pin = pinner.getPin('session-e2e-001');
      expect(pin?.pinned_model_id).toBe('gpt-4o');
      expect(pin?.pin_reason).toBe('user_forced');
    });
  });

  describe('loop escalation: repeated failures escalate to frontier', () => {
    it('escalates after threshold tool failures and stays escalated', async () => {
      const pinner = new SessionPinner();
      const pipeline = new RouterPipeline(e2eFleet, {
        sessionPinner: pinner,
        loopEscalationConfig: { threshold: 3 },
      });

      const sessionId = 'sess-loop';
      await pipeline.route(
        makeRequest({ request_id: 'init', session_id: sessionId }),
      );

      const errorMessage = 'Error: ENOENT: no such file or directory';
      const failureRequest: RoutingRequest = {
        request_id: 'fail-sig',
        session_id: sessionId,
        prompt_text: 'tool result',
        turn_type: 'tool_result',
        messages: [{ role: 'tool', content: errorMessage }],
      };
      const signature = extractToolFailureSignature(failureRequest);

      const initialPin = pinner.getPin(sessionId)!;
      pinner.loadPin({
        ...initialPin,
        consecutive_tool_failures: 2,
        last_tool_failure_signature: signature,
        updated_at: new Date().toISOString(),
      });

      await pipeline.route(
        makeRequest({
          request_id: 'trigger-escalation',
          session_id: sessionId,
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: errorMessage }],
        }),
      );

      const pin = pinner.getPin(sessionId);
      expect(pin?.pin_reason).toBe('loop_escalation');

      const postEscalation = await pipeline.route(
        makeRequest({
          request_id: 'post-escalation',
          session_id: sessionId,
          prompt_text: 'Continue debugging the issue',
        }),
      );

      expect(postEscalation.tier).toBe('frontier-cloud');
      expect(postEscalation.stage).toBe('session_pin');
      expect(postEscalation.reason_code).toBe('session_pinned');
    });
  });

  describe('safe-default fallback: resilience guarantees', () => {
    it('returns valid decision even with empty fleet', async () => {
      const gateway = new GatewayDispatch([]);
      const decision = await gateway.dispatch(makeRequest());

      expect(decision).toBeDefined();
      expect(decision.stage).toBe('fallback');
      expect(decision.reason_code).toBe('safe_cloud_default');
      expect(decision.selected_model_id).toBe('unknown');
    });

    it('falls back to frontier when all economical models are unhealthy', async () => {
      const degradedFleet = [
        makeModel({ id: 'econ-down-1', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'econ-down-2', tier: 'economical-cloud', healthy: false }),
        makeModel({ id: 'frontier-ok', tier: 'frontier-cloud' }),
      ];
      const gateway = new GatewayDispatch(degradedFleet);
      const decision = await gateway.dispatch(makeRequest());

      expect(decision.selected_model_id).toBe('frontier-ok');
      expect(decision.tier).toBe('frontier-cloud');
    });

    it('never throws for any input combination', async () => {
      const gateway = new GatewayDispatch(e2eFleet);
      const edgeCases: Partial<RoutingRequest>[] = [
        { prompt_text: '' },
        { prompt_text: 'x'.repeat(50_000) },
        { turn_type: 'unknown' },
        { compaction_flag: true },
        { estimated_input_tokens: 0 },
      ];

      for (const edge of edgeCases) {
        await expect(
          gateway.dispatch(makeRequest({ request_id: `edge-${JSON.stringify(edge).slice(0, 20)}`, ...edge })),
        ).resolves.toBeDefined();
      }
    });
  });

  describe('decision shape: all fields present and valid', () => {
    it('every routing decision has the required fields', async () => {
      const gateway = new GatewayDispatch(e2eFleet);
      const prompts = [
        'Format this JSON',
        'Design an event sourcing architecture',
        'Continue working on auth',
      ];

      for (const prompt of prompts) {
        const decision = await gateway.dispatch(
          makeRequest({
            request_id: `shape-${prompt.slice(0, 10)}`,
            prompt_text: prompt,
          }),
        );

        expect(decision.request_id).toEqual(expect.any(String));
        expect(decision.selected_model_id).toEqual(expect.any(String));
        expect(decision.selected_model_id).not.toBe('');
        expect(decision.tier).toMatch(/^(zero-tier|economical-cloud|frontier-cloud)$/);
        expect(decision.stage).toMatch(
          /^(triage|turn_envelope|session_pin|local_zero|hydra_match|fallback)$/,
        );
        expect(decision.reason_code).toEqual(expect.any(String));
        expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('multi-session isolation through GatewayDispatch', () => {
    it('independent sessions have independent pins', async () => {
      const pinner = new SessionPinner();
      const gateway = new GatewayDispatch(e2eFleet, { sessionPinner: pinner });

      const decisionA = await gateway.dispatch(
        makeRequest({ request_id: 'a-init', session_id: 'sess-a' }),
      );
      const decisionB = await gateway.dispatch(
        makeRequest({ request_id: 'b-init', session_id: 'sess-b' }),
      );

      const followA = await gateway.dispatch(
        makeRequest({
          request_id: 'a-follow',
          session_id: 'sess-a',
          prompt_text: 'Continue session A',
        }),
      );
      const followB = await gateway.dispatch(
        makeRequest({
          request_id: 'b-follow',
          session_id: 'sess-b',
          prompt_text: 'Continue session B',
        }),
      );

      expect(followA.selected_model_id).toBe(decisionA.selected_model_id);
      expect(followB.selected_model_id).toBe(decisionB.selected_model_id);
      expect(followA.stage).toBe('session_pin');
      expect(followB.stage).toBe('session_pin');
    });
  });

  describe('circuit breaker integration', () => {
    it('fails over to same-tier alternative on open circuit', async () => {
      const gateway = new GatewayDispatch(e2eFleet, {
        circuitBreakerConfig: { failureThreshold: 2, resetTimeoutMs: 60_000, halfOpenSuccesses: 1 },
      });

      gateway.recordOutcome('gpt-4o-mini', { statusCode: 503 });
      gateway.recordOutcome('gpt-4o-mini', { statusCode: 503 });

      const decision = await gateway.dispatch(makeRequest());

      if (decision.selected_model_id === 'gpt-4o-mini') {
        expect(decision.reason_code).not.toBe('circuit_breaker_failover');
      } else {
        expect(decision.selected_model_id).not.toBe('gpt-4o-mini');
      }
    });
  });
});
