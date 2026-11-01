/**
 * SP-305 (#184): Jev-compatible typed judgment adapter + fail-closed factory.
 *
 * Fetch is injected (or stubbed); no live judge. Fixtures under
 * tests/fixtures/typed-judgment/ are hand-authored from the OpenJev README /
 * engine shapes (each records provenance in `_source`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createTypedJudgmentPort,
  isLoopbackEndpoint,
  JevTypedJudgmentAdapter,
} from '../../src/infrastructure/judgment/jev-typed-judgment-adapter.js';
import {
  TypedJudgmentError,
  type TypedJudgmentChoiceQuestion,
  type TypedJudgmentNoulQuestion,
  type TypedJudgmentScoreQuestion,
} from '../../src/domain/ports/typed-judgment-port.js';
import type { TypedJudgmentConfig } from '../../src/domain/types/index.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURES_DIR = join('tests', 'fixtures', 'typed-judgment');

interface Fixture {
  _source: string;
  status: number;
  body: unknown;
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8')) as Fixture;
}

const CHOICE_FIXTURE = loadFixture('success-choice.json');
const SCORE_FIXTURE = loadFixture('success-score.json');
const NOUL_FIXTURE = loadFixture('success-noul.json');
const ERROR_400 = loadFixture('error-400.json');
const ERROR_422 = loadFixture('error-422.json');
const ERROR_401 = loadFixture('error-401.json');
const ERROR_429 = loadFixture('error-429.json');
const ERROR_529 = loadFixture('error-529.json');

describe('fixtures record provenance', () => {
  it.each([
    CHOICE_FIXTURE,
    SCORE_FIXTURE,
    NOUL_FIXTURE,
    ERROR_400,
    ERROR_422,
    ERROR_401,
    ERROR_429,
    ERROR_529,
  ])('has a _source field', (fixture) => {
    expect(typeof fixture._source).toBe('string');
    expect(fixture._source.length).toBeGreaterThan(0);
  });
});

// ─── Test doubles ────────────────────────────────────────────────────────────

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface RecordedCall {
  url: string;
  init: RequestInit;
}

/** Fetch stub replaying the given responses in order; records every call. */
function stubFetch(...responses: Response[]): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const response = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return Promise.resolve(response);
  };
  return { fetch, calls };
}

