import { describe, expect, it, vi } from 'vitest';

import {
  RouterPipeline,
  resolveLocalEligible,
} from '../../src/domain/pipeline/router-pipeline.js';
import type { HttpFetchPort } from '../../src/infrastructure/local/local-zero-tier.js';
import type { SystemInfo } from '../../src/infrastructure/hardware/hardware-probe.js';
import type { ThroughputMeter } from '../../src/infrastructure/hardware/throughput-meter.js';
import { THROUGHPUT_BELOW_THRESHOLD } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import type { ModelProfile, RoutingRequest } from '../../src/domain/types/index.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import { createDefaultPSuccessWeights } from '../../src/domain/routing/p-success-classifier.js';

/**
 * SP-211 / #123 — Prefer Healthy local_zero on Trivial Turns.
 *
 * Inverse of closed #97 (SP-176): agentic cleanup / destructive prompts must NOT
 * be forced to zero-tier. This suite proves the inverse — trivial / no-tool turns
 * PREFER local_zero when a healthy local model is ready — using a counterfactual
 * fleet (local zero-tier + Anthropic-class economical + frontier) across trivial
 * vs agentic prompts. Deterministic and testable.
 */

/** Pre-SP-175 structural weights: isolate the eligibility path from shipped dogfood bias. */
const UNTRAINED_P_SUCCESS_WEIGHTS = createDefaultPSuccessWeights();

const HARDWARE_CONFIG = {
  min_memory_gb_full: 16,
  min_memory_gb_classification: 8,
  battery_threshold_pct: 20,
} as const;

const LOCAL_TEST_CONFIG = {
  lmStudioBaseUrl: 'http://127.0.0.1:1234',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  pingTimeoutMs: 500,
} as const;

/** Ready fetch: LM Studio reports a loaded model (anyModelReady true). */
const READY_FETCH: HttpFetchPort = {
  fetch: vi.fn(async (url: string) => {
    if (url.includes('/v1/models')) {
      return { ok: true, json: async () => ({ data: [{ id: 'qwen2.5-coder-7b' }] }) };
    }
    throw new Error('ECONNREFUSED');
  }),
};

/** Unreachable fetch: no local service responds (anyModelReady false). */
const UNREACHABLE_FETCH: HttpFetchPort = {
  fetch: vi.fn(async () => {
    throw new Error('ECONNREFUSED');
  }),
};

function makeSystemInfo(overrides?: Partial<SystemInfo>): SystemInfo {
  return {
    totalMemoryGb: 32,
    arch: 'arm64',
    platform: 'darwin',
    batteryLevel: 90,
    isOnAcPower: true,
    ...overrides,
  };
}

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
    request_id: '00000000-0000-0000-0000-000000000001',
    session_id: 'sess-1',
    prompt_text: 'Fix the typo',
    ...overrides,
  };
}

/**
 * Counterfactual fleet (SP-211, #123): healthy local zero-tier + Anthropic-class
 * economical + frontier. Mirrors the release-v0.13.0 manifest dogfood topology so
 * the trivial-vs-agentic split is exercised against a realistic tier spread.
 */
function makeCounterfactualFleet(): ModelProfile[] {
  return [
    makeModel({ id: 'local-qwen-coder', tier: 'zero-tier' }),
    makeModel({ id: 'claude-haiku', tier: 'economical-cloud', provider: 'anthropic' }),
    makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
  ];
}

function makeThroughputMeter(aboveThreshold: boolean): ThroughputMeter {
  return {
    recordSample: vi.fn(),
    getMedianTps: vi.fn(() => (aboveThreshold ? 30 : 10)),
    isAboveThreshold: vi.fn(() => aboveThreshold),
    getSampleCount: vi.fn(() => 1),
    clear: vi.fn(),
  };
}

interface HealthyLocalOptions {
  readonly trainedWeights?: boolean;
  readonly fetchPort?: HttpFetchPort;
  readonly throughputMeter?: ThroughputMeter;
  readonly fleet?: ModelProfile[];
}

function makeHealthyLocalPipeline(opts: HealthyLocalOptions = {}): RouterPipeline {
  return new RouterPipeline(opts.fleet ?? makeCounterfactualFleet(), {
    hardwareConfig: HARDWARE_CONFIG,
    localConfig: LOCAL_TEST_CONFIG,
    systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
    httpFetchPort: opts.fetchPort ?? READY_FETCH,
    // Default: load shipped trained weights (production expected-cost path that
    // previously routed no-tool prompts to economical). Pass trainedWeights:false
    // to force the structural-hint path.
    ...(opts.trainedWeights === false
      ? { pSuccessWeights: UNTRAINED_P_SUCCESS_WEIGHTS }
      : {}),
    ...(opts.throughputMeter !== undefined
      ? { throughputMeter: opts.throughputMeter }
      : {}),
  });
}

