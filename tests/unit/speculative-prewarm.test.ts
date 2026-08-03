import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SPECULATIVE_PREWARM_CONFIG,
  PREWARM_DEADLINE_EXCEEDED,
  PREWARM_DISABLED_LOW_ACCEPTANCE,
  PREWARM_ERROR,
  PREWARM_NOT_ATTEMPTED,
  PREWARM_NOT_WARM,
  PREWARM_WARM,
  SpeculativePrewarmGuard,
  type PrewarmDeps,
} from '../../src/domain/routing/speculative-prewarm.js';
import { DEFAULT_OPERATOR_CONFIG } from '../../src/config/defaults.js';
import type { SpeculativePrewarmConfig } from '../../src/domain/types/schemas.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type { HttpFetchPort } from '../../src/infrastructure/local/local-zero-tier.js';
import type { SystemInfo } from '../../src/infrastructure/hardware/hardware-probe.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import type {
  ModelProfile,
  RoutingDecision,
  RoutingRequest,
} from '../../src/domain/types/index.js';
import { createDefaultPSuccessWeights } from '../../src/domain/routing/p-success-classifier.js';

/**
 * SP-217 / #117 — Speculative prewarm with acceptance guard (Colibri PILOT
 * pattern). Default off; hard deadline fail-open; adaptive session disable.
 * Pre-generation only: warm probes never wait on generated tokens.
 */

function makeConfig(overrides?: Partial<SpeculativePrewarmConfig>): SpeculativePrewarmConfig {
  return { ...DEFAULT_SPECULATIVE_PREWARM_CONFIG, ...overrides };
}