/** Fetch stub that stays pending until the request signal aborts (like real fetch). */
function hangingFetch(): FetchLike {
  return (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init.signal;
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener(
        'abort',
        () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fixtureResponse(fixture: Fixture): Response {
  return jsonResponse(fixture.status, fixture.body);
}

// ─── Shared inputs ───────────────────────────────────────────────────────────

const CHOICE_QUESTION: TypedJudgmentChoiceQuestion = {
  id: 'q-choice',
  kind: 'choice',
  prompt: 'What kind of task is this turn?',
  options: ['plan', 'implement', 'debug'],
};

const SCORE_QUESTION: TypedJudgmentScoreQuestion = {
  id: 'q-score',
  kind: 'score',
  prompt: 'How well specified is the user goal?',
  anchors: [
    { score: 1, description: 'vague' },
    { score: 3, description: 'fully specified' },
  ],
};

const NOUL_QUESTION: TypedJudgmentNoulQuestion = {
  id: 'q-noul',
  kind: 'noul',
  prompt: 'Is the user asking a follow-up about prior context?',
  criteria_true: 'The turn references earlier conversation content.',
  criteria_false: 'The turn is self-contained.',
};

const STATE = 'latest user message: refactor the router pipeline stage';

const LOOPBACK_CONFIG: TypedJudgmentConfig = {
  enabled: true,
  endpoint: 'http://127.0.0.1:8080/v1/systemone',
  model: 'openjev-latest',
  timeout_ms: 1500,
  samples: 3,
  api_key_env: 'TYPESAFE_API_KEY',
  allow_remote: false,
  min_confidence: 0.6,
};

const REMOTE_CONFIG: TypedJudgmentConfig = {
  ...LOOPBACK_CONFIG,
  endpoint: 'https://jev.example.com/v1/systemone',
  allow_remote: true,
};

function judgeOptions(): { signal: AbortSignal } {
  return { signal: new AbortController().signal };
}

function parseRequestBody(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

// ─── Request building & answer mapping (loopback) ───────────────────────────

describe('loopback requests (local OpenJev)', () => {
  it('POSTs the Jev wire body with samples and no Authorization header', async () => {
    const { fetch, calls } = stubFetch(fixtureResponse(CHOICE_FIXTURE));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions());

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(LOOPBACK_CONFIG.endpoint);
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers.authorization).toBeUndefined();

    const body = parseRequestBody(call);
    expect(body.model).toBe('openjev-latest');
    expect(body.state).toBe(STATE);
    expect(body.samples).toBe(3);
    expect(body.questions).toEqual({
      'q-choice': {
        type: 'choice',
        instructions: CHOICE_QUESTION.prompt,
        criteria: { plan: 'plan', implement: 'implement', debug: 'debug' },
      },
    });
  });

  it('maps a wire choice answer to the domain answer', async () => {
    const { fetch } = stubFetch(fixtureResponse(CHOICE_FIXTURE));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const answers = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions());

    expect(answers['q-choice']).toEqual({
      kind: 'choice',
      choice: 'implement',
      probabilities: { plan: 0.1, implement: 0.8, debug: 0.1 },
      confidence: 0.86,
    });
  });

  it('translates score questions and lifts 0-indexed levels onto anchor scores', async () => {
    const { fetch, calls } = stubFetch(fixtureResponse(SCORE_FIXTURE));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const answers = await adapter.judge(STATE, [SCORE_QUESTION], judgeOptions());

    const body = parseRequestBody(calls[0]!);
    expect(body.questions).toEqual({
      'q-score': {
        type: 'score',
        instructions: SCORE_QUESTION.prompt,
        criteria: ['vague', 'fully specified'],
      },
    });

    // Wire probabilities {0: 0.2, 1: 0.8} over anchor scores {1, 3}:
    // expected = 0.2·1 + 0.8·3 = 2.6, re-keyed legend/probabilities.
    const score = answers['q-score'];
    expect(score?.kind).toBe('score');
    if (score?.kind === 'score') {
      expect(score.score).toBeCloseTo(2.6, 10);
      expect(score.legend).toEqual({ '1': 'vague', '3': 'fully specified' });
      expect(score.probabilities).toEqual({ '1': 0.2, '3': 0.8 });
      expect(score.confidence).toBe(0.71);
    }
  });

  it('keeps the wire noul probability (P(yes)) rather than thresholding it', async () => {
    const { fetch, calls } = stubFetch(fixtureResponse(NOUL_FIXTURE));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const answers = await adapter.judge(STATE, [NOUL_QUESTION], judgeOptions());

    const body = parseRequestBody(calls[0]!);
    expect(body.questions).toEqual({
      'q-noul': {
        type: 'noul',
        instructions: NOUL_QUESTION.prompt,
        criteria: {
          true: NOUL_QUESTION.criteria_true,
          false: NOUL_QUESTION.criteria_false,
        },
      },
    });
    expect(answers['q-noul']).toEqual({ kind: 'noul', noul: 0.93 });
  });
});

// ─── Request building (remote / hosted Jev) ─────────────────────────────────

describe('remote requests (hosted Jev)', () => {
  it('sends Authorization: Bearer and omits the OpenJev samples extension', async () => {
    const { fetch, calls } = stubFetch(fixtureResponse(CHOICE_FIXTURE));
    const adapter = new JevTypedJudgmentAdapter(REMOTE_CONFIG, 'sk-test-key', fetch);

    await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions());

    const call = calls[0]!;
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test-key');
    const body = parseRequestBody(call);
    expect('samples' in body).toBe(false);
  });
});

