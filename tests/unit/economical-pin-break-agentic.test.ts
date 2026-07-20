/**
 * SP-210 / #122 — Economical pin break on hard agentic failure.
 *
 * Coverage for the economical-cloud observational churn path in
 * `evaluateLoopEscalation`. A session pinned economical that hits a hard
 * multi-step / tool-failure loop must not stay stuck on the economical pin
 * when a frontier tier can recover it.
 *
 * ─── Gap vs closed #98 / #99 ──────────────────────────────────────────────
 * #99 (SP-178) added an observational churn path for ZERO-TIER pins (counts
 * every tool_result turn). #98 added pre-local_zero tool-use capability
 * shortfall signals. Neither covered ECONOMICAL pins: economical escalation
 * used the stricter FR-014 identical-failure gate, so a hard agentic loop
 * that failed repeatedly with DIFFERENT errors (ENOENT → ECONNREFUSED →
 * timeout) reset the streak to 1 each turn and never escalated. This file
 * documents and locks the closed gap.
 *
 * ─── Break / upgrade conditions while pinned economical ───────────────────
 *   • N consecutive tool failures of ANY signature → escalate to frontier
 *     (when one is in the fleet) or report `no_frontier_available`.
 *   • A successful tool result → reset the failure streak to 0.
 *   • Escalation fires once per session (`pin_reason === 'loop_escalation'`
 *     short-circuits to `already_escalated`).
 *   • Non-tool_result turns never escalate (`not_tool_result`) — the
 *     economical pin holds on planning / main_loop turns.
 *   • Frontier pins keep the stricter identical-failure gate (FR-014) and
 *     reset the streak on a distinct failure signature.
 *
 * ─── History surfacing ────────────────────────────────────────────────────
 * On escalation, `router-pipeline`'s loop_escalation stage calls `breakPin`
 * then `recordPin(escalationTarget, 'loop_escalation')`; the subsequent
 * session_pin stage emits a decision whose `pin_reason === 'loop_escalation'`
 * and `selected_model_id === <frontier>`. That end-to-end surfacing is
 * asserted in `tests/integration/session-pinning.test.ts`
 * (SP-210 case); these unit tests assert the pure-function contract that
 * drives it.
 */

import { describe, expect, it } from 'vitest';

import {
  evaluateLoopEscalation,
  extractToolFailureSignature,
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
    prompt_text: 'Continue the agentic loop',
    ...overrides,
  };
}

