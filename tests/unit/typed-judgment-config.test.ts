/**
 * Typed judgment config + port tests (SP-304, #184).
 *
 * Covers: schema defaults (disabled, loopback-only), the fail-closed
 * superRefine on non-loopback endpoints, env overrides (including the
 * fail-closed fallback when an env endpoint override violates the loopback
 * rule), wiring into resolveOperatorConfigFromEnv, and the domain port type
 * surface.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATOR_CONFIG,
  resolveOperatorConfigFromEnv,
} from '../../src/config/defaults.js';
import {
  DEFAULT_TYPED_JUDGMENT_CONFIG,
  OperatorConfigSchema,
  TypedJudgmentConfigSchema,
  resolveTypedJudgmentConfigFromEnv,
} from '../../src/domain/types/schemas.js';
import {
  TypedJudgmentError,
  type TypedJudgmentAnswer,
  type TypedJudgmentAnswers,
  type TypedJudgmentChoiceQuestion,
  type TypedJudgmentNoulQuestion,
  type TypedJudgmentPort,
  type TypedJudgmentQuestion,
  type TypedJudgmentScoreQuestion,
} from '../../src/domain/ports/typed-judgment-port.js';

const ENV_KEYS = [
  'SMART_ROUTER_TYPED_JUDGMENT_ENABLED',
  'SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT',
  'SMART_ROUTER_TYPED_JUDGMENT_MODEL',
  'SMART_ROUTER_TYPED_JUDGMENT_TIMEOUT_MS',
  'SMART_ROUTER_TYPED_JUDGMENT_SAMPLES',
  'SMART_ROUTER_TYPED_JUDGMENT_API_KEY_ENV',
  'SMART_ROUTER_TYPED_JUDGMENT_ALLOW_REMOTE',
  'SMART_ROUTER_TYPED_JUDGMENT_MIN_CONFIDENCE',
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe('TypedJudgmentConfigSchema', () => {
  it('parses {} to documented defaults with enabled: false (#184)', () => {
    const parsed = TypedJudgmentConfigSchema.parse({});
    expect(parsed).toEqual({
      enabled: false,
      endpoint: 'http://127.0.0.1:8080/v1/systemone',
      model: 'openjev-latest',
      timeout_ms: 1500,
      samples: 1,
      api_key_env: 'TYPESAFE_API_KEY',
      allow_remote: false,
      min_confidence: 0.6,
    });
  });

  it('accepts loopback endpoints without allow_remote', () => {
    for (const endpoint of [
      'http://127.0.0.1:8080/v1/systemone',
      'http://localhost:8080/v1/systemone',
      'http://[::1]:8080/v1/systemone',
    ]) {
      const result = TypedJudgmentConfigSchema.safeParse({ endpoint });
      expect(result.success, endpoint).toBe(true);
    }
  });

  it('rejects a non-loopback endpoint without allow_remote (fail closed)', () => {
    const result = TypedJudgmentConfigSchema.safeParse({
      endpoint: 'https://jev.example.com/v1/systemone',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('endpoint'))).toBe(true);
    }
  });

  it('accepts a non-loopback endpoint with allow_remote: true', () => {
    const result = TypedJudgmentConfigSchema.safeParse({
      endpoint: 'https://jev.example.com/v1/systemone',
      allow_remote: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid endpoint URL', () => {
    expect(TypedJudgmentConfigSchema.safeParse({ endpoint: 'not a url' }).success).toBe(false);
  });

  it('rejects out-of-range min_confidence', () => {
    expect(TypedJudgmentConfigSchema.safeParse({ min_confidence: 1.5 }).success).toBe(false);
    expect(TypedJudgmentConfigSchema.safeParse({ min_confidence: -0.1 }).success).toBe(false);
  });

  it('never holds an API key value (api_key_env names the env var)', () => {
    const parsed = TypedJudgmentConfigSchema.parse({ api_key_env: 'MY_JEV_KEY' });
    expect(parsed.api_key_env).toBe('MY_JEV_KEY');
  });
});

describe('DEFAULT_OPERATOR_CONFIG.typed_judgment', () => {
  it('is present, disabled, and matches DEFAULT_TYPED_JUDGMENT_CONFIG', () => {
    expect(DEFAULT_OPERATOR_CONFIG.typed_judgment).toEqual(DEFAULT_TYPED_JUDGMENT_CONFIG);
    expect(DEFAULT_OPERATOR_CONFIG.typed_judgment?.enabled).toBe(false);
  });

  it('OperatorConfigSchema round-trips a config carrying typed_judgment', () => {
    const parsed = OperatorConfigSchema.parse({
      ...DEFAULT_OPERATOR_CONFIG,
      typed_judgment: { enabled: true },
    });
    expect(parsed.typed_judgment).toEqual({
      ...DEFAULT_TYPED_JUDGMENT_CONFIG,
      enabled: true,
    });
  });
});

describe('resolveTypedJudgmentConfigFromEnv', () => {
  it('returns defaults when env is unset', () => {
    expect(resolveTypedJudgmentConfigFromEnv()).toEqual(DEFAULT_TYPED_JUDGMENT_CONFIG);
  });

  it('overrides fields from env', () => {
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENABLED = 'true';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_TIMEOUT_MS = '2500';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_SAMPLES = '3';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_MIN_CONFIDENCE = '0.8';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_MODEL = 'openjev-mini';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_API_KEY_ENV = 'CUSTOM_KEY';

    expect(resolveTypedJudgmentConfigFromEnv()).toEqual({
      ...DEFAULT_TYPED_JUDGMENT_CONFIG,
      enabled: true,
      timeout_ms: 2500,
      samples: 3,
      min_confidence: 0.8,
      model: 'openjev-mini',
      api_key_env: 'CUSTOM_KEY',
    });
  });

  it('ignores invalid scalar env values', () => {
    process.env.SMART_ROUTER_TYPED_JUDGMENT_TIMEOUT_MS = '-1';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_SAMPLES = 'many';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_MIN_CONFIDENCE = '2';

    expect(resolveTypedJudgmentConfigFromEnv()).toEqual(DEFAULT_TYPED_JUDGMENT_CONFIG);
  });

  it('re-validates an env endpoint override and fails closed on remote without allow_remote', () => {
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENABLED = 'true';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT = 'https://jev.example.com/v1/systemone';

    const resolved = resolveTypedJudgmentConfigFromEnv();
    expect(resolved).toEqual({ ...DEFAULT_TYPED_JUDGMENT_CONFIG, enabled: false });
  });

  it('accepts an env loopback endpoint override', () => {
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT = 'http://localhost:9000/v1/systemone';

    const resolved = resolveTypedJudgmentConfigFromEnv();
    expect(resolved.endpoint).toBe('http://localhost:9000/v1/systemone');
  });

  it('accepts an env remote endpoint override when allow_remote is set via env', () => {
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENABLED = 'true';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ALLOW_REMOTE = 'true';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT = 'https://jev.example.com/v1/systemone';

    const resolved = resolveTypedJudgmentConfigFromEnv();
    expect(resolved.enabled).toBe(true);
    expect(resolved.allow_remote).toBe(true);
    expect(resolved.endpoint).toBe('https://jev.example.com/v1/systemone');
  });
});

describe('resolveOperatorConfigFromEnv', () => {
  it('wires typed judgment env overrides into the operator config', () => {
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENABLED = 'true';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_TIMEOUT_MS = '2000';

    const resolved = resolveOperatorConfigFromEnv();
    expect(resolved.typed_judgment).toEqual({
      ...DEFAULT_TYPED_JUDGMENT_CONFIG,
      enabled: true,
      timeout_ms: 2000,
    });
  });

  it('keeps typed judgment disabled when an env endpoint override fails validation', () => {
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENABLED = 'true';
    process.env.SMART_ROUTER_TYPED_JUDGMENT_ENDPOINT = 'https://jev.example.com/v1/systemone';

    const resolved = resolveOperatorConfigFromEnv();
    expect(resolved.typed_judgment?.enabled).toBe(false);
    expect(resolved.typed_judgment?.endpoint).toBe(DEFAULT_TYPED_JUDGMENT_CONFIG.endpoint);
  });
});

describe('typed judgment port types (SP-304, #184)', () => {
  it('question, answer, and answers-map types compose over a port implementation', async () => {
    const choice: TypedJudgmentChoiceQuestion = {
      id: 'q-choice',
      kind: 'choice',
      prompt: 'What tier does this turn belong to?',
      options: ['local_zero', 'free', 'cheap'],
    };
    const score: TypedJudgmentScoreQuestion = {
      id: 'q-score',
      kind: 'score',
      prompt: 'How well specified is the user goal?',
      anchors: [
        { score: 1, description: 'vague' },
        { score: 3, description: 'fully specified' },
      ],
    };
    const noul: TypedJudgmentNoulQuestion = {
      id: 'q-noul',
      kind: 'noul',
      prompt: 'Is the user asking a follow-up about prior context?',
      criteria_true: 'The turn references earlier conversation content.',
      criteria_false: 'The turn is self-contained.',
    };
    const questions: readonly TypedJudgmentQuestion[] = [choice, score, noul];

    const port: TypedJudgmentPort = {
      judge: (state, qs, options) => {
        expect(typeof state).toBe('string');
        expect(qs).toHaveLength(3);
        expect(options.signal).toBeInstanceOf(AbortSignal);
        const answers: TypedJudgmentAnswers = {
          'q-choice': {
            kind: 'choice',
            choice: 'free',
            probabilities: { local_zero: 0.1, free: 0.8, cheap: 0.1 },
            confidence: 0.8,
          },
          'q-score': {
            kind: 'score',
            score: 2,
            legend: { '1': 'vague', '3': 'fully specified' },
            probabilities: { '1': 0.2, '2': 0.6, '3': 0.2 },
            confidence: 0.6,
          },
          'q-noul': { kind: 'noul', noul: 0.9 },
        } satisfies Record<string, TypedJudgmentAnswer>;
        return Promise.resolve(answers);
      },
    };

    const answers = await port.judge('turn state', questions, {
      signal: new AbortController().signal,
    });
    expect(Object.keys(answers).sort()).toEqual(['q-choice', 'q-noul', 'q-score']);
    expect(answers['q-choice']?.kind).toBe('choice');
  });

  it('TypedJudgmentError carries a machine-readable kind', () => {
    const kinds = [
      'bad_request',
      'validation',
      'auth',
      'rate_limited',
      'overloaded',
      'timeout',
      'aborted',
      'invalid_response',
      'transport',
    ] as const;
    for (const kind of kinds) {
      const err = new TypedJudgmentError(kind, `${kind} occurred`);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('TypedJudgmentError');
      expect(err.kind).toBe(kind);
    }
  });

  it('port rejections propagate as errors callers can fail open on', async () => {
    const failing: TypedJudgmentPort = {
      judge: () =>
        Promise.reject(new TypedJudgmentError('timeout', 'judge timed out')),
    };
    await expect(
      failing.judge('state', [], { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});
