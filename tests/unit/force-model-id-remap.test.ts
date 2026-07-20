/**
 * SP-209 / #121 — Honor force_model_id / Prefer (No Silent Remap).
 *
 * Reproduces and locks the multi-fleet dogfood regression where a
 * `force_model_id` targeting a healthy in-fleet `github-copilot/*` or Gemini
 * id (or an unavailable id) silently remapped to Anthropic economical/frontier
 * models instead of (a) selecting the requested id or (b) failing closed with
 * an explicit reason.
 *
 * Two silent-remap roots are covered:
 *
 *   1. `turnEnvelope` short-circuited BEFORE the `session_pin` stage on a
 *      first turn (no pin), so a force was dropped and the envelope's tier
 *      pick (typically Anthropic) won. Fixed by deferring to session_pin when
 *      force is set.
 *
 *   2. `SessionPinner` only evaluated force when a pin existed, and an
 *      unavailable force returned `break` (re-route) — losing the reason and
 *      letting the pipeline silently pick a different provider family. Fixed
 *      by resolving force with or without a pin and returning `force_rejected`
 *      carrying an explicit reason code surfaced as the decision `reason_code`.
 *
 * AC (#121):
 *   - force == healthy in-fleet id → that id selected
 *   - force unavailable → explicit reject reason (no silent cross-family remap)
 *   - explain / SMART_ROUTER_LOG_ROUTING surfaces reason (reason_code)
 *   - fixtures: Gemini-preview-style, gpt-codex-style, Copilot first-turn
 *   - non-regression: unset force → normal routing
 */

import { describe, expect, it } from 'vitest';

import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import {
  SessionPinner,
  FORCE_REJECTED_NOT_IN_FLEET,
  FORCE_REJECTED_UNHEALTHY,
} from '../../src/domain/pinning/session-pinner.js';
import type {
  ModelProfile,
  RoutingRequest,
} from '../../src/domain/types/index.js';

// ─── Multi-fleet fixtures (Copilot + Gemini + Anthropic) ─────────────────────

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
    request_id: 'req-force-001',
    session_id: 'sess-force',
    prompt_text: 'Refactor the auth module and add tests',
    ...overrides,
  };
}

// Healthy in-fleet multi-provider fleet. Anthropic economical (claude-haiku) is
// the safe cloud default, which is what a SILENT remap would land on.
const copilotCodex = makeModel({
  id: 'github-copilot/gpt-5-codex',
  tier: 'economical-cloud',
  provider: 'github-copilot',
  pricing: { fallback_cost_per_1m: 0.5 },
});
const geminiPreview = makeModel({
  id: 'google/gemini-2.5-pro-preview',
  tier: 'frontier-cloud',
  provider: 'google',
  pricing: { fallback_cost_per_1m: 2.0 },
});
const anthropicFrontier = makeModel({
  id: 'anthropic/claude-opus',
  tier: 'frontier-cloud',
  provider: 'anthropic',
  pricing: { fallback_cost_per_1m: 15.0 },
});
const anthropicEcon = makeModel({
  id: 'anthropic/claude-haiku',
  tier: 'economical-cloud',
  provider: 'anthropic',
  pricing: { fallback_cost_per_1m: 1.0 },
});

const multiFleet: readonly ModelProfile[] = [
  anthropicFrontier,
  anthropicEcon,
  copilotCodex,
  geminiPreview,
];

// ─── Pinner unit: force resolution contract ──────────────────────────────────

