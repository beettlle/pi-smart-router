/**
 * Adaptive reasoning policy matrix — SP-245, #166 (partial).
 *
 * Covers: policy table per turn class, explicit operator /thinking floor,
 * ambient session default adjustment, pin continuation inherit/upgrade,
 * model max ceiling clamp, fail-open on non-reasoning models, and the
 * conciseness hint gate (low/minimal + high verbosity_factor).
 */

import type { Api, Context, Model, ThinkingLevel } from '@earendil-works/pi-ai/compat';
import { describe, expect, it } from 'vitest';

import {
  CONCISENESS_SUFFIX,
  HIGH_VERBOSITY_FACTOR_THRESHOLD,
  SESSION_AMBIENT_THINKING_LEVEL,
  applyConcisenessHint,
  classifyReasoningTurn,
  clampToSupportedLevel,
  rankReasoningLevel,
  resolveAdaptiveReasoning,
  type AdaptiveReasoningSignal,
} from '../../src/domain/delegation/adaptive-reasoning.js';
import type {
  ModelProfile,
  RoutingDecision,
  TurnType,
} from '../../src/domain/types/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(
  overrides: Partial<Model<Api>> = {},
): Model<Api> {
  return {
    name: 'reasoning-model',
    api: 'openai-responses',
    baseUrl: 'https://example.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4096,
    provider: 'test-provider' as Model<Api>['provider'],
    id: 'reasoning-model',
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<ModelProfile> = {},
): ModelProfile {
  return {
    id: 'reasoning-model',
    provider: 'test-provider',
    tier: 'economical-cloud',
    capabilities: { reasoning: 0.5, code_gen: 0.5, tool_use: 0.5 },
    pricing: { fallback_cost_per_1m: 1.0 },
    ...overrides,
  };
}

function makeDecision(
  overrides: Partial<RoutingDecision> = {},
): RoutingDecision {
  return {
    request_id: '550e8400-e29b-41d4-a716-446655440001',
    selected_model_id: 'reasoning-model',
    tier: 'economical-cloud',
    stage: 'triage',
    reason_code: 'triage_match',
    routing_latency_ms: 1,
    pin_reason: null,
    ...overrides,
  };
}

function signal(overrides: Partial<AdaptiveReasoningSignal> = {}): AdaptiveReasoningSignal {
  return overrides;
}

// ─── Level ordering ──────────────────────────────────────────────────────────

describe('adaptive reasoning level ordering', () => {
  it('orders pi thinking levels from minimal to max', () => {
    expect(rankReasoningLevel('minimal')).toBeLessThan(rankReasoningLevel('low'));
    expect(rankReasoningLevel('low')).toBeLessThan(rankReasoningLevel('medium'));
    expect(rankReasoningLevel('medium')).toBeLessThan(rankReasoningLevel('high'));
    expect(rankReasoningLevel('high')).toBeLessThan(rankReasoningLevel('xhigh'));
    expect(rankReasoningLevel('xhigh')).toBeLessThan(rankReasoningLevel('max'));
  });
});

// ─── Model ceiling ───────────────────────────────────────────────────────────

describe('clampToSupportedLevel', () => {
  it('passes levels through when no thinkingLevelMap exists', () => {
    expect(clampToSupportedLevel('high', makeModel())).toBe('high');
  });

  it('clamps down past levels mapped to null (model-supported max)', () => {
    const model = makeModel({
      thinkingLevelMap: { high: null, xhigh: null, max: null },
    });
    expect(clampToSupportedLevel('high', model)).toBe('medium');
    expect(clampToSupportedLevel('low', model)).toBe('low');
  });

  it('returns undefined when every level at or below is unsupported', () => {
    const model = makeModel({
      thinkingLevelMap: {
        minimal: null,
        low: null,
        medium: null,
        high: null,
        xhigh: null,
        max: null,
      },
    });
    expect(clampToSupportedLevel('high', model)).toBeUndefined();
  });
});

// ─── Turn classification ─────────────────────────────────────────────────────

describe('classifyReasoningTurn', () => {
  it('classifies planning turns and planning_delegate decisions as planning', () => {
    expect(classifyReasoningTurn(signal({ turnType: 'planning' }))).toBe('planning');
    expect(
      classifyReasoningTurn(
        signal({
          turnType: 'main_loop',
          decision: makeDecision({ reason_code: 'planning_delegate' }),
        }),
      ),
    ).toBe('planning');
  });

  it('classifies frontier tier and loop_escalation as escalation', () => {
    expect(
      classifyReasoningTurn(
        signal({
          turnType: 'main_loop',
          decision: makeDecision({ tier: 'frontier-cloud' }),
        }),
      ),
    ).toBe('escalation');
    expect(
      classifyReasoningTurn(
        signal({
          turnType: 'main_loop',
          decision: makeDecision({ stage: 'loop_escalation' }),
        }),
      ),
    ).toBe('escalation');
  });

  it('classifies main_loop and tool_result as routine', () => {
    expect(classifyReasoningTurn(signal({ turnType: 'main_loop' }))).toBe('routine');
    expect(classifyReasoningTurn(signal({ turnType: 'tool_result' }))).toBe('routine');
  });

  it('classifies empty or unknown signals as unknown', () => {
    expect(classifyReasoningTurn(signal())).toBe('unknown');
    expect(classifyReasoningTurn(signal({ turnType: 'unknown' }))).toBe('unknown');
    expect(classifyReasoningTurn(signal({ turnType: 'subagent' }))).toBe('unknown');
  });
});

// ─── Policy matrix ───────────────────────────────────────────────────────────

describe('resolveAdaptiveReasoning policy matrix', () => {
  const cases: Array<{ turnType: TurnType; expected: ThinkingLevel }> = [
    { turnType: 'tool_result', expected: 'minimal' },
    { turnType: 'main_loop', expected: 'low' },
    { turnType: 'planning', expected: 'medium' },
  ];

  for (const { turnType, expected } of cases) {
    it(`${turnType} turn → ${expected} when caller provides no reasoning`, () => {
      const result = resolveAdaptiveReasoning(
        makeModel(),
        signal({ turnType }),
        undefined,
      );
      expect(result.reasoning).toBe(expected);
    });
  }

  it('frontier escalation → high when caller provides no reasoning', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({
        turnType: 'main_loop',
        decision: makeDecision({ tier: 'frontier-cloud' }),
      }),
      undefined,
    );
    expect(result.reasoning).toBe('high');
    expect(result.reasonCode).toBe('frontier_escalation');
  });

  it('lowers the ambient pi session default (medium) on routine turns', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop' }),
      SESSION_AMBIENT_THINKING_LEVEL,
    );
    expect(result.reasoning).toBe('low');
    expect(result.reasonCode).toBe('turn_envelope_main_loop');
  });
});