// ─── HTTP error mapping ─────────────────────────────────────────────────────

describe('error mapping', () => {
  it('maps 400 (plain-string detail) to bad_request', async () => {
    const { fetch } = stubFetch(fixtureResponse(ERROR_400));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TypedJudgmentError);
    expect((error as TypedJudgmentError).kind).toBe('bad_request');
    expect((error as TypedJudgmentError).message).toContain(
      'at most 255 options per choice question',
    );
  });

  it('maps 400 (api_usage_error object) to bad_request carrying error_type', async () => {
    const body = { detail: { error_type: 'api_usage_error', message: 'Unknown model: jev-1.13.0' } };
    const { fetch } = stubFetch(jsonResponse(400, body));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('bad_request');
    expect((error as TypedJudgmentError).message).toContain('api_usage_error');
  });

  it('maps 422 to validation with loc/type/msg summary (never the echoed input)', async () => {
    const { fetch } = stubFetch(fixtureResponse(ERROR_422));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('validation');
    const message = (error as TypedJudgmentError).message;
    expect(message).toContain('body.questions');
    expect(message).toContain('Field required');
    expect(message).not.toContain('input');
  });

  it('maps 401 to auth carrying detail.error_type only', async () => {
    const { fetch } = stubFetch(fixtureResponse(ERROR_401));
    const adapter = new JevTypedJudgmentAdapter(REMOTE_CONFIG, 'sk-test-key', fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('auth');
    const message = (error as TypedJudgmentError).message;
    expect(message).toContain('authentication_error');
    // The provider message is not forwarded.
    expect(message).not.toContain('Cannot authenticate');
  });

  it('maps 403 to auth', async () => {
    const body = { detail: { error_type: 'permission_error', message: 'Direct access denied.' } };
    const { fetch } = stubFetch(jsonResponse(403, body));
    const adapter = new JevTypedJudgmentAdapter(REMOTE_CONFIG, 'sk-test-key', fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('auth');
    expect((error as TypedJudgmentError).message).toContain('permission_error');
    expect((error as TypedJudgmentError).message).not.toContain('Direct access denied.');
  });

  it('maps unexpected statuses to transport', async () => {
    const { fetch } = stubFetch(jsonResponse(503, { detail: { error_type: 'api_error' } }));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('transport');
    expect((error as TypedJudgmentError).message).toContain('503');
  });

  it('maps network failures to transport', async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('transport');
  });
});

// ─── Response validation ────────────────────────────────────────────────────

