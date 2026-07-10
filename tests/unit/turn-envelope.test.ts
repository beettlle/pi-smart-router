import { describe, expect, it } from 'vitest';

import { classifyTurnEnvelope } from '../../src/domain/triage/turn-envelope.js';
import { evaluateSubRoutePolicy } from '../../src/domain/pinning/sub-route-policy.js';
import type { Message, ModelProfile, RoutingRequest, SessionPin } from '../../src/domain/types/index.js';

function msg(role: string, content: string): Message {
  return { role, content };
}

describe('classifyTurnEnvelope', () => {
  describe('unknown — empty or missing envelope', () => {
    it('returns unknown for undefined messages', () => {
      expect(classifyTurnEnvelope(undefined)).toBe('unknown');
    });

    it('returns unknown for empty messages array', () => {
      expect(classifyTurnEnvelope([])).toBe('unknown');
    });
  });

  describe('tool_result — last message role=tool', () => {
    it('classifies tool role message as tool_result', () => {
      const messages: Message[] = [
        msg('user', 'run the test'),
        msg('assistant', 'running tests now'),
        msg('tool', 'PASS 3/3 tests passed'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('tool_result');
    });

    it('classifies short tool content as tool_result', () => {
      const messages: Message[] = [
        msg('tool', '{"status":"ok"}'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('tool_result');
    });

    it('does not classify oversized tool content as tool_result', () => {
      const largeContent = 'x'.repeat(60_000);
      const messages: Message[] = [
        msg('tool', largeContent),
      ];
      expect(classifyTurnEnvelope(messages)).not.toBe('tool_result');
    });

    it('only checks the last message for tool role', () => {
      const messages: Message[] = [
        msg('tool', 'earlier tool result'),
        msg('user', 'thanks, now plan the next step'),
      ];
      expect(classifyTurnEnvelope(messages)).not.toBe('tool_result');
    });
  });

  describe('planning — architecture/planning signals', () => {
    it('detects "plan" keyword in user message', () => {
      const messages: Message[] = [
        msg('user', 'Create a plan for the database migration'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects repo-cleanup / destructive-intent as planning (SP-176)', () => {
      const fixtures: Message[][] = [
        [msg('user', 'help me clean up mistakenly added files in the repo')],
        [msg('user', 'Help me clean up the repo')],
        [msg('user', 'Please unstage the accidental add and avoid force push')],
        [msg('user', 'Do not run rm -rf on the workspace')],
      ];
      for (const messages of fixtures) {
        expect(classifyTurnEnvelope(messages)).toBe('planning');
      }
    });

    it('detects "architecture" keyword', () => {
      const messages: Message[] = [
        msg('user', 'Review the architecture of the auth module'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects "design" keyword', () => {
      const messages: Message[] = [
        msg('assistant', 'Here is the design for the new API'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects step/phase markers', () => {
      const messages: Message[] = [
        msg('assistant', 'Step 1: Set up the project structure'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects markdown plan headers', () => {
      const messages: Message[] = [
        msg('assistant', '## Plan\n\n1. Refactor the module\n2. Add tests'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects "refactor" keyword', () => {
      const messages: Message[] = [
        msg('user', 'We need to refactor this component'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('detects planning in recent window (not just last)', () => {
      const messages: Message[] = [
        msg('user', 'skip this old message'),
        msg('user', 'outline the approach for migration'),
        msg('assistant', 'Here are the steps'),
        msg('user', 'looks good'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('does not detect planning outside the 3-message window', () => {
      const messages: Message[] = [
        msg('user', 'plan the entire architecture'),
        msg('assistant', 'done with the plan'),
        msg('user', 'now implement it'),
        msg('assistant', 'implementing now'),
        msg('user', 'how is it going'),
      ];
      expect(classifyTurnEnvelope(messages)).not.toBe('planning');
    });
  });

  describe('subagent — exploration/delegation signals', () => {
    it('detects "subagent" keyword', () => {
      const messages: Message[] = [
        msg('assistant', 'Launching a subagent to explore the codebase'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });

    it('detects "exploration" keyword', () => {
      const messages: Message[] = [
        msg('user', 'Use exploration to find the bug'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });

    it('detects "delegated" keyword', () => {
      const messages: Message[] = [
        msg('assistant', 'Task delegated to parallel agent'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });

    it('detects Task.create pattern', () => {
      const messages: Message[] = [
        msg('assistant', 'Called Task.create for the search'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });

    it('detects Agent.spawn pattern', () => {
      const messages: Message[] = [
        msg('assistant', 'Using Agent.spawn to handle this'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('subagent');
    });
  });

  describe('main_loop — default agent turn', () => {
    it('classifies normal user/assistant exchange as main_loop', () => {
      const messages: Message[] = [
        msg('user', 'Fix the bug in auth.ts'),
        msg('assistant', 'I will fix the null check issue'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });

    it('classifies simple code request as main_loop', () => {
      const messages: Message[] = [
        msg('user', 'Add a comment to line 42'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });

    it('classifies generic conversation as main_loop', () => {
      const messages: Message[] = [
        msg('system', 'You are a helpful assistant'),
        msg('user', 'Hello'),
        msg('assistant', 'Hi there'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });
  });

  describe('priority ordering', () => {
    it('tool_result takes priority over planning signals in content', () => {
      const messages: Message[] = [
        msg('user', 'plan the architecture'),
        msg('tool', 'planning result: success'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('tool_result');
    });

    it('planning takes priority over subagent when both present', () => {
      const messages: Message[] = [
        msg('user', 'plan the subagent exploration architecture'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });
  });

  describe('performance — <2ms budget', () => {
    it('classifies within 2ms for typical message envelopes', () => {
      const messages: Message[] = [
        msg('system', 'You are a coding assistant'),
        msg('user', 'Implement the feature'),
        msg('assistant', 'Working on it now'),
      ];

      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        classifyTurnEnvelope(messages);
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / iterations;

      expect(perCall).toBeLessThan(2);
    });

    it('classifies within 2ms for large message envelopes', () => {
      const messages: Message[] = Array.from({ length: 50 }, (_, i) =>
        msg(i % 2 === 0 ? 'user' : 'assistant', `Message number ${i} with some content`),
      );

      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        classifyTurnEnvelope(messages);
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / iterations;

      expect(perCall).toBeLessThan(2);
    });
  });

  describe('edge cases', () => {
    it('handles single system message', () => {
      const messages: Message[] = [
        msg('system', 'You are an assistant'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });

    it('handles empty content strings', () => {
      const messages: Message[] = [
        msg('user', ''),
        msg('assistant', ''),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });

    it('is case-insensitive for keyword matching', () => {
      const messages: Message[] = [
        msg('user', 'PLANNING the ARCHITECTURE'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('planning');
    });

    it('does not false-positive on partial word matches', () => {
      const messages: Message[] = [
        msg('user', 'explaining the approach'),
      ];
      expect(classifyTurnEnvelope(messages)).toBe('main_loop');
    });
  });
});

// ─── Sub-route policy tests (FR-024) ─────────────────────────────────────────

function makeModel(
  overrides: Partial<ModelProfile> & { id: string; tier: ModelProfile['tier'] },
): ModelProfile {
  return {
    provider: 'anthropic',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-001',
    session_id: 'sess-1',
    prompt_text: 'tool output',
    ...overrides,
  };
}

function makePin(overrides?: Partial<SessionPin>): SessionPin {
  return {
    session_id: 'sess-1',
    pinned_model_id: 'claude-opus',
    pin_reason: 'initial',
    has_ever_switched: false,
    consecutive_upstream_errors: 0,
    consecutive_tool_failures: 0,
    last_tool_failure_signature: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const frontierAnthro = makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' });
const econAnthro = makeModel({ id: 'claude-haiku', tier: 'economical-cloud', provider: 'anthropic' });
const econOpenai = makeModel({ id: 'gpt-4o-mini', tier: 'economical-cloud', provider: 'openai' });
const frontierOpenai = makeModel({ id: 'gpt-4o', tier: 'frontier-cloud', provider: 'openai' });

const testFleet: ModelProfile[] = [frontierAnthro, econAnthro, econOpenai, frontierOpenai];

describe('evaluateSubRoutePolicy (FR-024)', () => {
  describe('eligible — tool_result below threshold with same-provider economical', () => {
    it('returns eligible for small tool_result on same provider', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 100 }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(true);
      expect(result.reason).toBe('eligible');
      expect(result.subRouteModel?.id).toBe('claude-haiku');
      expect(result.subRouteModel?.provider).toBe('anthropic');
      expect(result.pinnedModel?.id).toBe('claude-opus');
    });

    it('selects cheapest same-provider economical model (SP-085)', () => {
      const cheapHaiku = makeModel({
        id: 'claude-haiku',
        tier: 'economical-cloud',
        provider: 'anthropic',
        pricing: { fallback_cost_per_1m: 0.15 },
      });
      const expensiveMini = makeModel({
        id: 'claude-mini',
        tier: 'economical-cloud',
        provider: 'anthropic',
        pricing: { fallback_cost_per_1m: 1.0 },
      });
      const fleet = [frontierAnthro, expensiveMini, cheapHaiku, econOpenai, frontierOpenai];

      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 100 }),
        makePin(),
        fleet,
      );

      expect(result.eligible).toBe(true);
      expect(result.subRouteModel?.id).toBe('claude-haiku');
    });

    it('uses prompt_text length when estimated_input_tokens is absent', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', prompt_text: 'short' }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(true);
      expect(result.subRouteModel?.id).toBe('claude-haiku');
    });

    it('respects custom size threshold — below', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 499 }),
        makePin(),
        testFleet,
        { sizeThreshold: 500 },
      );

      expect(result.eligible).toBe(true);
    });

    it('uses default 2048 threshold when none configured', () => {
      const below = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 2000 }),
        makePin(),
        testFleet,
      );
      expect(below.eligible).toBe(true);

      const above = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 2100 }),
        makePin(),
        testFleet,
      );
      expect(above.eligible).toBe(false);
      expect(above.reason).toBe('payload_exceeds_threshold');
    });
  });

  describe('ineligible — size threshold exceeded', () => {
    it('rejects when payload exceeds threshold', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 5000 }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('payload_exceeds_threshold');
      expect(result.subRouteModel).toBeUndefined();
    });

    it('rejects when prompt_text length exceeds threshold', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', prompt_text: 'x'.repeat(3000) }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('payload_exceeds_threshold');
    });

    it('rejects at custom threshold boundary', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 501 }),
        makePin(),
        testFleet,
        { sizeThreshold: 500 },
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('payload_exceeds_threshold');
    });
  });

  describe('ineligible — not a tool_result turn', () => {
    it('rejects planning turns', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'planning', estimated_input_tokens: 50 }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('not_tool_result');
    });

    it('rejects main_loop turns', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'main_loop', estimated_input_tokens: 50 }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('not_tool_result');
    });

    it('rejects subagent turns', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'subagent', estimated_input_tokens: 50 }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('not_tool_result');
    });

    it('rejects unknown turns', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'unknown', estimated_input_tokens: 50 }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('not_tool_result');
    });

    it('rejects when turn_type is undefined', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ estimated_input_tokens: 50 }),
        makePin(),
        testFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('not_tool_result');
    });
  });

  describe('ineligible — provider mismatch', () => {
    it('rejects when no economical model shares the pinned provider', () => {
      const isolatedFleet = [
        makeModel({ id: 'solo-frontier', tier: 'frontier-cloud', provider: 'solo-co' }),
        econOpenai,
      ];

      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        makePin({ pinned_model_id: 'solo-frontier' }),
        isolatedFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('no_same_provider_economical');
    });

    it('does not cross-provider sub-route even when economical models exist', () => {
      const crossFleet = [
        frontierAnthro,
        econOpenai,
      ];

      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        makePin({ pinned_model_id: 'claude-opus' }),
        crossFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('no_same_provider_economical');
    });
  });

  describe('ineligible — pinned model not in fleet', () => {
    it('rejects when pinned model is missing from fleet', () => {
      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        makePin({ pinned_model_id: 'removed-model' }),
        testFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('pinned_model_not_in_fleet');
    });
  });

  describe('ineligible — unhealthy economical model', () => {
    it('skips unhealthy same-provider economical models', () => {
      const fleetWithSick = [
        frontierAnthro,
        makeModel({ id: 'haiku-sick', tier: 'economical-cloud', provider: 'anthropic', healthy: false }),
      ];

      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        makePin(),
        fleetWithSick,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('no_same_provider_economical');
    });
  });

  describe('ineligible — self sub-route prevention', () => {
    it('does not sub-route to the pinned model itself', () => {
      const selfFleet = [
        makeModel({ id: 'econ-pinned', tier: 'economical-cloud', provider: 'test' }),
      ];

      const result = evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        makePin({ pinned_model_id: 'econ-pinned' }),
        selfFleet,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('no_same_provider_economical');
    });
  });

  describe('pin record integrity (SC-006)', () => {
    it('does not mutate the pin record', () => {
      const pin = makePin();
      const pinCopy = { ...pin };

      evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        pin,
        testFleet,
      );

      expect(pin).toEqual(pinCopy);
    });

    it('does not mutate the fleet array', () => {
      const fleetCopy = [...testFleet];

      evaluateSubRoutePolicy(
        makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 50 }),
        makePin(),
        testFleet,
      );

      expect(testFleet).toEqual(fleetCopy);
    });
  });

  describe('performance', () => {
    it('evaluates in <1ms for typical inputs', () => {
      const req = makeRequest({ turn_type: 'tool_result', estimated_input_tokens: 100 });
      const pin = makePin();

      const iterations = 10_000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        evaluateSubRoutePolicy(req, pin, testFleet);
      }
      const elapsed = performance.now() - start;
      const perCall = elapsed / iterations;

      expect(perCall).toBeLessThan(1);
    });
  });
});