// ─── Explicit operator /thinking floor ───────────────────────────────────────

describe('explicit operator /thinking is never lowered', () => {
  it('explicit high wins over routine policy (low)', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop' }),
      'high',
    );
    expect(result.reasoning).toBe('high');
    expect(result.reasonCode).toBe('operator_thinking_floor');
  });

  it('explicit xhigh wins over frontier escalation policy (high)', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({
        turnType: 'main_loop',
        decision: makeDecision({ tier: 'frontier-cloud' }),
      }),
      'xhigh',
    );
    expect(result.reasoning).toBe('xhigh');
    expect(result.reasonCode).toBe('operator_thinking_floor');
  });

  it('explicit low is raised when the turn class upgrades to planning', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'planning' }),
      'low',
    );
    expect(result.reasoning).toBe('medium');
    expect(result.reasonCode).toBe('operator_thinking_upgrade');
  });
});

// ─── Pin continuation ────────────────────────────────────────────────────────

describe('pin continuation inherits session unless turn class upgrades', () => {
  const pinnedDecision = makeDecision({
    stage: 'session_pin',
    reason_code: 'session_pinned',
  });

  it('routine pinned turn keeps the ambient session level', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop', decision: pinnedDecision }),
      SESSION_AMBIENT_THINKING_LEVEL,
    );
    expect(result.reasoning).toBe('medium');
    expect(result.reasonCode).toBe('pin_inherit_session');
  });

  it('pinned turn upgrades when policy exceeds the session level', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({
        turnType: 'main_loop',
        decision: makeDecision({
          stage: 'session_pin',
          reason_code: 'session_pinned',
          tier: 'frontier-cloud',
        }),
      }),
      SESSION_AMBIENT_THINKING_LEVEL,
    );
    expect(result.reasoning).toBe('high');
    expect(result.reasonCode).toBe('pin_turn_class_upgrade');
  });

  it('pinned turn with no caller level applies pure policy', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'tool_result', decision: pinnedDecision }),
      undefined,
    );
    expect(result.reasoning).toBe('minimal');
  });
});

// ─── Model ceiling and fail open ─────────────────────────────────────────────

