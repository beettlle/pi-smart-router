/**
 * Explain vs live parity integration test — T043, SC-010.
 *
 * Validates that the explain endpoint produces bit-for-bit identical routing
 * decisions to the live pipeline for the same input and session state.
 *
 * The contract (explain-endpoint.md) states:
 *   "Must be bit-for-bit equivalent to the decision the live pipeline would
 * Release matrix: explain vs live routing parity (SC-010).
 */

import { describe, expect, it } from 'vitest';

import { createExplainHandler, type ExplainHandlerDeps } from '../../src/api/explain/router-explain.js';
import { GatewayDispatch } from '../../src/infrastructure/gateway/gateway-dispatch.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { ModelProfile, RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';

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

const parityFleet: ModelProfile[] = [
  makeModel({ id: 'local-llama-3', tier: 'zero-tier', provider: 'ollama' }),
  makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' }),
  makeModel({ id: 'claude-sonnet', tier: 'economical-cloud', provider: 'anthropic' }),
  makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
];

function makeRequestBody(overrides?: Partial<RoutingRequest>): Record<string, unknown> {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    session_id: 'sess-parity-001',
    prompt_text: 'Fix the failing test in auth module',
    ...overrides,
  };
}

// ─── Decision comparison (ignoring routing_latency_ms as timing varies) ──────