/** Controlled timer set: tests drive deadline firing manually or via real timers. */
function makeManualTimers(): {
  deps: PrewarmDeps;
  fireAll: () => void;
  pendingCount: () => number;
} {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  const deps: PrewarmDeps = {
    now: () => Date.now(),
    setTimeoutFn: (cb) => {
      const id = nextId++;
      pending.set(id, cb);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (handle) => {
      pending.delete(handle as unknown as number);
    },
  };
  return {
    deps,
    fireAll: () => {
      for (const cb of [...pending.values()]) cb();
      pending.clear();
    },
    pendingCount: () => pending.size,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('SP-217 / #117 — speculative prewarm guard', () => {
  describe('default-off behavior', () => {
    it('ships disabled by default in operator config', () => {
      expect(DEFAULT_OPERATOR_CONFIG.speculative_prewarm?.enabled).toBe(false);
      expect(DEFAULT_SPECULATIVE_PREWARM_CONFIG.enabled).toBe(false);
    });

    it('does not attempt when config is default (off)', async () => {
      const guard = new SpeculativePrewarmGuard();
      const warm = vi.fn(async () => true);

      expect(guard.isEnabled()).toBe(false);
      expect(guard.shouldAttempt('sess-1')).toBe(false);

      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);

      expect(outcome).toEqual(PREWARM_NOT_ATTEMPTED);
      expect(warm).not.toHaveBeenCalled();
    });

    it('does not attempt when explicitly disabled', async () => {
      const guard = new SpeculativePrewarmGuard(makeConfig({ enabled: false }));
      const warm = vi.fn(async () => true);

      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);

      expect(outcome.attempted).toBe(false);
      expect(outcome.accepted).toBeNull();
      expect(warm).not.toHaveBeenCalled();
    });
  });

  describe('hard deadline (fail open, no hang)', () => {
    it('cancels and resolves when the warm probe exceeds the deadline', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 20 }),
      );
      let observedAbort = false;
      const warm = vi.fn(
        (signal: AbortSignal) =>
          new Promise<boolean>((resolve) => {
            signal.addEventListener('abort', () => {
              observedAbort = true;
            });
            // Artificial delay far beyond the budget; resolves late.
            setTimeout(() => resolve(true), 500);
          }),
      );

      const start = Date.now();
      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);
      const elapsed = Date.now() - start;

      expect(outcome.attempted).toBe(true);
      expect(outcome.accepted).toBe(false);
      expect(outcome.reason).toBe(PREWARM_DEADLINE_EXCEEDED);
      expect(observedAbort).toBe(true);
      // No hang: resolves near the deadline, not the 500ms warm delay.
      expect(elapsed).toBeLessThan(200);
    });

    it('fires the injected timer on deadline (manual clock)', async () => {
      const timers = makeManualTimers();
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 50 }),
        timers.deps,
      );
      const warm = vi.fn(() => new Promise<boolean>(() => {})); // never resolves

      const attemptPromise = guard.attempt('sess-1', 'local_runtime', warm);
      // Let the warm promise start, then fire the deadline.
      await Promise.resolve();
      expect(timers.pendingCount()).toBe(1);
      timers.fireAll();

      const outcome = await attemptPromise;
      expect(outcome.accepted).toBe(false);
      expect(outcome.reason).toBe(PREWARM_DEADLINE_EXCEEDED);
    });

    it('accepts a warm probe that resolves within the deadline', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 100 }),
      );
      const warm = vi.fn(async () => {
        await delay(5);
        return true;
      });

      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);

      expect(outcome.attempted).toBe(true);
      expect(outcome.accepted).toBe(true);
      expect(outcome.reason).toBe(PREWARM_WARM);
      expect(outcome.elapsed_ms).not.toBeNull();
    });

    it('records a miss when the probe completes but the target is not warm', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 100 }),
      );

      const outcome = await guard.attempt('sess-1', 'local_runtime', async () => false);

      expect(outcome.attempted).toBe(true);
      expect(outcome.accepted).toBe(false);
      expect(outcome.reason).toBe(PREWARM_NOT_WARM);
    });

    it('fails open when the warm probe throws', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({ enabled: true, deadline_ms: 100 }),
      );

      const outcome = await guard.attempt('sess-1', 'encoder', async () => {
        throw new Error('encoder load failed');
      });

      expect(outcome.attempted).toBe(true);
      expect(outcome.accepted).toBe(false);
      expect(outcome.target).toBe('encoder');
      expect(outcome.reason).toBe(PREWARM_ERROR);
    });
  });

  describe('adaptive acceptance guard', () => {
    it('disables prewarm for the session after sustained low acceptance', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({
          enabled: true,
          deadline_ms: 100,
          min_acceptance_rate: 0.5,
          min_attempts_before_guard: 4,
        }),
      );

      // 1 accepted, 3 rejected → 25% acceptance over 4 attempts (< 50%).
      await guard.attempt('sess-1', 'local_runtime', async () => true);
      await guard.attempt('sess-1', 'local_runtime', async () => false);
      await guard.attempt('sess-1', 'local_runtime', async () => false);
      expect(guard.shouldAttempt('sess-1')).toBe(true);
      await guard.attempt('sess-1', 'local_runtime', async () => false);

      expect(guard.shouldAttempt('sess-1')).toBe(false);
      expect(guard.disabledReason('sess-1')).toBe(PREWARM_DISABLED_LOW_ACCEPTANCE);

      // Subsequent attempts are gated off — warm is never called again.
      const warm = vi.fn(async () => true);
      const outcome = await guard.attempt('sess-1', 'local_runtime', warm);
      expect(outcome.attempted).toBe(false);
      expect(outcome.accepted).toBeNull();
      expect(outcome.reason).toBe(PREWARM_DISABLED_LOW_ACCEPTANCE);
      expect(warm).not.toHaveBeenCalled();
    });

    it('counts deadline misses toward the acceptance guard', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({
          enabled: true,
          deadline_ms: 10,
          min_acceptance_rate: 0.5,
          min_attempts_before_guard: 3,
        }),
      );
      const slowWarm = () =>
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 300));

      await guard.attempt('sess-1', 'local_runtime', slowWarm);
      await guard.attempt('sess-1', 'local_runtime', slowWarm);
      await guard.attempt('sess-1', 'local_runtime', slowWarm);

      expect(guard.disabledReason('sess-1')).toBe(PREWARM_DISABLED_LOW_ACCEPTANCE);
    });

    it('keeps prewarm enabled while acceptance stays at or above the guard band', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({
          enabled: true,
          deadline_ms: 100,
          min_acceptance_rate: 0.5,
          min_attempts_before_guard: 4,
        }),
      );

      await guard.attempt('sess-1', 'local_runtime', async () => true);
      await guard.attempt('sess-1', 'local_runtime', async () => true);
      await guard.attempt('sess-1', 'local_runtime', async () => false);
      await guard.attempt('sess-1', 'local_runtime', async () => true);

      expect(guard.shouldAttempt('sess-1')).toBe(true);
      expect(guard.disabledReason('sess-1')).toBeNull();
      const stats = guard.sessionStats('sess-1');
      expect(stats.attempts).toBe(4);
      expect(stats.accepted).toBe(3);
      expect(stats.acceptance_rate).toBe(0.75);
    });

    it('tracks the guard per session, not globally', async () => {
      const guard = new SpeculativePrewarmGuard(
        makeConfig({
          enabled: true,
          deadline_ms: 100,
          min_acceptance_rate: 0.5,
          min_attempts_before_guard: 2,
        }),
      );

      await guard.attempt('sess-bad', 'local_runtime', async () => false);
      await guard.attempt('sess-bad', 'local_runtime', async () => false);

      expect(guard.shouldAttempt('sess-bad')).toBe(false);
      expect(guard.shouldAttempt('sess-good')).toBe(true);

      const outcome = await guard.attempt('sess-good', 'local_runtime', async () => true);
      expect(outcome.accepted).toBe(true);
      expect(guard.shouldAttempt('sess-good')).toBe(true);
    });
  });
});