describe('model ceiling and fail-open behavior', () => {
  it('never raises past the model-supported max', () => {
    const model = makeModel({
      thinkingLevelMap: { high: null, xhigh: null, max: null },
    });
    const result = resolveAdaptiveReasoning(
      model,
      signal({
        turnType: 'main_loop',
        decision: makeDecision({ tier: 'frontier-cloud' }),
      }),
      undefined,
    );
    expect(result.reasoning).toBe('medium');
    expect(result.reasonCode).toBe('frontier_escalation');
  });

  it('fails open on non-reasoning models (caller passthrough)', () => {
    const model = makeModel({ reasoning: false });
    const result = resolveAdaptiveReasoning(
      model,
      signal({ turnType: 'main_loop' }),
      'high',
    );
    expect(result.reasoning).toBe('high');
    expect(result.reasonCode).toBe('reasoning_unsupported');
    expect(result.concisenessHint).toBe(false);
  });

  it('fails open on non-reasoning models with no caller level (no-op)', () => {
    const result = resolveAdaptiveReasoning(
      makeModel({ reasoning: false }),
      signal({ turnType: 'main_loop' }),
      undefined,
    );
    expect(result.reasoning).toBeUndefined();
    expect(result.reasonCode).toBe('reasoning_unsupported');
  });

  it('passes through when the turn class has no policy signal', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'unknown' }),
      'low',
    );
    expect(result.reasoning).toBe('low');
    expect(result.reasonCode).toBe('no_policy_signal');
  });
});

// ─── Conciseness hint ────────────────────────────────────────────────────────

describe('conciseness hint gate', () => {
  const chattyProfile = makeProfile({
    performance: { verbosity_factor: HIGH_VERBOSITY_FACTOR_THRESHOLD },
  });

  it('hints when effective level is low and verbosity_factor is high (GLM-class)', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop', profile: chattyProfile }),
      undefined,
    );
    expect(result.reasoning).toBe('low');
    expect(result.concisenessHint).toBe(true);
  });

  it('hints when effective level is minimal and verbosity_factor is high', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'tool_result', profile: chattyProfile }),
      undefined,
    );
    expect(result.reasoning).toBe('minimal');
    expect(result.concisenessHint).toBe(true);
  });

  it('does not hint for lean profiles even at low levels', () => {
    const leanProfile = makeProfile({
      performance: { verbosity_factor: 0.9 },
    });
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop', profile: leanProfile }),
      undefined,
    );
    expect(result.concisenessHint).toBe(false);
  });

  it('does not hint at medium or above even for chatty profiles', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'planning', profile: chattyProfile }),
      undefined,
    );
    expect(result.reasoning).toBe('medium');
    expect(result.concisenessHint).toBe(false);
  });
});

// ─── Conciseness suffix application ──────────────────────────────────────────

describe('applyConcisenessHint', () => {
  const baseContext: Context = {
    systemPrompt: 'You are a coding agent.',
    messages: [{ role: 'user', content: 'hi', timestamp: 1 }],
  };

  it('appends the suffix to an existing system prompt', () => {
    const hinted = applyConcisenessHint(baseContext, {
      reasoning: 'low',
      reasonCode: 'turn_envelope_main_loop',
      concisenessHint: true,
    });
    expect(hinted.systemPrompt).toBe(
      `You are a coding agent.\n\n${CONCISENESS_SUFFIX}`,
    );
    expect(hinted.messages).toBe(baseContext.messages);
  });

  it('is idempotent when the suffix is already present', () => {
    const hinted = applyConcisenessHint(baseContext, {
      reasoning: 'low',
      reasonCode: 'turn_envelope_main_loop',
      concisenessHint: true,
    });
    const twice = applyConcisenessHint(hinted, {
      reasoning: 'low',
      reasonCode: 'turn_envelope_main_loop',
      concisenessHint: true,
    });
    expect(twice.systemPrompt).toBe(hinted.systemPrompt);
  });

  it('returns the context unchanged without a hint', () => {
    const unchanged = applyConcisenessHint(baseContext, {
      reasoning: 'high',
      reasonCode: 'operator_thinking_floor',
      concisenessHint: false,
    });
    expect(unchanged).toBe(baseContext);
    expect(applyConcisenessHint(baseContext, undefined)).toBe(baseContext);
  });
});

// ─── Operator knobs: enable/disable + floor/ceiling (SP-246, #166) ─────────

