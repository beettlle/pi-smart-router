/**
 * Typed-judgment feature sidecar + composition-root wiring tests (SP-308,
 * GitHub #187 / epic #183).
 *
 * Covers:
 * - judged turns attach the normalized typed_judgment sidecar (mapped signal,
 *   confidences, judge latency) with no prompt/judge-state text;
 * - skipped turns (e.g. tool_result) attach the sidecar with the skip reason
 *   and null answer fields;
 * - disabled/unwired pipelines omit the sidecar key entirely so wire
 *   decisions stay byte-identical;
 * - the composition root (`createDispatchOptions`) binds the SP-305 adapter
 *   from config for loopback endpoints and fails closed with a logged reason
 *   for remote endpoints without an API key.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDispatchOptions,
  createOperatorAwareSessionPinner,
} from '../../.pi/extensions/smart-router/fleet-bootstrap.js';
import { RouterPipeline } from '../../src/domain/pipeline/router-pipeline.js';
import type {
  TypedJudgmentAnswers,
  TypedJudgmentPort,
} from '../../src/domain/ports/typed-judgment-port.js';
import {
  DEFAULT_TYPED_JUDGMENT_CONFIG,
  type TypedJudgmentConfig,
} from '../../src/domain/types/schemas.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import { fleet, makeRequest } from './router-pipeline-fixtures.js';

// ─── Fakes ───────────────────────────────────────────────────────────────────

/** Mirrors VALID_ANSWERS in typed-judgment-stage.test.ts (SP-307). */
const VALID_ANSWERS: TypedJudgmentAnswers = {
  task_kind: {
    kind: 'choice',
    choice: 'implement',
    probabilities: { implement: 0.8, debug: 0.2 },
    confidence: 0.8,
  },
  capability_deserved: {
    kind: 'score',
    score: 3,
    legend: { '3': 'Maximum' },
    probabilities: { '3': 1 },
    confidence: 0.9,
  },
  needs_deep_reasoning: { kind: 'noul', noul: 0.7 },
  code_gen: {
    kind: 'score',
    score: 0,
    legend: { '0': 'None' },
    probabilities: { '0': 1 },
    confidence: 0.6,
  },
  tool_use: {
    kind: 'score',
    score: 2,
    legend: { '2': 'Moderate' },
    probabilities: { '2': 1 },
    confidence: 0.7,
  },
  destructive: { kind: 'noul', noul: 0.1 },
};

function makeFakePort(answers: TypedJudgmentAnswers = VALID_ANSWERS): {
  port: TypedJudgmentPort;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const port: TypedJudgmentPort = {
    judge(state, questions, options) {
      calls.push({ state, questions, options });
      return Promise.resolve(answers);
    },
  };
  return { port, calls };
}

function enabledConfig(
  overrides?: Partial<TypedJudgmentConfig>,
): TypedJudgmentConfig {
  return { ...DEFAULT_TYPED_JUDGMENT_CONFIG, enabled: true, ...overrides };
}

const TYPED_JUDGMENT_ENV_KEYS = [
  'SMART_ROUTER_TYPED_JUDGMENT_ENABLED',
  'SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT',
  'SMART_ROUTER_TYPED_JUDGMENT_MODEL',
  'SMART_ROUTER_TYPED_JUDGMENT_TIMEOUT_MS',
  'SMART_ROUTER_TYPED_JUDGMENT_SAMPLES',
  'SMART_ROUTER_TYPED_JUDGMENT_API_KEY_ENV',
  'SMART_ROUTER_TYPED_JUDGMENT_ALLOW_REMOTE',
  'SMART_ROUTER_TYPED_JUDGMENT_MIN_CONFIDENCE',
  'TYPESAFE_API_KEY',
] as const;

let savedEnv: Record<string, string | undefined> = {};