// ─── Pipeline integration (SP-217 Step 2) ────────────────────────────────────

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

const READY_FETCH: HttpFetchPort = {
  fetch: vi.fn(async (url: string) => {
    if (url.includes('/v1/models')) {
      return { ok: true, json: async () => ({ data: [{ id: 'qwen2.5-coder-7b' }] }) };
    }
    throw new Error('ECONNREFUSED');
  }),
};

/** Slow fetch: responds after `delayMs` — exercises the hard deadline. */
function makeSlowFetch(delayMs: number): HttpFetchPort {
  return {
    fetch: vi.fn(async (url: string) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (url.includes('/v1/models')) {
        return { ok: true, json: async () => ({ data: [{ id: 'qwen2.5-coder-7b' }] }) };
      }
      throw new Error('ECONNREFUSED');
    }),
  };
}

function makeSystemInfo(): SystemInfo {
  return {
    totalMemoryGb: 32,
    arch: 'arm64',
    platform: 'darwin',
    batteryLevel: 90,
    isOnAcPower: true,
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

function makeFleet(): ModelProfile[] {
  return [
    makeModel({ id: 'local-qwen-coder', tier: 'zero-tier' }),
    makeModel({ id: 'claude-haiku', tier: 'economical-cloud', provider: 'anthropic' }),
    makeModel({ id: 'claude-opus', tier: 'frontier-cloud', provider: 'anthropic' }),
  ];
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: '00000000-0000-0000-0000-000000000217',
    session_id: 'sess-prewarm',
    prompt_text: 'Fix the typo in the README',
    ...overrides,
  };
}

interface PrewarmPipelineOptions {
  readonly fetchPort?: HttpFetchPort;
  readonly prewarmConfig?: SpeculativePrewarmConfig;
  readonly prewarmGuard?: SpeculativePrewarmGuard;
}

function makePipeline(opts: PrewarmPipelineOptions = {}): RouterPipeline {
  return new RouterPipeline(makeFleet(), {
    hardwareConfig: HARDWARE_CONFIG,
    localConfig: LOCAL_TEST_CONFIG,
    systemInfoProvider: () => Promise.resolve(makeSystemInfo()),
    httpFetchPort: opts.fetchPort ?? READY_FETCH,
    // Structural-hint path: deterministic local lean for a trivial prompt.
    pSuccessWeights: createDefaultPSuccessWeights(),
    ...(opts.prewarmConfig !== undefined ? { prewarmConfig: opts.prewarmConfig } : {}),
    ...(opts.prewarmGuard !== undefined ? { prewarmGuard: opts.prewarmGuard } : {}),
  });
}

describe('SP-217 / #117 — pipeline prewarm wiring', () => {
  it('attempts no prewarm by default (config off) and routes normally', async () => {
    const pipeline = makePipeline();
    const decision = await pipeline.route(makeRequest());

    expect(decision.stage).toBe('local_zero');
    expect(decision.tier).toBe('zero-tier');
    expect(decision.features?.prewarm_attempted ?? null).toBeNull();
    expect(decision.features?.prewarm_accepted ?? null).toBeNull();
  });

  it('reuses the warm readiness probe when prewarm is accepted', async () => {
    const fetchPort = READY_FETCH;
    const pipeline = makePipeline({
      fetchPort,
      prewarmConfig: makeConfig({ enabled: true, deadline_ms: 500 }),
    });

    const decision = await pipeline.route(makeRequest());

    expect(decision.stage).toBe('local_zero');
    expect(decision.reason_code).toBe('local_model_ready');
    expect(decision.features?.prewarm_attempted).toBe(true);
    expect(decision.features?.prewarm_accepted).toBe(true);
    expect(decision.features?.prewarm_disabled_reason ?? null).toBeNull();
  });

  it('fails open on deadline: cancels the prewarm and still routes without hanging', async () => {
    const pipeline = makePipeline({
      fetchPort: makeSlowFetch(150),
      prewarmConfig: makeConfig({ enabled: true, deadline_ms: 10 }),
    });

    const start = Date.now();
    const decision = await pipeline.route(makeRequest());
    const elapsed = Date.now() - start;

    // Normal route still completes via the fallback readiness probe.
    expect(decision.stage).toBe('local_zero');
    expect(decision.tier).toBe('zero-tier');
    expect(decision.features?.prewarm_attempted).toBe(true);
    expect(decision.features?.prewarm_accepted).toBe(false);
    expect(elapsed).toBeLessThan(2000);
  });

  it('surfaces the disabled reason once the acceptance guard has tripped', async () => {
    const guard = new SpeculativePrewarmGuard(
      makeConfig({
        enabled: true,
        deadline_ms: 100,
        min_acceptance_rate: 0.5,
        min_attempts_before_guard: 2,
      }),
    );
    // Pre-trip the guard for this session: sustained low acceptance.
    await guard.attempt('sess-prewarm', 'local_runtime', async () => false);
    await guard.attempt('sess-prewarm', 'local_runtime', async () => false);
    expect(guard.shouldAttempt('sess-prewarm')).toBe(false);

    const pipeline = makePipeline({ prewarmGuard: guard });
    const decision = await pipeline.route(makeRequest());

    // Prewarm gated off, but the normal route still dispatches local.
    expect(decision.stage).toBe('local_zero');
    expect(decision.features?.prewarm_attempted).toBe(false);
    expect(decision.features?.prewarm_accepted).toBeNull();
    expect(decision.features?.prewarm_disabled_reason).toBe(
      PREWARM_DISABLED_LOW_ACCEPTANCE,
    );
  });
});

describe('SP-217 / #117 — telemetry fields', () => {
  function makeDecision(features?: RoutingDecision['features']): RoutingDecision {
    return {
      request_id: 'req-1',
      selected_model_id: 'local-qwen-coder',
      tier: 'zero-tier',
      stage: 'local_zero',
      reason_code: 'local_model_ready',
      routing_latency_ms: 3,
      pin_reason: null,
      ...(features !== undefined ? { features } : {}),
    };
  }

  it('emits prewarm fields from the decision feature sidecar', () => {
    const emitter = new RoutingTelemetryEmitter();
    const record = emitter.emit(
      makeRequest(),
      makeDecision({
        triage: null,
        requirements: null,
        candidates: null,
        tier_hint: null,
        tier_hint_reason_code: null,
        low_intensity_score: null,
        p_success_cheap: null,
        p_success_raw: null,
        p_success_calibrated: null,
        p_success_alpha: null,
        local_eligible_reason: null,
        prewarm_attempted: true,
        prewarm_accepted: true,
        prewarm_disabled_reason: null,
      }),
    );

    expect(record.prewarm_attempted).toBe(true);
    expect(record.prewarm_accepted).toBe(true);
    expect(record.prewarm_disabled_reason).toBeNull();
  });

  it('defaults prewarm fields when the sidecar omits them', () => {
    const emitter = new RoutingTelemetryEmitter();
    const record = emitter.emit(makeRequest(), makeDecision());

    expect(record.prewarm_attempted).toBe(false);
    expect(record.prewarm_accepted).toBeNull();
    expect(record.prewarm_disabled_reason).toBeNull();
  });

  it('carries the disabled reason end-to-end through the emitter', () => {
    const emitter = new RoutingTelemetryEmitter();
    const record = emitter.emit(
      makeRequest(),
      makeDecision({
        triage: null,
        requirements: null,
        candidates: null,
        tier_hint: null,
        tier_hint_reason_code: null,
        low_intensity_score: null,
        p_success_cheap: null,
        p_success_raw: null,
        p_success_calibrated: null,
        p_success_alpha: null,
        local_eligible_reason: null,
        prewarm_attempted: false,
        prewarm_accepted: null,
        prewarm_disabled_reason: PREWARM_DISABLED_LOW_ACCEPTANCE,
      }),
    );

    expect(record.prewarm_attempted).toBe(false);
    expect(record.prewarm_disabled_reason).toBe(PREWARM_DISABLED_LOW_ACCEPTANCE);
  });
});