describe('response validation', () => {
  it('rejects a choice outside the declared options as invalid_response', async () => {
    const body = {
      answers: {
        'q-choice': {
          type: 'choice',
          choice: 'hallucinated',
          probabilities: { plan: 0.5, hallucinated: 0.5 },
          confidence: 0.4,
        },
      },
    };
    const { fetch } = stubFetch(jsonResponse(200, body));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('invalid_response');
  });

  it('rejects a missing answer id as invalid_response', async () => {
    const body = {
      answers: {
        'q-choice': {
          type: 'choice',
          choice: 'plan',
          probabilities: { plan: 1 },
          confidence: 1,
        },
      },
    };
    const { fetch } = stubFetch(jsonResponse(200, body));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter
      .judge(STATE, [CHOICE_QUESTION, NOUL_QUESTION], judgeOptions())
      .catch((e: unknown) => e);
    expect((error as TypedJudgmentError).kind).toBe('invalid_response');
    expect((error as TypedJudgmentError).message).toContain('q-noul');
  });

  it('rejects a malformed envelope as invalid_response', async () => {
    const { fetch } = stubFetch(jsonResponse(200, { unexpected: true }));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('invalid_response');
  });

  it('rejects an answer type that does not match the question kind', async () => {
    const body = { answers: { 'q-choice': { type: 'noul', noul: 0.5 } } };
    const { fetch } = stubFetch(jsonResponse(200, body));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('invalid_response');
  });

  it('rejects a score answer missing a level probability', async () => {
    const body = {
      answers: {
        'q-score': {
          type: 'score',
          score: 0.5,
          legend: { '0': 'vague' },
          probabilities: { '0': 1 },
          confidence: 1,
        },
      },
    };
    const { fetch } = stubFetch(jsonResponse(200, body));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [SCORE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('invalid_response');
  });
});

// ─── Retry, timeout, abort ───────────────────────────────────────────────────

describe('retry, timeout, abort', () => {
  it('retries 429 once and returns the success answer', async () => {
    const { fetch, calls } = stubFetch(
      fixtureResponse(ERROR_429),
      fixtureResponse(CHOICE_FIXTURE),
    );
    const adapter = new JevTypedJudgmentAdapter(
      { ...LOOPBACK_CONFIG, timeout_ms: 5000 },
      undefined,
      fetch,
    );

    const answers = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions());

    expect(calls).toHaveLength(2);
    expect(answers['q-choice']?.kind).toBe('choice');
  });

  it('gives up after 2 retries on persistent 429 (rate_limited)', async () => {
    const { fetch, calls } = stubFetch(
      fixtureResponse(ERROR_429),
      fixtureResponse(ERROR_429),
      fixtureResponse(ERROR_429),
      fixtureResponse(ERROR_429),
    );
    const adapter = new JevTypedJudgmentAdapter(
      { ...LOOPBACK_CONFIG, timeout_ms: 5000 },
      undefined,
      fetch,
    );

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect(calls).toHaveLength(3); // initial attempt + 2 retries
    expect((error as TypedJudgmentError).kind).toBe('rate_limited');
  });

  it('gives up after 2 retries on persistent 529 (overloaded)', async () => {
    const { fetch, calls } = stubFetch(
      fixtureResponse(ERROR_529),
      fixtureResponse(ERROR_529),
      fixtureResponse(ERROR_529),
    );
    const adapter = new JevTypedJudgmentAdapter(
      { ...LOOPBACK_CONFIG, timeout_ms: 5000 },
      undefined,
      fetch,
    );

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect(calls).toHaveLength(3);
    expect((error as TypedJudgmentError).kind).toBe('overloaded');
  });

  it('does not retry non-retryable statuses', async () => {
    const { fetch, calls } = stubFetch(fixtureResponse(ERROR_400));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(() => undefined);
    expect(calls).toHaveLength(1);
  });

  it('maps an expired deadline to timeout', async () => {
    const adapter = new JevTypedJudgmentAdapter(
      { ...LOOPBACK_CONFIG, timeout_ms: 30 },
      undefined,
      hangingFetch(),
    );

    const started = Date.now();
    const error = await adapter
      .judge(STATE, [CHOICE_QUESTION], judgeOptions())
      .catch((e: unknown) => e);
    expect((error as TypedJudgmentError).kind).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('maps a caller abort to aborted (distinct from timeout)', async () => {
    const controller = new AbortController();
    const adapter = new JevTypedJudgmentAdapter(
      { ...LOOPBACK_CONFIG, timeout_ms: 5000 },
      undefined,
      hangingFetch(),
    );

    setTimeout(() => controller.abort(), 10);
    const error = await adapter
      .judge(STATE, [CHOICE_QUESTION], { signal: controller.signal })
      .catch((e: unknown) => e);
    expect((error as TypedJudgmentError).kind).toBe('aborted');
  });

  it('rejects immediately when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch, calls } = stubFetch(fixtureResponse(CHOICE_FIXTURE));
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter
      .judge(STATE, [CHOICE_QUESTION], { signal: controller.signal })
      .catch((e: unknown) => e);
    expect((error as TypedJudgmentError).kind).toBe('aborted');
    expect(calls).toHaveLength(0);
  });
});

// ─── Redaction ───────────────────────────────────────────────────────────────

describe('redaction', () => {
  it('never includes the state string in thrown error messages', async () => {
    const leak = new TypeError(`upstream rejected the payload containing "${STATE}"`);
    const fetch: FetchLike = () => Promise.reject(leak);
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).kind).toBe('transport');
    expect((error as TypedJudgmentError).message).not.toContain(STATE);
    expect((error as TypedJudgmentError).message).toContain('[REDACTED]');
  });

  it('never includes question prompt text in thrown error messages', async () => {
    const leak = new TypeError(`bad payload near "${CHOICE_QUESTION.prompt}"`);
    const fetch: FetchLike = () => Promise.reject(leak);
    const adapter = new JevTypedJudgmentAdapter(LOOPBACK_CONFIG, undefined, fetch);

    const error = await adapter.judge(STATE, [CHOICE_QUESTION], judgeOptions()).catch(
      (e: unknown) => e,
    );
    expect((error as TypedJudgmentError).message).not.toContain(CHOICE_QUESTION.prompt);
    expect((error as TypedJudgmentError).message).toContain('[REDACTED]');
  });
});

