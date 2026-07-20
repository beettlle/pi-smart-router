import { describe, expect, it } from 'vitest';

import {
  evaluateLoopEscalation,
  extractToolFailureSignature,
  isUnsupportedOrUnknownToolResult,
  ZERO_TIER_TOOL_CHURN_SIGNATURE,
  type LoopEscalationConfig,
} from '../../src/domain/pinning/loop-escalation.js';
import type { ModelProfile, RoutingRequest, SessionPin } from '../../src/domain/types/index.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

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

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-001',
    session_id: 'sess-1',
    prompt_text: 'Hello world',
    ...overrides,
  };
}

function makePin(overrides?: Partial<SessionPin>): SessionPin {
  return {
    session_id: 'sess-1',
    pinned_model_id: 'econ-model',
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

const econModel = makeModel({ id: 'econ-model', tier: 'economical-cloud' });
const frontierModel = makeModel({ id: 'frontier-model', tier: 'frontier-cloud' });
const zeroTierModel = makeModel({ id: 'local-qwen', tier: 'zero-tier' });
const fleet: readonly ModelProfile[] = [econModel, frontierModel];
const zeroTierFleet: readonly ModelProfile[] = [zeroTierModel, econModel, frontierModel];

const defaultConfig: LoopEscalationConfig = { threshold: 3 };

// ─── extractToolFailureSignature ─────────────────────────────────────────────

describe('extractToolFailureSignature', () => {
  it('returns null for empty messages', () => {
    expect(extractToolFailureSignature(makeRequest({ messages: [] }))).toBeNull();
  });

  it('returns null when messages is undefined', () => {
    expect(extractToolFailureSignature(makeRequest())).toBeNull();
  });

  it('returns null for non-tool messages', () => {
    const request = makeRequest({
      messages: [
        { role: 'user', content: 'Error: something failed' },
        { role: 'assistant', content: 'Let me fix that error' },
      ],
    });
    expect(extractToolFailureSignature(request)).toBeNull();
  });

  it('returns null for tool messages without failure patterns', () => {
    const request = makeRequest({
      messages: [
        { role: 'tool', content: 'File written successfully to /tmp/output.txt' },
      ],
    });
    expect(extractToolFailureSignature(request)).toBeNull();
  });

  it('returns a signature for tool messages with error pattern', () => {
    const request = makeRequest({
      messages: [
        { role: 'tool', content: 'Error: ENOENT file not found' },
      ],
    });
    const sig = extractToolFailureSignature(request);
    expect(sig).not.toBeNull();
    expect(sig).toMatch(/^tf:[0-9a-f]+$/);
  });

  it('returns a deterministic signature for identical failures', () => {
    const content = 'Error: connection timed out';
    const req1 = makeRequest({ messages: [{ role: 'tool', content }] });
    const req2 = makeRequest({ messages: [{ role: 'tool', content }] });

    expect(extractToolFailureSignature(req1)).toBe(extractToolFailureSignature(req2));
  });

  it('returns different signatures for different failures', () => {
    const req1 = makeRequest({
      messages: [{ role: 'tool', content: 'Error: ENOENT file not found' }],
    });
    const req2 = makeRequest({
      messages: [{ role: 'tool', content: 'Error: ECONNREFUSED connection refused' }],
    });

    const sig1 = extractToolFailureSignature(req1);
    const sig2 = extractToolFailureSignature(req2);
    expect(sig1).not.toBeNull();
    expect(sig2).not.toBeNull();
    expect(sig1).not.toBe(sig2);
  });

  it('inspects the last tool message (most recent)', () => {
    const request = makeRequest({
      messages: [
        { role: 'tool', content: 'Error: first failure' },
        { role: 'assistant', content: 'Let me try again' },
        { role: 'tool', content: 'Success: file written' },
      ],
    });
    expect(extractToolFailureSignature(request)).toBeNull();
  });

  it('detects each failure pattern', () => {
    const patterns = [
      'error', 'fail', 'exception', 'timed out',
      'timeout', 'econnrefused', 'enotfound', 'econnreset', 'epipe',
    ];
    for (const pattern of patterns) {
      const request = makeRequest({
        messages: [{ role: 'tool', content: `Something ${pattern} happened` }],
      });
      const sig = extractToolFailureSignature(request);
      expect(sig, `Pattern "${pattern}" should produce a signature`).not.toBeNull();
    }
  });

  it('is case-insensitive for failure detection', () => {
    const request = makeRequest({
      messages: [{ role: 'tool', content: 'ERROR: ECONNREFUSED' }],
    });
    expect(extractToolFailureSignature(request)).not.toBeNull();
  });
});

// ─── evaluateLoopEscalation ──────────────────────────────────────────────────

describe('evaluateLoopEscalation', () => {
  describe('guard clauses', () => {
    it('returns no_pin when pin is null', () => {
      const result = evaluateLoopEscalation(
        null,
        makeRequest({ turn_type: 'tool_result' }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('no_pin');
      expect(result.updatedPin).toBeNull();
      expect(result.escalationTarget).toBeNull();
    });

    it('returns already_escalated when pin reason is loop_escalation', () => {
      const pin = makePin({ pin_reason: 'loop_escalation' });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({ turn_type: 'tool_result' }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('already_escalated');
    });

    it('returns not_tool_result for planning turns', () => {
      const pin = makePin();
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({ turn_type: 'planning' }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('not_tool_result');
    });

    it('returns not_tool_result for main_loop turns', () => {
      const pin = makePin();
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({ turn_type: 'main_loop' }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('not_tool_result');
    });

    it('returns not_tool_result when turn_type is undefined', () => {
      const pin = makePin();
      const result = evaluateLoopEscalation(
        pin,
        makeRequest(),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('not_tool_result');
    });
  });

  describe('no failure in tool result', () => {
    it('returns no_failure when tool message has no failure pattern', () => {
      const pin = makePin();
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'File written successfully' }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('no_failure');
    });

    it('resets counter on successful tool result (success_reset)', () => {
      const pin = makePin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: 'tf:abc123',
      });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Operation completed' }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('success_reset');
      expect(result.updatedPin).not.toBeNull();
      expect(result.updatedPin!.consecutive_tool_failures).toBe(0);
      expect(result.updatedPin!.last_tool_failure_signature).toBeNull();
    });

    it('does not reset when failures are already at 0', () => {
      const pin = makePin({ consecutive_tool_failures: 0 });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'All good' }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.reason).toBe('no_failure');
      expect(result.updatedPin).toBeNull();
    });
  });

  describe('failure counting', () => {
    it('increments counter on first identical failure (below_threshold)', () => {
      const pin = makePin();
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Error: ENOENT' }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('below_threshold');
      expect(result.updatedPin).not.toBeNull();
      expect(result.updatedPin!.consecutive_tool_failures).toBe(1);
      expect(result.updatedPin!.last_tool_failure_signature).toMatch(/^tf:/);
    });

    it('increments counter on repeated identical failure', () => {
      const failureContent = 'Error: ENOENT file not found';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        consecutive_tool_failures: 1,
        last_tool_failure_signature: sig,
      });

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.updatedPin!.consecutive_tool_failures).toBe(2);
      expect(result.reason).toBe('below_threshold');
    });

    it('resets counter to 1 on a different failure signature (frontier pin, identical-only gate)', () => {
      // Frontier pins keep the stricter FR-014 identical-failure gate: a
      // different failure signature resets the streak to 1. Economical pins
      // count any consecutive failure (SP-210 churn) — covered in
      // economical-pin-break-agentic.test.ts.
      const pin = makePin({
        pinned_model_id: 'frontier-model',
        consecutive_tool_failures: 2,
        last_tool_failure_signature: 'tf:old_signature',
      });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Error: ECONNREFUSED brand new' }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.updatedPin!.consecutive_tool_failures).toBe(1);
    });
  });

  describe('escalation trigger', () => {
    it('fires escalation at threshold (threshold_exceeded)', () => {
      const failureContent = 'Error: ENOENT file not found';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: sig,
      });

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('threshold_exceeded');
      expect(result.escalationTarget).not.toBeNull();
      expect(result.escalationTarget!.tier).toBe('frontier-cloud');
      expect(result.escalationTarget!.id).toBe('frontier-model');
    });

    it('selects a frontier model different from current pin', () => {
      const failureContent = 'Error: timeout';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        pinned_model_id: 'frontier-model',
        consecutive_tool_failures: 2,
        last_tool_failure_signature: sig,
      });

      const fleetWithTwoFrontiers = [
        econModel,
        frontierModel,
        makeModel({ id: 'frontier-alt', tier: 'frontier-cloud' }),
      ];

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleetWithTwoFrontiers,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.escalationTarget!.id).toBe('frontier-alt');
    });

    it('returns no_frontier_available when no frontier target exists', () => {
      const failureContent = 'Error: timeout';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: sig,
      });

      const econOnlyFleet = [econModel];

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        econOnlyFleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('no_frontier_available');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(3);
    });

    it('skips unhealthy frontier models', () => {
      const failureContent = 'Error: timeout';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: sig,
      });

      const fleetWithSickFrontier = [
        econModel,
        makeModel({ id: 'sick-frontier', tier: 'frontier-cloud', healthy: false }),
        makeModel({ id: 'healthy-frontier', tier: 'frontier-cloud' }),
      ];

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleetWithSickFrontier,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.escalationTarget!.id).toBe('healthy-frontier');
    });

    it('fires with custom threshold', () => {
      const failureContent = 'Error: ENOENT';
      const sig = extractToolFailureSignature(
        makeRequest({ messages: [{ role: 'tool', content: failureContent }] }),
      )!;

      const pin = makePin({
        consecutive_tool_failures: 4,
        last_tool_failure_signature: sig,
      });

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: failureContent }],
        }),
        fleet,
        { threshold: 5 },
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('threshold_exceeded');
    });
  });

  describe('once-per-session guarantee (FR-008)', () => {
    it('does not re-escalate after loop_escalation pin reason', () => {
      const pin = makePin({
        pin_reason: 'loop_escalation',
        pinned_model_id: 'frontier-model',
        consecutive_tool_failures: 5,
        last_tool_failure_signature: 'tf:abc',
      });

      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Error: still failing' }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('already_escalated');
    });
  });

  describe('updatedPin metadata', () => {
    it('preserves session_id and other pin fields in updatedPin', () => {
      const pin = makePin({ session_id: 'sess-42' });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          session_id: 'sess-42',
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Error: failed' }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.updatedPin!.session_id).toBe('sess-42');
      expect(result.updatedPin!.pinned_model_id).toBe('econ-model');
      expect(result.updatedPin!.updated_at).toBeTruthy();
    });

    it('sets updated_at timestamp in updatedPin', () => {
      const pin = makePin({ updated_at: '2026-01-01T00:00:00.000Z' });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Error: timeout' }],
        }),
        fleet,
        defaultConfig,
      );
      expect(result.updatedPin!.updated_at).not.toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('zero-tier observational pin-break (SP-178)', () => {
    function makeZeroTierPin(overrides?: Partial<SessionPin>): SessionPin {
      return makePin({
        pinned_model_id: 'local-qwen',
        ...overrides,
      });
    }

    it('detects unsupported/unknown tool result content', () => {
      expect(
        isUnsupportedOrUnknownToolResult(
          makeRequest({
            messages: [{ role: 'tool', content: "Unknown tool: obsidian_plan" }],
          }),
        ),
      ).toBe(true);
      expect(
        isUnsupportedOrUnknownToolResult(
          makeRequest({
            messages: [{ role: 'tool', content: 'File written successfully' }],
          }),
        ),
      ).toBe(false);
    });

    it('escalates immediately on unsupported tool while pinned to zero-tier', () => {
      const pin = makeZeroTierPin();
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Error: Unknown tool obsidian_plan' }],
        }),
        zeroTierFleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('zero_tier_unsupported_tool');
      expect(result.escalationTarget!.id).toBe('frontier-model');
      expect(result.updatedPin!.last_tool_failure_signature).toBe('zt:unsupported_tool');
    });

    it('does not immediate-escalate unsupported tool on economical pin (identical-failure path)', () => {
      const pin = makePin();
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Unknown tool: obsidian_plan' }],
        }),
        fleet,
        defaultConfig,
      );
      // "unknown tool" also matches FAILURE_PATTERNS via "fail"/"error"? "Unknown tool" has neither
      // "error" nor "fail" as substring... "Unknown" doesn't match. So no_failure unless pattern hits.
      // "fail" is not in "Unknown tool: obsidian_plan". Expect no_failure or below_threshold.
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).not.toBe('zero_tier_unsupported_tool');
    });

    it('counts successful tool_result turns on zero-tier pin (churn)', () => {
      const pin = makeZeroTierPin();
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'File written successfully' }],
        }),
        zeroTierFleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('zero_tier_below_threshold');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(1);
      expect(result.updatedPin!.last_tool_failure_signature).toBe(ZERO_TIER_TOOL_CHURN_SIGNATURE);
    });

    it('escalates after N tool_result turns on zero-tier pin', () => {
      const pin = makeZeroTierPin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: ZERO_TIER_TOOL_CHURN_SIGNATURE,
      });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'grep matched 3 lines' }],
        }),
        zeroTierFleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('zero_tier_tool_churn');
      expect(result.escalationTarget!.tier).toBe('frontier-cloud');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(3);
    });

    it('respects custom zero_tier_tool_call_threshold', () => {
      const pin = makeZeroTierPin({
        consecutive_tool_failures: 1,
        last_tool_failure_signature: ZERO_TIER_TOOL_CHURN_SIGNATURE,
      });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'ok' }],
        }),
        zeroTierFleet,
        { threshold: 3, zero_tier_tool_call_threshold: 2 },
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('zero_tier_tool_churn');
    });

    it('does not re-escalate zero-tier path after loop_escalation pin', () => {
      const pin = makeZeroTierPin({
        pin_reason: 'loop_escalation',
        pinned_model_id: 'frontier-model',
      });
      const result = evaluateLoopEscalation(
        pin,
        makeRequest({
          turn_type: 'tool_result',
          messages: [{ role: 'tool', content: 'Unknown tool: foo' }],
        }),
        zeroTierFleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('already_escalated');
    });
  });
});