describe('adaptive reasoning operator knobs', () => {
  it('disabled passes caller reasoning through unchanged with adaptive_reasoning_disabled', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop' }),
      SESSION_AMBIENT_THINKING_LEVEL,
      { enabled: false },
    );
    expect(result).toEqual({
      reasoning: SESSION_AMBIENT_THINKING_LEVEL,
      reasonCode: 'adaptive_reasoning_disabled',
      concisenessHint: false,
    });
  });

  it('disabled keeps caller options untouched when no caller reasoning exists', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'tool_result' }),
      undefined,
      { enabled: false },
    );
    expect(result.reasoning).toBeUndefined();
    expect(result.reasonCode).toBe('adaptive_reasoning_disabled');
    expect(result.concisenessHint).toBe(false);
  });

  it('disabled skips the policy even on a chatty profile (no conciseness hint)', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({
        turnType: 'main_loop',
        profile: makeProfile({ performance: { verbosity_factor: 2.0 } }),
      }),
      SESSION_AMBIENT_THINKING_LEVEL,
      { enabled: false },
    );
    expect(result.concisenessHint).toBe(false);
  });

  it('floor raises a policy-derived level with operator_floor_applied', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop' }),
      SESSION_AMBIENT_THINKING_LEVEL,
      { floor: 'medium' },
    );
    expect(result.reasoning).toBe('medium');
    expect(result.reasonCode).toBe('operator_floor_applied');
  });

  it('floor raises tool_result minimal turns', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'tool_result' }),
      undefined,
      { floor: 'low' },
    );
    expect(result.reasoning).toBe('low');
    expect(result.reasonCode).toBe('operator_floor_applied');
  });

  it('floor equal to the policy level keeps the turn-class reason code', () => {
    // Planning turns already policy-resolve to medium — a medium floor is a no-op.
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'planning' }),
      SESSION_AMBIENT_THINKING_LEVEL,
      { floor: 'medium' },
    );
    expect(result.reasoning).toBe('medium');
    expect(result.reasonCode).toBe('planning_turn');
  });

  it('floor re-clamps down to model-supported levels', () => {
    const model = makeModel({ thinkingLevelMap: { high: null, xhigh: null, max: null } });
    const result = resolveAdaptiveReasoning(
      model,
      signal({ turnType: 'main_loop' }),
      undefined,
      { floor: 'max' },
    );
    expect(result.reasoning).toBe('medium');
    expect(result.reasonCode).toBe('operator_floor_applied');
  });

  it('ceiling caps turn-class levels with operator_ceiling_applied', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop', decision: makeDecision({ tier: 'frontier-cloud' }) }),
      undefined,
      { ceiling: 'medium' },
    );
    expect(result.reasoning).toBe('medium');
    expect(result.reasonCode).toBe('operator_ceiling_applied');
  });

  it('ceiling neutralizes a pin turn-class upgrade back to session inherit', () => {
    const decision = makeDecision({ stage: 'session_pin', reason_code: 'session_pinned' });
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop', decision }),
      SESSION_AMBIENT_THINKING_LEVEL,
      { ceiling: 'low' },
    );
    // Bounded policy (low) no longer upgrades past the ambient session level —
    // the pin continuation inherits the session level unchanged.
    expect(result.reasoning).toBe(SESSION_AMBIENT_THINKING_LEVEL);
    expect(result.reasonCode).toBe('pin_inherit_session');
  });

  it('ceiling caps the ambient session default on policy-derived turns', () => {
    // Ambient medium is adjustable by policy (invariant 1) — a low ceiling
    // caps the planning-turn medium down to low.
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'planning' }),
      SESSION_AMBIENT_THINKING_LEVEL,
      { ceiling: 'low' },
    );
    expect(result.reasoning).toBe('low');
    expect(result.reasonCode).toBe('operator_ceiling_applied');
  });

  it('ceiling never lowers an explicit operator /thinking above it', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop' }),
      'high',
      { ceiling: 'low' },
    );
    expect(result.reasoning).toBe('high');
    expect(result.reasonCode).toBe('operator_thinking_floor');
  });

  it('floor can raise an explicit operator /thinking via the policy upgrade path', () => {
    // Static floor makes every turn class demand ≥ high; the explicit
    // /thinking minimal is upgraded (never lowered) to the floor level.
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop' }),
      'minimal',
      { floor: 'high' },
    );
    expect(result.reasoning).toBe('high');
    expect(result.reasonCode).toBe('operator_floor_applied');
  });

  it('ceiling wins when floor exceeds ceiling (cost-safe)', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop', decision: makeDecision({ tier: 'frontier-cloud' }) }),
      undefined,
      { floor: 'max', ceiling: 'low' },
    );
    expect(result.reasoning).toBe('low');
    expect(result.reasonCode).toBe('operator_ceiling_applied');
  });

  it('bounds below an explicit caller level keep the caller level', () => {
    // Ceiling low caps the policy, but the caller already asked for more.
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'planning' }),
      'xhigh',
      { ceiling: 'low' },
    );
    expect(result.reasoning).toBe('xhigh');
    expect(result.reasonCode).toBe('operator_thinking_floor');
  });

  it('disabled wins over unsupported models (no reasoning merge at all)', () => {
    const result = resolveAdaptiveReasoning(
      makeModel({ reasoning: false }),
      signal({ turnType: 'main_loop' }),
      'low',
      { enabled: false },
    );
    expect(result.reasonCode).toBe('adaptive_reasoning_disabled');
    expect(result.reasoning).toBe('low');
  });

  it('undefined options behave as enabled with no bounds (back-compat)', () => {
    const result = resolveAdaptiveReasoning(
      makeModel(),
      signal({ turnType: 'main_loop' }),
      SESSION_AMBIENT_THINKING_LEVEL,
    );
    expect(result.reasoning).toBe('low');
    expect(result.reasonCode).toBe('turn_envelope_main_loop');
  });
});