function decisionsEquivalent(a: RoutingDecision, b: RoutingDecision): void {
  expect(a.request_id).toBe(b.request_id);
  expect(a.selected_model_id).toBe(b.selected_model_id);
  expect(a.tier).toBe(b.tier);
  expect(a.stage).toBe(b.stage);
  expect(a.reason_code).toBe(b.reason_code);
  expect(a.pin_reason).toBe(b.pin_reason);
  expect(a.candidates).toEqual(b.candidates);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('@release', () => {
describe('SC-010: explain vs live parity', () => {
  it('explain and live pipeline produce identical decisions for minimal request', async () => {
    const pipeline = new RouterPipeline(parityFleet);
    const deps: ExplainHandlerDeps = { fleet: parityFleet, pipeline };
    const explain = createExplainHandler(deps);

    const body = makeRequestBody();
    const liveRequest: RoutingRequest = {
      request_id: body.request_id as string,
      session_id: body.session_id as string,
      prompt_text: body.prompt_text as string,
    };

    const explainResult = await explain(body);
    const liveDecision = await pipeline.route(liveRequest);

    expect(explainResult.status).toBe(200);
    decisionsEquivalent(explainResult.body as RoutingDecision, liveDecision);
  });

  it('explain and live produce identical decisions for request with turn_type', async () => {
    const pipeline = new RouterPipeline(parityFleet);
    const deps: ExplainHandlerDeps = { fleet: parityFleet, pipeline };
    const explain = createExplainHandler(deps);

    const body = makeRequestBody({ turn_type: 'planning' });
    const liveRequest: RoutingRequest = {
      request_id: body.request_id as string,
      session_id: body.session_id as string,
      prompt_text: body.prompt_text as string,
      turn_type: 'planning',
    };

    const explainResult = await explain(body);
    const liveDecision = await pipeline.route(liveRequest);

    expect(explainResult.status).toBe(200);
    decisionsEquivalent(explainResult.body as RoutingDecision, liveDecision);
  });

  it('explain and live produce identical decisions for request with messages', async () => {
    const pipeline = new RouterPipeline(parityFleet);
    const deps: ExplainHandlerDeps = { fleet: parityFleet, pipeline };
    const explain = createExplainHandler(deps);

    const body = makeRequestBody();
    (body as Record<string, unknown>).messages = [
      { role: 'user', content: 'Add caching to the API' },
      { role: 'assistant', content: 'I will implement caching.' },
    ];
    const liveRequest: RoutingRequest = {
      request_id: body.request_id as string,
      session_id: body.session_id as string,
      prompt_text: body.prompt_text as string,
      messages: [
        { role: 'user', content: 'Add caching to the API' },
        { role: 'assistant', content: 'I will implement caching.' },
      ],
    };

    const explainResult = await explain(body);
    const liveDecision = await pipeline.route(liveRequest);

    expect(explainResult.status).toBe(200);
    decisionsEquivalent(explainResult.body as RoutingDecision, liveDecision);
  });

  it('explain and GatewayDispatch produce identical decisions (shared pipeline)', async () => {
    const pipeline = new RouterPipeline(parityFleet);
    const deps: ExplainHandlerDeps = { fleet: parityFleet, pipeline };
    const explain = createExplainHandler(deps);
    const gateway = new GatewayDispatch(parityFleet);

    const body = makeRequestBody();
    const liveRequest: RoutingRequest = {
      request_id: body.request_id as string,
      session_id: body.session_id as string,
      prompt_text: body.prompt_text as string,
    };

    const explainResult = await explain(body);
    const gatewayDecision = await gateway.dispatch(liveRequest);

    expect(explainResult.status).toBe(200);
    decisionsEquivalent(explainResult.body as RoutingDecision, gatewayDecision);
  });

  it('explain parity holds across all turn types', async () => {
    const pipeline = new RouterPipeline(parityFleet);
    const deps: ExplainHandlerDeps = { fleet: parityFleet, pipeline };
    const explain = createExplainHandler(deps);

    const turnTypes = ['planning', 'tool_result', 'subagent', 'main_loop', 'unknown'] as const;

    for (const turnType of turnTypes) {
      const body = makeRequestBody({
        request_id: `550e8400-e29b-41d4-a716-44665544000${turnTypes.indexOf(turnType)}`,
        turn_type: turnType,
      });
      const liveRequest: RoutingRequest = {
        request_id: body.request_id as string,
        session_id: body.session_id as string,
        prompt_text: body.prompt_text as string,
        turn_type: turnType,
      };

      const explainResult = await explain(body);
      const liveDecision = await pipeline.route(liveRequest);

      expect(explainResult.status).toBe(200);
      decisionsEquivalent(explainResult.body as RoutingDecision, liveDecision);
    }
  });

  it('explain parity holds with degraded fleet (no economical models)', async () => {
    const degradedFleet = [
      makeModel({ id: 'econ-down', tier: 'economical-cloud', healthy: false }),
      makeModel({ id: 'frontier-ok', tier: 'frontier-cloud' }),
    ];
    const pipeline = new RouterPipeline(degradedFleet);
    const deps: ExplainHandlerDeps = { fleet: degradedFleet, pipeline };
    const explain = createExplainHandler(deps);

    const body = makeRequestBody();
    const liveRequest: RoutingRequest = {
      request_id: body.request_id as string,
      session_id: body.session_id as string,
      prompt_text: body.prompt_text as string,
    };

    const explainResult = await explain(body);
    const liveDecision = await pipeline.route(liveRequest);

    expect(explainResult.status).toBe(200);
    decisionsEquivalent(explainResult.body as RoutingDecision, liveDecision);
  });

  it('explain parity holds with empty fleet', async () => {
    const emptyFleet: ModelProfile[] = [];
    const pipeline = new RouterPipeline(emptyFleet);
    const deps: ExplainHandlerDeps = { fleet: emptyFleet, pipeline };
    const explain = createExplainHandler(deps);

    const body = makeRequestBody();
    const liveRequest: RoutingRequest = {
      request_id: body.request_id as string,
      session_id: body.session_id as string,
      prompt_text: body.prompt_text as string,
    };

    const explainResult = await explain(body);
    const liveDecision = await pipeline.route(liveRequest);

    expect(explainResult.status).toBe(200);
    decisionsEquivalent(explainResult.body as RoutingDecision, liveDecision);
  });

  it('explain decision routing_latency_ms is bounded and non-negative', async () => {
    const pipeline = new RouterPipeline(parityFleet);
    const deps: ExplainHandlerDeps = { fleet: parityFleet, pipeline };
    const explain = createExplainHandler(deps);

    const result = await explain(makeRequestBody());
    expect(result.status).toBe(200);
    const decision = result.body as RoutingDecision;
    expect(decision.routing_latency_ms).toBeGreaterThanOrEqual(0);
    expect(decision.routing_latency_ms).toBeLessThan(100);
  });
});
});
