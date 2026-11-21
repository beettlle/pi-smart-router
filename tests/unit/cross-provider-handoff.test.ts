import { describe, expect, it } from 'vitest';

import { CrossProviderHandoffTracker } from '../../src/domain/routing/cross-provider-handoff.js';
import type {
  ModelProfile,
  SessionPin,
  TurnType,
} from '../../src/domain/types/index.js';

const fleet: readonly ModelProfile[] = [
  {
    id: 'cursor-auto',
    tier: 'frontier-cloud',
    provider: 'cursor',
    capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
    pricing: { fallback_cost_per_1m: 1 },
  },
  {
    id: 'claude-sonnet',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
    pricing: { fallback_cost_per_1m: 1 },
  },
  {
    id: 'claude-haiku',
    tier: 'economical-cloud',
    provider: 'anthropic',
    capabilities: { reasoning: 0.7, code_gen: 0.7, tool_use: 0.7 },
    pricing: { fallback_cost_per_1m: 0.1 },
  },
];

function pin(modelId: string): SessionPin {
  return {
    session_id: 'session-1',
    pinned_model_id: modelId,
    pin_reason: 'initial',
    has_ever_switched: modelId !== 'cursor-auto',
    consecutive_upstream_errors: 0,
    consecutive_tool_failures: 0,
    last_tool_failure_signature: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  };
}

function observe(
  tracker: CrossProviderHandoffTracker,
  turnType: TurnType,
  modelId: string,
  sessionId = 'session-1',
) {
  return tracker.observe({
    sessionId,
    turnType,
    pin: { ...pin(modelId), session_id: sessionId },
    fleet,
  });
}

describe('CrossProviderHandoffTracker', () => {
  it('re-checks the first tool_result after a cross-provider pin transition', () => {
    const tracker = new CrossProviderHandoffTracker();

    expect(observe(tracker, 'main_loop', 'cursor-auto').shouldRecheck).toBe(false);
    const result = observe(tracker, 'tool_result', 'claude-sonnet');

    expect(result).toEqual({
      shouldRecheck: true,
      previousProvider: 'cursor',
      currentProvider: 'anthropic',
    });
  });

  it('consumes the handoff so later tool_results remain sticky', () => {
    const tracker = new CrossProviderHandoffTracker();
    observe(tracker, 'main_loop', 'cursor-auto');

    expect(observe(tracker, 'tool_result', 'claude-sonnet').shouldRecheck).toBe(true);
    expect(observe(tracker, 'tool_result', 'claude-sonnet').shouldRecheck).toBe(false);
  });

  it('does not treat a same-provider model change as a handoff', () => {
    const tracker = new CrossProviderHandoffTracker();
    observe(tracker, 'main_loop', 'claude-sonnet');

    expect(observe(tracker, 'tool_result', 'claude-haiku').shouldRecheck).toBe(false);
  });

  it('does not infer a handoff from a newly-created pin', () => {
    const tracker = new CrossProviderHandoffTracker();

    expect(observe(tracker, 'tool_result', 'claude-sonnet').shouldRecheck).toBe(false);
  });

  it('keeps a transition pending until the first tool_result', () => {
    const tracker = new CrossProviderHandoffTracker();
    observe(tracker, 'main_loop', 'cursor-auto');

    expect(observe(tracker, 'main_loop', 'claude-sonnet').shouldRecheck).toBe(false);
    expect(observe(tracker, 'tool_result', 'claude-sonnet').shouldRecheck).toBe(true);
  });

  it('isolates pending handoffs by session', () => {
    const tracker = new CrossProviderHandoffTracker();
    observe(tracker, 'main_loop', 'cursor-auto', 'session-1');
    observe(tracker, 'main_loop', 'cursor-auto', 'session-2');

    expect(observe(tracker, 'tool_result', 'claude-sonnet', 'session-1').shouldRecheck).toBe(true);
    expect(observe(tracker, 'tool_result', 'claude-sonnet', 'session-2').shouldRecheck).toBe(true);
    expect(observe(tracker, 'tool_result', 'claude-sonnet', 'session-1').shouldRecheck).toBe(false);
  });
});
