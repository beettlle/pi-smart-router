/**
 * typed_judgment stage tests (SP-307, GitHub #187 / epic #183).
 *
 * Covers: skip reason codes (disabled / tool_result / acknowledgement /
 * force_model), fail-open behavior on timeout / error / abort / malformed
 * answers, success populating RoutingContext, tool_result turns never
 * invoking the port, error redaction (no prompt text in logs), and
 * pipeline-level byte-identical decisions when disabled.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TYPED_JUDGMENT_QUESTIONS,
  type TypedJudgment,
} from '../../src/domain/judgment/index.js';
import { createRoutingContext } from '../../src/domain/pipeline/pipeline-stage.js';
import {
  PIPELINE_STAGE_ORDER,
  RouterPipeline,
} from '../../src/domain/pipeline/router-pipeline.js';
import {
  createTypedJudgmentStage,
  TYPED_JUDGMENT_ACKNOWLEDGEMENT,
  TYPED_JUDGMENT_DISABLED,
  TYPED_JUDGMENT_ERROR,
  TYPED_JUDGMENT_FORCE_MODEL,
  TYPED_JUDGMENT_TIMEOUT,
  TYPED_JUDGMENT_TOOL_RESULT,
} from '../../src/domain/pipeline/typed-judgment-stage.js';
import {
  TypedJudgmentError,
  type TypedJudgmentAnswers,
  type TypedJudgmentJudgeOptions,
  type TypedJudgmentPort,
  type TypedJudgmentQuestion,
} from '../../src/domain/ports/typed-judgment-port.js';
import {
  DEFAULT_TYPED_JUDGMENT_CONFIG,
  type TypedJudgmentConfig,
} from '../../src/domain/types/schemas.js';
import type { RoutingRequest } from '../../src/domain/types/index.js';
import { fleet, makeRequest } from './router-pipeline-fixtures.js';

// ─── Fakes ───────────────────────────────────────────────────────────────────

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

interface JudgeCall {
  state: string;
  questions: readonly TypedJudgmentQuestion[];
  options: TypedJudgmentJudgeOptions;
}

type JudgeHandler = (
  state: string,
  questions: readonly TypedJudgmentQuestion[],
  options: TypedJudgmentJudgeOptions,
) => Promise<TypedJudgmentAnswers>;

function makeFakePort(handler?: JudgeHandler): {
  port: TypedJudgmentPort;
  calls: JudgeCall[];
} {
  const calls: JudgeCall[] = [];
  const port: TypedJudgmentPort = {
    judge(state, questions, options) {
      calls.push({ state, questions, options });
      return handler
        ? handler(state, questions, options)
        : Promise.resolve(VALID_ANSWERS);
    },
  };
  return { port, calls };
}

function enabledConfig(
  overrides?: Partial<TypedJudgmentConfig>,
): TypedJudgmentConfig {
  return { ...DEFAULT_TYPED_JUDGMENT_CONFIG, enabled: true, ...overrides };
}

function makeContext(
  request: RoutingRequest,
  options: ConstructorParameters<typeof RouterPipeline>[1] = {},
) {
  return createRoutingContext({ request, options, fleet });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Skip reasons ────────────────────────────────────────────────────────────

describe('typed_judgment stage — skip reasons', () => {
  it('skips with typed_judgment_disabled when no port is wired', async () => {
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), {
      typedJudgmentConfig: enabledConfig(),
    });

    const result = await stage.run(context);

    expect(result).toEqual({ decided: false, stage: 'typed_judgment' });
    expect(context.typedJudgment).toBeNull();
    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_DISABLED);
    expect(context.typedJudgmentLatencyMs).toBeNull();
  });

  it('skips with typed_judgment_disabled when no config is wired', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), { typedJudgmentPort: port });

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_DISABLED);
    expect(calls).toHaveLength(0);
  });

  it('skips with typed_judgment_disabled when enabled is false', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), {
      typedJudgmentPort: port,
      typedJudgmentConfig: { ...DEFAULT_TYPED_JUDGMENT_CONFIG },
    });

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_DISABLED);
    expect(calls).toHaveLength(0);
  });

  it('skips tool_result turns (explicit turn_type) without calling the port', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest({ turn_type: 'tool_result' }), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_TOOL_RESULT);
    expect(context.typedJudgment).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('skips tool_result turns (classified from messages) without calling the port', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const context = makeContext(
      makeRequest({
        messages: [
          { role: 'user', content: 'run the tests' },
          { role: 'tool', content: '3 passed' },
        ],
      }),
      { typedJudgmentPort: port, typedJudgmentConfig: enabledConfig() },
    );

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_TOOL_RESULT);
    expect(calls).toHaveLength(0);
  });

  it('skips acknowledgement turns via SP-306 isAcknowledgement', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest({ prompt_text: 'thanks!' }), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBe(
      TYPED_JUDGMENT_ACKNOWLEDGEMENT,
    );
    expect(calls).toHaveLength(0);
  });

  it('does not treat deep-session continuations as acknowledgements (#179)', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: 'user' as const,
      content: `message ${i}`,
    }));
    const context = makeContext(
      makeRequest({ prompt_text: 'continue', messages }),
      { typedJudgmentPort: port, typedJudgmentConfig: enabledConfig() },
    );

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('skips with typed_judgment_force_model when force_model_id is set', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const context = makeContext(
      makeRequest({ force_model_id: 'gpt-4o-mini' }),
      { typedJudgmentPort: port, typedJudgmentConfig: enabledConfig() },
    );

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_FORCE_MODEL);
    expect(calls).toHaveLength(0);
  });
});

// ─── Success path ────────────────────────────────────────────────────────────

describe('typed_judgment stage — success', () => {
  it('populates context.typedJudgment via mapTypedJudgment and never decides', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });

    const result = await stage.run(context);

    expect(result).toEqual({ decided: false, stage: 'typed_judgment' });
    expect(calls).toHaveLength(1);

    const judgment = context.typedJudgment as TypedJudgment;
    expect(judgment.taskKind).toBe('implement');
    expect(judgment.taskKindConfidence).toBe(0.8);
    expect(judgment.capabilityDeserved).toBe(1);
    expect(judgment.deepReasoningP).toBe(0.7);
    expect(judgment.codeGen).toBe(0);
    expect(judgment.toolUse).toBeCloseTo(2 / 3);
    expect(judgment.destructiveP).toBe(0.1);

    expect(context.typedJudgmentSkipReason).toBeNull();
    expect(context.typedJudgmentLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('passes buildJudgeState output, the SP-306 question set, and an AbortSignal', async () => {
    const { port, calls } = makeFakePort();
    const stage = createTypedJudgmentStage();
    const context = makeContext(
      makeRequest({ prompt_text: 'Refactor the auth module' }),
      { typedJudgmentPort: port, typedJudgmentConfig: enabledConfig() },
    );

    await stage.run(context);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    const state = JSON.parse(call.state) as Record<string, unknown>;
    expect(state['latest_user_message']).toBe('Refactor the auth module');
    expect(call.questions).toBe(TYPED_JUDGMENT_QUESTIONS);
    expect(call.options.signal).toBeInstanceOf(AbortSignal);
    expect(call.options.signal.aborted).toBe(false);
  });

  it('maps partial answers with null fields and no skip reason', async () => {
    const { port } = makeFakePort(() =>
      Promise.resolve({ destructive: { kind: 'noul', noul: 0.4 } }),
    );
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBeNull();
    expect(context.typedJudgment?.taskKind).toBeNull();
    expect(context.typedJudgment?.capabilityDeserved).toBeNull();
    expect(context.typedJudgment?.destructiveP).toBe(0.4);
  });
});

// ─── Fail-open paths ─────────────────────────────────────────────────────────

describe('typed_judgment stage — fail open', () => {
  it('maps judge timeout (abort) to typed_judgment_timeout with null judgment', async () => {
    const { port } = makeFakePort(
      (_state, _questions, { signal }) =>
        new Promise<TypedJudgmentAnswers>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new TypedJudgmentError('aborted', 'judge aborted'));
          });
        }),
    );
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig({ timeout_ms: 25 }),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await stage.run(context);

    expect(result).toEqual({ decided: false, stage: 'typed_judgment' });
    expect(context.typedJudgment).toBeNull();
    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_TIMEOUT);
    expect(context.typedJudgmentLatencyMs).toBeGreaterThanOrEqual(25);
  });

  it('maps a TypedJudgmentError timeout rejection to typed_judgment_timeout', async () => {
    const { port } = makeFakePort(() =>
      Promise.reject(new TypedJudgmentError('timeout', 'deadline exceeded')),
    );
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await stage.run(context);

    expect(context.typedJudgment).toBeNull();
    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_TIMEOUT);
  });

  it('maps generic port failures to typed_judgment_error and stays fail-open', async () => {
    const { port } = makeFakePort(() =>
      Promise.reject(new Error('connection refused')),
    );
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await stage.run(context);

    expect(result).toEqual({ decided: false, stage: 'typed_judgment' });
    expect(context.typedJudgment).toBeNull();
    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_ERROR);
    expect(context.typedJudgmentLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('maps malformed answers (mapper rejection) to typed_judgment_error', async () => {
    const { port } = makeFakePort(() =>
      Promise.resolve({
        task_kind: {
          kind: 'choice',
          choice: 'not-a-real-kind',
          probabilities: {},
          confidence: 0.5,
        },
      }),
    );
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest(), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await stage.run(context);

    expect(context.typedJudgment).toBeNull();
    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_ERROR);
  });

  it('redacts prompt text from logged errors', async () => {
    const secretPrompt = 'refactor the sk_live_SECRETKEY handler';
    const { port } = makeFakePort(() =>
      Promise.reject(new Error(`judge exploded on: ${secretPrompt}`)),
    );
    const stage = createTypedJudgmentStage();
    const context = makeContext(makeRequest({ prompt_text: secretPrompt }), {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await stage.run(context);

    expect(context.typedJudgmentSkipReason).toBe(TYPED_JUDGMENT_ERROR);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(secretPrompt);
    expect(logged).toContain('[REDACTED]');
  });
});

// ─── Pipeline integration ────────────────────────────────────────────────────

describe('typed_judgment stage — pipeline integration', () => {
  it('never decides even with a successful judgment (fallback still reached)', async () => {
    const { port, calls } = makeFakePort();
    const pipeline = new RouterPipeline(fleet, {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });

    const decision = await pipeline.route(makeRequest());

    expect(calls).toHaveLength(1);
    expect(decision.stage).toBe('fallback');
    expect(decision.reason_code).toBe('safe_cloud_default');
  });

  it('produces byte-identical decisions when disabled (no port / enabled: false)', async () => {
    const request = makeRequest({
      request_id: '22222222-2222-2222-2222-222222222222',
    });
    const baseline = await new RouterPipeline(fleet).route(request);

    const { port, calls } = makeFakePort();
    const disabled = await new RouterPipeline(fleet, {
      typedJudgmentPort: port,
      typedJudgmentConfig: { ...DEFAULT_TYPED_JUDGMENT_CONFIG },
    }).route(request);

    expect(calls).toHaveLength(0);
    expect({ ...disabled, routing_latency_ms: 0 }).toEqual({
      ...baseline,
      routing_latency_ms: 0,
    });
  });

  it('produces byte-identical decisions when enabled (non-deciding stage)', async () => {
    const request = makeRequest({
      request_id: '33333333-3333-3333-3333-333333333333',
    });
    const baseline = await new RouterPipeline(fleet).route(request);

    const { port } = makeFakePort();
    const enabled = await new RouterPipeline(fleet, {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    }).route(request);

    // SP-308: the enabled path intentionally carries the typed_judgment
    // feature sidecar; strip it to compare the routing-decision payload.
    expect(enabled.features?.typed_judgment).toBeDefined();
    const enabledFeatures = { ...enabled.features };
    delete enabledFeatures.typed_judgment;
    expect({
      ...enabled,
      features: enabledFeatures,
      routing_latency_ms: 0,
    }).toEqual({
      ...baseline,
      routing_latency_ms: 0,
    });
  });

  it('never calls the port on tool_result turns routed end-to-end', async () => {
    const { port, calls } = makeFakePort();
    const pipeline = new RouterPipeline(fleet, {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });

    await pipeline.route(makeRequest({ turn_type: 'tool_result' }));

    expect(calls).toHaveLength(0);
  });

  it('fails open end-to-end when the judge is down', async () => {
    const { port } = makeFakePort(() =>
      Promise.reject(new Error('judge unreachable')),
    );
    const pipeline = new RouterPipeline(fleet, {
      typedJudgmentPort: port,
      typedJudgmentConfig: enabledConfig(),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const decision = await pipeline.route(makeRequest());

    expect(decision.stage).toBe('fallback');
    expect(decision.reason_code).toBe('safe_cloud_default');
  });
});

// ─── Stage order ─────────────────────────────────────────────────────────────

describe('typed_judgment stage — order (SP-119 rule)', () => {
  it('sits directly after turn_envelope and before context_fit', () => {
    const order = [...PIPELINE_STAGE_ORDER];
    expect(order.indexOf('typed_judgment')).toBe(
      order.indexOf('turn_envelope') + 1,
    );
    expect(order.indexOf('typed_judgment')).toBe(
      order.indexOf('context_fit') - 1,
    );
  });
});