function saveAndClearTypedJudgmentEnv(): void {
  savedEnv = {};
  for (const key of TYPED_JUDGMENT_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreTypedJudgmentEnv(): void {
  for (const key of TYPED_JUDGMENT_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  savedEnv = {};
}

afterEach(() => {
  restoreTypedJudgmentEnv();
  vi.restoreAllMocks();
});

// ─── Feature sidecar (pipeline level) ────────────────────────────────────────

describe('typed_judgment feature sidecar (SP-308)', () => {
  it('attaches the normalized judgment signal on judged turns, without text fields', async () => {
    const { port } = makeFakePort();
    const pipeline = new RouterPipeline(fleet, {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });
    const decision = await pipeline.route(
      makeRequest({
        prompt_text: 'Refactor the ZQXWV authentication module to async handlers',
      }),
    );

    const sidecar = decision.features?.typed_judgment;
    expect(sidecar).toBeDefined();
    expect(sidecar).toMatchObject({
      task_kind: 'implement',
      task_kind_confidence: 0.8,
      capability_deserved: 1,
      deep_reasoning_p: 0.7,
      code_gen: 0,
      tool_use: 2 / 3,
      destructive_p: 0.1,
      confidences: {
        task_kind: 0.8,
        capability_deserved: 0.9,
        code_gen: 0.6,
        tool_use: 0.7,
      },
      skip_reason: null,
      latency_ms: expect.any(Number),
    });
    // Privacy: no prompt text or judge-state text leaks into the sidecar.
    const serialized = JSON.stringify(decision.features);
    expect(serialized).not.toContain('ZQXWV');
    expect(serialized).not.toContain('Refactor the');
  });

  it('attaches the skip reason with null answers on skipped turns', async () => {
    const { port, calls } = makeFakePort();
    const pipeline = new RouterPipeline(fleet, {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });
    // force_model_id reaches the typed_judgment stage (SP-209 parity: the
    // force is resolved later by session_pin), which skips without judging.
    const decision = await pipeline.route(
      makeRequest({ force_model_id: 'gpt-4o-mini' }),
    );

    expect(calls).toHaveLength(0);
    const sidecar = decision.features?.typed_judgment;
    expect(sidecar).toEqual({
      task_kind: null,
      task_kind_confidence: null,
      capability_deserved: null,
      deep_reasoning_p: null,
      code_gen: null,
      tool_use: null,
      destructive_p: null,
      confidences: {},
      skip_reason: 'typed_judgment_force_model',
      latency_ms: null,
    });
  });

  it('omits the sidecar when disabled, byte-identical to an unwired pipeline', async () => {
    const request = makeRequest({
      request_id: '44444444-4444-4444-4444-444444444444',
    });
    const baseline = await new RouterPipeline(fleet).route(request);

    const { port } = makeFakePort();
    const disabled = await new RouterPipeline(fleet, {
      typedJudgmentPort: port,
      typedJudgmentConfig: { ...DEFAULT_TYPED_JUDGMENT_CONFIG },
    }).route(request);

    expect(disabled.features).toBeDefined();
    expect('typed_judgment' in disabled.features!).toBe(false);
    expect(JSON.stringify(disabled.features)).not.toContain('typed_judgment');
    expect({ ...disabled, routing_latency_ms: 0 }).toEqual({
      ...baseline,
      routing_latency_ms: 0,
    });
  });
});

// ─── Composition-root wiring ─────────────────────────────────────────────────

describe('createDispatchOptions typed-judgment wiring (SP-308)', () => {
  it('leaves the port unbound by default (typed_judgment disabled)', () => {
    saveAndClearTypedJudgmentEnv();
    const store = new MemoryStore([]);
    const pinner = createOperatorAwareSessionPinner(store);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const options = createDispatchOptions(store, pinner);

    expect(options.typedJudgmentConfig?.enabled).toBe(false);
    expect(options.typedJudgmentPort).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('binds the adapter for an enabled loopback endpoint', () => {
    saveAndClearTypedJudgmentEnv();
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENABLED = '1';
    const store = new MemoryStore([]);
    const pinner = createOperatorAwareSessionPinner(store);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const options = createDispatchOptions(store, pinner);

    expect(options.typedJudgmentConfig?.enabled).toBe(true);
    expect(options.typedJudgmentPort).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('fails closed with a logged reason for a remote endpoint without an API key', () => {
    saveAndClearTypedJudgmentEnv();
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENABLED = '1';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT =
      'https://hosted-jev.example.com/v1/systemone';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ALLOW_REMOTE = '1';
    const store = new MemoryStore([]);
    const pinner = createOperatorAwareSessionPinner(store);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const options = createDispatchOptions(store, pinner);

    expect(options.typedJudgmentConfig?.enabled).toBe(true);
    expect(options.typedJudgmentPort).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('typed_judgment'),
      expect.objectContaining({ reason: 'typed_judgment_remote_key_missing' }),
    );
    // Key material (or its absence) is never logged beyond the reason code.
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('TYPESAFE_API_KEY');
  });
});