describe('SP-209 / #121 — SessionPinner force resolution (no silent remap)', () => {
  it('selects a healthy in-fleet Gemini-preview id (with existing pin)', () => {
    const pinner = new SessionPinner();
    pinner.recordPin('sess-force', 'anthropic/claude-opus', 'initial');

    const result = pinner.lookupPin(
      makeRequest({ force_model_id: 'google/gemini-2.5-pro-preview' }),
      multiFleet,
    );

    expect(result.action).toBe('use_pin');
    expect(result.pinnedModel?.id).toBe('google/gemini-2.5-pro-preview');
    expect(result.pinnedModel?.provider).toBe('google');
    expect(pinner.getPin('sess-force')?.pinned_model_id).toBe(
      'google/gemini-2.5-pro-preview',
    );
    expect(pinner.getPin('sess-force')?.pin_reason).toBe('user_forced');
  });

  it('selects a healthy in-fleet gpt-codex (Copilot) id (with existing pin)', () => {
    const pinner = new SessionPinner();
    pinner.recordPin('sess-force', 'anthropic/claude-haiku', 'initial');

    const result = pinner.lookupPin(
      makeRequest({ force_model_id: 'github-copilot/gpt-5-codex' }),
      multiFleet,
    );

    expect(result.action).toBe('use_pin');
    expect(result.pinnedModel?.id).toBe('github-copilot/gpt-5-codex');
    expect(result.pinnedModel?.provider).toBe('github-copilot');
  });

  it('honors force on the FIRST turn with no existing pin (the #121 regression)', () => {
    const pinner = new SessionPinner();
    // No recordPin — first turn.

    const result = pinner.lookupPin(
      makeRequest({ force_model_id: 'github-copilot/gpt-5-codex' }),
      multiFleet,
    );

    // Previously returned `no_pin` and force was silently dropped.
    expect(result.action).toBe('use_pin');
    expect(result.pinnedModel?.id).toBe('github-copilot/gpt-5-codex');
    expect(pinner.getPin('sess-force')?.pinned_model_id).toBe(
      'github-copilot/gpt-5-codex',
    );
  });

  it('fails closed with force_rejected_not_in_fleet when target id is absent', () => {
    const pinner = new SessionPinner();
    pinner.recordPin('sess-force', 'anthropic/claude-opus', 'initial');

    const result = pinner.lookupPin(
      makeRequest({ force_model_id: 'github-copilot/oops-not-deployed' }),
      multiFleet,
    );

    expect(result.action).toBe('force_rejected');
    expect(result.forceRejectionReason).toBe(FORCE_REJECTED_NOT_IN_FLEET);
    expect(result.forceModelId).toBe('github-copilot/oops-not-deployed');
    // No silent remap: the existing Anthropic pin is preserved (no-op), and the
    // pipeline will surface the explicit reason rather than swapping providers.
    expect(pinner.getPin('sess-force')?.pinned_model_id).toBe(
      'anthropic/claude-opus',
    );
  });

  it('fails closed with force_rejected_unhealthy when target id is present but unhealthy', () => {
    const fleetWithSick = [
      ...multiFleet,
      makeModel({
        id: 'google/gemini-2.5-flash',
        tier: 'economical-cloud',
        provider: 'google',
        healthy: false,
      }),
    ];
    const pinner = new SessionPinner();
    pinner.recordPin('sess-force', 'anthropic/claude-haiku', 'initial');

    const result = pinner.lookupPin(
      makeRequest({ force_model_id: 'google/gemini-2.5-flash' }),
      fleetWithSick,
    );

    expect(result.action).toBe('force_rejected');
    expect(result.forceRejectionReason).toBe(FORCE_REJECTED_UNHEALTHY);
    expect(pinner.getPin('sess-force')?.pinned_model_id).toBe(
      'anthropic/claude-haiku',
    );
  });

  it('preserves compaction priority over force (regression guard)', () => {
    const pinner = new SessionPinner();
    pinner.recordPin('sess-force', 'anthropic/claude-opus', 'initial');

    const result = pinner.lookupPin(
      makeRequest({
        compaction_flag: true,
        force_model_id: 'google/gemini-2.5-pro-preview',
      }),
      multiFleet,
    );

    expect(result.action).toBe('break');
    expect(result.breakReason).toBe('compaction');
    expect(pinner.getPin('sess-force')).toBeNull();
  });
});

// ─── Pipeline integration: force end-to-end via route() ──────────────────────