// ─── Fail-closed factory ─────────────────────────────────────────────────────

describe('createTypedJudgmentPort', () => {
  it('returns null with typed_judgment_disabled when disabled', () => {
    const result = createTypedJudgmentPort({ ...LOOPBACK_CONFIG, enabled: false }, {});
    expect(result).toEqual({ port: null, reason: 'typed_judgment_disabled' });
  });

  it('fails closed for a remote endpoint when the env key is missing or empty', () => {
    const missing = createTypedJudgmentPort(REMOTE_CONFIG, {});
    expect(missing).toEqual({ port: null, reason: 'typed_judgment_remote_key_missing' });

    const empty = createTypedJudgmentPort(REMOTE_CONFIG, { TYPESAFE_API_KEY: '   ' });
    expect(empty).toEqual({ port: null, reason: 'typed_judgment_remote_key_missing' });
  });

  it('reads the key from the env var named by api_key_env, not a fixed name', () => {
    const config = { ...REMOTE_CONFIG, api_key_env: 'CUSTOM_JEV_KEY' };
    const wrongVar = createTypedJudgmentPort(config, { TYPESAFE_API_KEY: 'sk-no' });
    expect(wrongVar).toEqual({ port: null, reason: 'typed_judgment_remote_key_missing' });

    const rightVar = createTypedJudgmentPort(config, { CUSTOM_JEV_KEY: 'sk-yes' });
    expect(rightVar.port).not.toBeNull();
  });

  it('creates a port for a remote endpoint when the key is present', () => {
    const result = createTypedJudgmentPort(REMOTE_CONFIG, { TYPESAFE_API_KEY: 'sk-test' });
    expect(result.port).toBeInstanceOf(JevTypedJudgmentAdapter);
  });

  it('creates a port for a loopback endpoint without any key', () => {
    const result = createTypedJudgmentPort(LOOPBACK_CONFIG, {});
    expect(result.port).toBeInstanceOf(JevTypedJudgmentAdapter);
  });
});

// ─── Endpoint classification ─────────────────────────────────────────────────

describe('isLoopbackEndpoint', () => {
  it('accepts the loopback hosts', () => {
    expect(isLoopbackEndpoint('http://127.0.0.1:8080/v1/systemone')).toBe(true);
    expect(isLoopbackEndpoint('http://localhost:8080/v1/systemone')).toBe(true);
    expect(isLoopbackEndpoint('http://[::1]:8080/v1/systemone')).toBe(true);
  });

  it('rejects remote hosts and unparseable URLs', () => {
    expect(isLoopbackEndpoint('https://api.codiv.ai/v1/systemone')).toBe(false);
    expect(isLoopbackEndpoint('not a url')).toBe(false);
  });
});