describe('SP-211 / #123 — prefer healthy local_zero on trivial turns', () => {
  describe('counterfactual fleet: trivial vs agentic', () => {
    it('routes a triage-trivial prompt to local_zero with healthy local ready', async () => {
      const pipeline = makeHealthyLocalPipeline();
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Fix the typo in the README' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.selected_model_id).toBe('local-qwen-coder');
      expect(decision.reason_code).toBe('local_model_ready');
    });

    it('routes a no-tool conversational prompt to local_zero even when triage is ambiguous (trained weights)', async () => {
      // Regression anchor: with shipped trained weights the expected-cost tier
      // hint optimizes toward frontier/economical for this prompt, which
      // previously made local_zero INELIGIBLE and dispatched economical-cloud.
      const pipeline = makeHealthyLocalPipeline({ trainedWeights: true });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Say hello in one word.' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
      expect(decision.selected_model_id).toBe('local-qwen-coder');
      expect(decision.reason_code).toBe('local_model_ready');
    });

    it('routes a no-tool conversational prompt to local_zero under the structural-hint path', async () => {
      const pipeline = makeHealthyLocalPipeline({ trainedWeights: false });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Say hello in one word.' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('zero-tier');
    });

    it('does NOT force a #97 repo-cleanup prompt to zero-tier (non-regression)', async () => {
      const pipeline = makeHealthyLocalPipeline();
      const decision = await pipeline.route(
        makeRequest({
          prompt_text: 'Help me clean up mistakenly added files in the repo',
        }),
      );

      expect(decision.tier).not.toBe('zero-tier');
      expect(decision.tier).toBe('frontier-cloud');
      expect(decision.stage).toBe('triage');
    });

    it('does NOT force a #97 destructive prompt to zero-tier (non-regression)', async () => {
      const pipeline = makeHealthyLocalPipeline();
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Run rm -rf to clean the build directory' }),
      );

      expect(decision.tier).not.toBe('zero-tier');
    });
  });

  describe('expected-cost tier hint must not block local_zero preference', () => {
    it('selects local_zero even when the cost-optimized tier hint points at a cloud tier', async () => {
      // With trained weights the hint for this prompt is frontier-cloud, yet the
      // prompt is genuinely trivial/no-tool so local_zero must still win.
      const pipeline = makeHealthyLocalPipeline({ trainedWeights: true });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Say hello in one word.' }),
      );

      // The cost-optimized hint is observable but does not gate eligibility.
      expect(decision.features?.tier_hint).not.toBe('zero-tier');
      expect(decision.tier).toBe('zero-tier');
    });
  });

  describe('local_zero gates still respected (#98 tool-use, #84 tok/s, readiness)', () => {
    it('defers to economical-cloud when throughput is below threshold (#84)', async () => {
      const pipeline = makeHealthyLocalPipeline({
        trainedWeights: false,
        throughputMeter: makeThroughputMeter(false),
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.stage).toBe('local_zero');
      expect(decision.tier).toBe('economical-cloud');
      expect(decision.selected_model_id).toBe('claude-haiku');
      expect(decision.reason_code).toBe(THROUGHPUT_BELOW_THRESHOLD);
    });

    it('still prefers local_zero when throughput is above threshold (#84)', async () => {
      const pipeline = makeHealthyLocalPipeline({
        trainedWeights: false,
        throughputMeter: makeThroughputMeter(true),
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Format this JSON file' }),
      );

      expect(decision.tier).toBe('zero-tier');
      expect(decision.reason_code).toBe('local_model_ready');
    });

    it('defers to cloud when no local model reports ready', async () => {
      const pipeline = makeHealthyLocalPipeline({
        trainedWeights: false,
        fetchPort: UNREACHABLE_FETCH,
      });
      const decision = await pipeline.route(
        makeRequest({ prompt_text: 'Say hello in one word.' }),
      );

      expect(decision.tier).not.toBe('zero-tier');
    });

    it('defers a tool-heavy prompt away from zero-tier via the tool-use gate (#98)', async () => {
      // Multiple agentic cues (git + bash + explore + delete + repo) push the
      // predicted tool-use requirement above the local ceiling even though the
      // prompt is short; local_zero must not dispatch it.
      const pipeline = makeHealthyLocalPipeline({ trainedWeights: false });
      const decision = await pipeline.route(
        makeRequest({
          prompt_text:
            'use git to explore the repo with bash then delete the stale files',
        }),
      );

      expect(decision.tier).not.toBe('zero-tier');
    });
  });

  describe('resolveLocalEligible — SP-211 broadening (unit)', () => {
    const highThreshold = DEFAULT_OPERATOR_CONFIG.low_intensity.high_threshold;

    it('is eligible on a high low-intensity score with an economical tier hint', () => {
      const result = resolveLocalEligible({
        triageVerdict: 'ambiguous',
        tierHint: 'economical-cloud',
        lowIntensityScore: 0.72,
        highThreshold,
        clusterMatch: null,
      });

      expect(result).toEqual({ eligible: true, reason: 'low_intensity_structural' });
    });

    it('is eligible on a high low-intensity score with a frontier tier hint', () => {
      const result = resolveLocalEligible({
        triageVerdict: 'ambiguous',
        tierHint: 'frontier-cloud',
        lowIntensityScore: 0.72,
        highThreshold,
        clusterMatch: null,
      });

      expect(result).toEqual({ eligible: true, reason: 'low_intensity_structural' });
    });

    it('is NOT eligible when the low-intensity score is below the high threshold', () => {
      const result = resolveLocalEligible({
        triageVerdict: 'ambiguous',
        tierHint: 'economical-cloud',
        lowIntensityScore: 0.5,
        highThreshold,
        clusterMatch: null,
      });

      expect(result).toEqual({ eligible: false, reason: null });
    });

    it('is NOT eligible for a complex triage verdict even with a high score (#97 guard)', () => {
      const result = resolveLocalEligible({
        triageVerdict: 'complex',
        tierHint: 'zero-tier',
        lowIntensityScore: 0.9,
        highThreshold,
        clusterMatch: null,
      });

      expect(result).toEqual({ eligible: false, reason: null });
    });

    it('still prefers triage_trivial and cluster reasons over the broadened low-intensity path', () => {
      const trivial = resolveLocalEligible({
        triageVerdict: 'trivial',
        tierHint: 'economical-cloud',
        lowIntensityScore: 0.9,
        highThreshold,
        clusterMatch: null,
      });
      expect(trivial).toEqual({ eligible: true, reason: 'triage_trivial' });
    });
  });
});