describe('SP-209 / #121 — RouterPipeline force_model_id (no silent Anthropic remap)', () => {
  function pipelineWithPinner(): { pipeline: RouterPipeline; pinner: SessionPinner } {
    const pinner = new SessionPinner();
    const pipeline = new RouterPipeline(multiFleet, { sessionPinner: pinner });
    return { pipeline, pinner };
  }

  it('selects the forced Gemini-preview id on a first turn (no pin, planning turn)', async () => {
    const { pipeline } = pipelineWithPinner();

    // A planning turn with no existing pin previously let turnEnvelope pick
    // the lowest-cost frontier model (Anthropic) and drop the force.
    const decision = await pipeline.route(
      makeRequest({
        force_model_id: 'google/gemini-2.5-pro-preview',
        turn_type: 'planning',
      }),
    );

    expect(decision.selected_model_id).toBe('google/gemini-2.5-pro-preview');
    expect(decision.tier).toBe('frontier-cloud');
    expect(decision.pin_reason).toBe('user_forced');
    // Never silently landed on Anthropic.
    expect(decision.selected_model_id).not.toMatch(/anthropic/);
  });

  it('selects the forced Copilot gpt-codex id on a first turn (no pin)', async () => {
    const { pipeline } = pipelineWithPinner();

    const decision = await pipeline.route(
      makeRequest({ force_model_id: 'github-copilot/gpt-5-codex' }),
    );

    expect(decision.selected_model_id).toBe('github-copilot/gpt-5-codex');
    expect(decision.selected_model_id).not.toMatch(/anthropic/);
    expect(decision.pin_reason).toBe('user_forced');
  });

  it('fails closed with an explicit reason when the forced id is not in fleet', async () => {
    const { pipeline } = pipelineWithPinner();

    const decision = await pipeline.route(
      makeRequest({ force_model_id: 'github-copilot/never-deployed' }),
    );

    // Explicit reject reason surfaced (not a normal route reason_code).
    expect(decision.reason_code).toBe(FORCE_REJECTED_NOT_IN_FLEET);
    expect(decision.pin_reason).toBe('user_forced');
    expect(decision.stage).toBe('session_pin');
    // Zero-crash resilience: degrade to safe cloud default so the host agent
    // still has a usable model — but the reason_code makes the remap explicit,
    // never silent.
    expect(decision.selected_model_id).toBe('anthropic/claude-haiku');
  });

  it('fails closed with force_rejected_unhealthy when the forced id is present but unhealthy', async () => {
    const fleetWithSick = [
      ...multiFleet,
      makeModel({
        id: 'google/gemini-2.5-flash',
        tier: 'economical-cloud',
        provider: 'google',
        healthy: false,
      }),
    ];
    const pinner = new SessionPinner();
    const pipeline = new RouterPipeline(fleetWithSick, { sessionPinner: pinner });

    const decision = await pipeline.route(
      makeRequest({ force_model_id: 'google/gemini-2.5-flash' }),
    );

    expect(decision.reason_code).toBe(FORCE_REJECTED_UNHEALTHY);
    expect(decision.pin_reason).toBe('user_forced');
    expect(decision.stage).toBe('session_pin');
  });

  it('does NOT overwrite an existing pin when a force is rejected', async () => {
    const { pipeline, pinner } = pipelineWithPinner();
    // Seed a working Anthropic pin.
    pinner.recordPin('sess-force', 'anthropic/claude-opus', 'initial');

    await pipeline.route(
      makeRequest({ force_model_id: 'github-copilot/never-deployed' }),
    );

    // The one-shot force could not be applied; the existing pin is intact.
    expect(pinner.getPin('sess-force')?.pinned_model_id).toBe(
      'anthropic/claude-opus',
    );
  });

  it('non-regression: unset force still allows normal multi-objective routing', async () => {
    const { pipeline } = pipelineWithPinner();

    const decision = await pipeline.route(makeRequest());

    // No force → routes normally and never reports a force reason.
    expect(decision.reason_code).not.toBe(FORCE_REJECTED_NOT_IN_FLEET);
    expect(decision.reason_code).not.toBe(FORCE_REJECTED_UNHEALTHY);
    expect(decision.pin_reason).not.toBe('user_forced');
    expect(decision.selected_model_id).toBeTruthy();
  });
});

// ─── Step 2 non-regression ─────────────────────────────────────────────────

describe('SP-209 Step 2 — non-regression', () => {
  it('healthy Anthropic-only fleet still forces an Anthropic id correctly', async () => {
    // The original/primary single-provider config must keep working after the
    // multi-fleet force fix (no provider-family guard that rejects same-family).
    const anthropicOnly: readonly ModelProfile[] = [
      makeModel({
        id: 'claude-opus',
        tier: 'frontier-cloud',
        provider: 'anthropic',
        pricing: { fallback_cost_per_1m: 15.0 },
      }),
      makeModel({
        id: 'claude-haiku',
        tier: 'economical-cloud',
        provider: 'anthropic',
        pricing: { fallback_cost_per_1m: 1.0 },
      }),
    ];
    const pinner = new SessionPinner();
    const pipeline = new RouterPipeline(anthropicOnly, { sessionPinner: pinner });

    const decision = await pipeline.route(
      makeRequest({ force_model_id: 'claude-opus' }),
    );

    expect(decision.selected_model_id).toBe('claude-opus');
    expect(decision.pin_reason).toBe('user_forced');
    expect(decision.reason_code).not.toBe(FORCE_REJECTED_NOT_IN_FLEET);
    expect(decision.reason_code).not.toBe(FORCE_REJECTED_UNHEALTHY);
  });

  it('missing force id fails closed (no crash) on an Anthropic-only fleet', async () => {
    const anthropicOnly: readonly ModelProfile[] = [
      makeModel({
        id: 'claude-haiku',
        tier: 'economical-cloud',
        provider: 'anthropic',
        pricing: { fallback_cost_per_1m: 1.0 },
      }),
    ];
    const pinner = new SessionPinner();
    const pipeline = new RouterPipeline(anthropicOnly, { sessionPinner: pinner });

    const decision = await pipeline.route(
      makeRequest({ force_model_id: 'claude-opus-not-in-fleet' }),
    );

    // Fail closed with explicit reason, degrade to the only healthy model.
    expect(decision.reason_code).toBe(FORCE_REJECTED_NOT_IN_FLEET);
    expect(decision.selected_model_id).toBe('claude-haiku');
  });
});