function makeEconomicalPin(overrides?: Partial<SessionPin>): SessionPin {
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

function toolFailureRequest(content: string, requestId = 'req-001'): RoutingRequest {
  return makeRequest({
    request_id: requestId,
    turn_type: 'tool_result',
    messages: [{ role: 'tool', content }],
  });
}

const econModel = makeModel({ id: 'econ-model', tier: 'economical-cloud' });
const frontierModel = makeModel({ id: 'frontier-model', tier: 'frontier-cloud' });
const fleet: readonly ModelProfile[] = [econModel, frontierModel];
const econOnlyFleet: readonly ModelProfile[] = [econModel];

const defaultConfig: LoopEscalationConfig = { threshold: 3 };

function signatureFor(content: string): string {
  return extractToolFailureSignature(
    makeRequest({ messages: [{ role: 'tool', content }] }),
  )!;
}

// ─── Hard agentic failure: distinct (varied) failures escalate ──────────────

describe('SP-210: economical pin breaks on hard agentic failure (#122)', () => {
  describe('distinct / varied repeated tool failures escalate (the #122 gap)', () => {
    it('counts consecutive distinct failures toward the threshold', () => {
      // Streak of 2 distinct failures already on the pin; a third DIFFERENT
      // failure must increment (not reset) and trigger escalation.
      const pin = makeEconomicalPin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: signatureFor('Error: ENOENT file not found'),
      });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: ECONNREFUSED connection refused'),
        fleet,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('threshold_exceeded');
      expect(result.escalationTarget).not.toBeNull();
      expect(result.escalationTarget!.id).toBe('frontier-model');
      expect(result.escalationTarget!.tier).toBe('frontier-cloud');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(3);
    });

    it('increments (does not reset) on a different failure before threshold', () => {
      const pin = makeEconomicalPin({
        consecutive_tool_failures: 1,
        last_tool_failure_signature: signatureFor('Error: ENOENT'),
      });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: timed out waiting for response'),
        fleet,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('below_threshold');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(2);
      // Latest signature is tracked for telemetry / observability.
      expect(result.updatedPin!.last_tool_failure_signature).toBe(
        signatureFor('Error: timed out waiting for response'),
      );
    });

    it('escalates across three entirely different failure signatures', () => {
      // Turn 1: first distinct failure.
      let pin = makeEconomicalPin();
      let result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: ENOENT no such file'),
        fleet,
        defaultConfig,
      );
      expect(result.reason).toBe('below_threshold');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(1);
      pin = result.updatedPin!;

      // Turn 2: second, different failure.
      result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: ECONNREFUSED'),
        fleet,
        defaultConfig,
      );
      expect(result.reason).toBe('below_threshold');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(2);
      pin = result.updatedPin!;

      // Turn 3: third, different failure → escalate.
      result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: execution timed out'),
        fleet,
        defaultConfig,
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('threshold_exceeded');
      expect(result.escalationTarget!.id).toBe('frontier-model');
    });
  });

  describe('identical repeated failures still escalate (FR-014 regression)', () => {
    it('escalates at threshold on identical failures', () => {
      const failureContent = 'Error: ENOENT file not found';
      const sig = signatureFor(failureContent);
      const pin = makeEconomicalPin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: sig,
      });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest(failureContent),
        fleet,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('threshold_exceeded');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(3);
    });

    it('respects a custom threshold for economical churn', () => {
      const failureContent = 'Error: timeout';
      const sig = signatureFor(failureContent);
      const pin = makeEconomicalPin({
        consecutive_tool_failures: 3,
        last_tool_failure_signature: sig,
      });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest(failureContent),
        fleet,
        { threshold: 5 },
      );

      // 3 → 4, below custom threshold of 5.
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('below_threshold');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(4);
    });
  });

  describe('escalation target selection', () => {
    it('reports no_frontier_available when no frontier is in the fleet', () => {
      const pin = makeEconomicalPin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: signatureFor('Error: ENOENT'),
      });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: ECONNREFUSED brand new'),
        econOnlyFleet,
        defaultConfig,
      );

      // The session leaves the stuck economical pin's pure session_pinned state:
      // escalation is attempted (counter still advances) but no frontier target
      // exists, so the caller re-routes from scratch rather than staying pinned.
      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('no_frontier_available');
      expect(result.escalationTarget).toBeNull();
      expect(result.updatedPin!.consecutive_tool_failures).toBe(3);
    });

    it('skips an unhealthy frontier and selects a healthy one', () => {
      const pin = makeEconomicalPin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: signatureFor('Error: ENOENT'),
      });
      const fleetWithSickFrontier: readonly ModelProfile[] = [
        econModel,
        makeModel({ id: 'sick-frontier', tier: 'frontier-cloud', healthy: false }),
        makeModel({ id: 'healthy-frontier', tier: 'frontier-cloud' }),
      ];

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: ECONNREFUSED'),
        fleetWithSickFrontier,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.escalationTarget!.id).toBe('healthy-frontier');
    });
  });

  describe('once-per-session guarantee (FR-008)', () => {
    it('does not re-escalate after the pin is already loop_escalation', () => {
      const pin = makeEconomicalPin({
        pinned_model_id: 'frontier-model',
        pin_reason: 'loop_escalation',
        consecutive_tool_failures: 5,
        last_tool_failure_signature: 'tf:abc',
      });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: still failing differently'),
        fleet,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('already_escalated');
      expect(result.updatedPin).toBeNull();
    });
  });

  // ─── Non-regression: healthy economical pin holds ─────────────────────────

  describe('non-regression: healthy economical pin holds', () => {
    it('does not escalate on a successful tool result (success_reset)', () => {
      const pin = makeEconomicalPin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: signatureFor('Error: ENOENT'),
      });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('File written successfully to /tmp/out.txt'),
        fleet,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('success_reset');
      expect(result.updatedPin!.consecutive_tool_failures).toBe(0);
      expect(result.updatedPin!.last_tool_failure_signature).toBeNull();
    });

    it('returns no_failure (no state change) when streak is already 0', () => {
      const pin = makeEconomicalPin({ consecutive_tool_failures: 0 });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('grep matched 3 lines'),
        fleet,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('no_failure');
      expect(result.updatedPin).toBeNull();
    });

    it('does not escalate on planning / main_loop turns (not_tool_result)', () => {
      const pin = makeEconomicalPin({
        consecutive_tool_failures: 5,
        last_tool_failure_signature: 'tf:abc',
      });

      for (const turnType of ['planning', 'main_loop', 'unknown'] as const) {
        const result = evaluateLoopEscalation(
          pin,
          makeRequest({ turn_type: turnType }),
          fleet,
          defaultConfig,
        );
        expect(result.shouldEscalate, `turn_type=${turnType}`).toBe(false);
        expect(result.reason, `turn_type=${turnType}`).toBe('not_tool_result');
      }
    });

    it('does not escalate when there is no pin', () => {
      const result = evaluateLoopEscalation(
        null,
        toolFailureRequest('Error: ENOENT'),
        fleet,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(false);
      expect(result.reason).toBe('no_pin');
    });
  });

  // ─── Non-regression: frontier keeps the identical-only gate (FR-014) ───────

  describe('non-regression: frontier pin keeps identical-failure gate', () => {
    function makeFrontierPin(overrides?: Partial<SessionPin>): SessionPin {
      return makeEconomicalPin({ pinned_model_id: 'frontier-model', ...overrides });
    }

    it('resets the streak to 1 on a different failure signature', () => {
      const pin = makeFrontierPin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: 'tf:old',
      });

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest('Error: ECONNREFUSED brand new'),
        fleet,
        defaultConfig,
      );

      expect(result.updatedPin!.consecutive_tool_failures).toBe(1);
      expect(result.shouldEscalate).toBe(false);
    });

    it('still escalates on identical failures at threshold', () => {
      const content = 'Error: ENOENT';
      const sig = signatureFor(content);
      const pin = makeFrontierPin({
        consecutive_tool_failures: 2,
        last_tool_failure_signature: sig,
      });
      // Escalation selects a frontier DIFFERENT from the current pin, so the
      // fleet needs a second healthy frontier.
      const twoFrontierFleet: readonly ModelProfile[] = [
        econModel,
        frontierModel,
        makeModel({ id: 'frontier-alt', tier: 'frontier-cloud' }),
      ];

      const result = evaluateLoopEscalation(
        pin,
        toolFailureRequest(content),
        twoFrontierFleet,
        defaultConfig,
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.reason).toBe('threshold_exceeded');
      expect(result.escalationTarget!.id).toBe('frontier-alt');
    });
  });
});
