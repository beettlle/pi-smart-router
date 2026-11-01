/**
 * Jev-compatible typed judgment HTTP adapter (SP-305, #184).
 *
 * Implements the domain `TypedJudgmentPort` over Node's global `fetch`
 * (Node ≥ 22.19; no new npm dependencies) against `POST /v1/systemone`.
 * Local OpenJev is the default endpoint; hosted Jev (TypeSafe / Codiv) is
 * opt-in via `allow_remote` (enforced by the config schema) plus a key from
 * the env var named by `api_key_env` (enforced by the factory — fail closed).
 *
 * Wire notes (OpenJev README + `openjev/api.py`, `openjev/engine.py`):
 * - Request: `{model, state, questions: {id: {type, instructions, criteria}}}`
 *   plus the OpenJev-only `samples` extension, sent for loopback endpoints
 *   only (hosted Jev rejects unknown fields).
 * - Success: `{model, answers: {id: {type, …}}, usage}`. `noul` answers carry
 *   P(yes) ∈ [0,1]; `score` answers are 0-indexed expected levels — this
 *   adapter lifts them onto the question's anchor scores.
 * - Errors: 400 (`detail` string or `{error_type, message}`), 422 (FastAPI
 *   validation list), 401/403 (`{detail: {error_type, message}}`), 429, 529.
 *   Only 429/529 are retried (max 2, linear backoff, inside `timeout_ms`).
 *
 * Privacy: thrown errors and logs never include state or question prompt
 * text; every constructed message passes through `redactPromptFromError`.
 * The API key is read from the environment at construction, never from
 * config files, and is never logged.
 */

import { z } from 'zod';

import {
  TypedJudgmentError,
  type TypedJudgmentAnswer,
  type TypedJudgmentAnswers,
  type TypedJudgmentChoiceQuestion,
  type TypedJudgmentNoulQuestion,
  type TypedJudgmentPort,
  type TypedJudgmentQuestion,
  type TypedJudgmentScoreQuestion,
} from '../../domain/ports/typed-judgment-port.js';
import { redactPromptFromError } from '../../domain/pipeline/stage-helpers.js';
import type { TypedJudgmentConfig } from '../../domain/types/index.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max retries after the initial attempt (429/529 only). */
const MAX_RETRIES = 2;

/** Linear backoff base: retry N waits `BACKOFF_BASE_MS * N` (250 ms, 500 ms). */
const BACKOFF_BASE_MS = 250;

/**
 * Loopback hosts matching `TypedJudgmentConfigSchema` in
 * `src/domain/types/schemas.ts` (duplicated: the schema's helper is
 * module-private and the schema file is out of this task's change scope).
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1']);

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// ─── Endpoint classification ─────────────────────────────────────────────────

/** Normalized hostname of an endpoint URL, or undefined when unparseable. */
function parseEndpointHostname(endpoint: string): string | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return undefined;
  }
  const hostname = url.hostname;
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

/** True when the endpoint is loopback (local OpenJev). */
export function isLoopbackEndpoint(endpoint: string): boolean {
  const hostname = parseEndpointHostname(endpoint);
  return hostname !== undefined && LOOPBACK_HOSTS.has(hostname);
}

// ─── Wire question translation ───────────────────────────────────────────────

/** Jev wire question shapes (`openjev/api.py` SystemOneRequest). */
type WireQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string; criteria: { true: string; false: string } };

function toWireQuestion(question: TypedJudgmentQuestion): WireQuestion {
  switch (question.kind) {
    case 'choice':
      // Jev choice criteria map each option name to a description; the
      // domain carries option labels only, so each option describes itself.
      return {
        type: 'choice',
        instructions: question.prompt,
        criteria: Object.fromEntries(question.options.map((option) => [option, option])),
      };
    case 'score':
      // Jev score criteria are level descriptions in ascending order
      // (0-indexed on the wire; the domain anchors carry explicit scores).
      return {
        type: 'score',
        instructions: question.prompt,
        criteria: question.anchors.map((anchor) => anchor.description),
      };
    case 'noul':
      return {
        type: 'noul',
        instructions: question.prompt,
        criteria: { true: question.criteria_true, false: question.criteria_false },
      };
  }
}

// ─── Wire response validation (zod) ─────────────────────────────────────────

const probabilityRecordSchema = z.record(z.string(), z.number());

/** Wire `choice` answer: `{type, choice, probabilities, confidence}`. */
const wireChoiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  probabilities: probabilityRecordSchema,
  confidence: z.number().min(0).max(1),
});

/** Wire `score` answer: `{type, score, legend, probabilities, confidence}` (0-indexed levels). */
const wireScoreAnswerSchema = z.object({
  type: z.literal('score'),
  score: z.number(),
  legend: z.record(z.string(), z.string()),
  probabilities: probabilityRecordSchema,
  confidence: z.number().min(0).max(1),
});

/** Wire `noul` answer: `{type, noul}` where `noul` is P(yes) ∈ [0,1]. */
const wireNoulAnswerSchema = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0).max(1),
});

const wireAnswerSchema = z.discriminatedUnion('type', [
  wireChoiceAnswerSchema,
  wireScoreAnswerSchema,
  wireNoulAnswerSchema,
]);

type WireAnswer = z.infer<typeof wireAnswerSchema>;

/** Success envelope; `model`/`usage` are informational and ignored. */
const wireResponseSchema = z.object({
  answers: z.record(z.string(), wireAnswerSchema),
});

/** `{detail: {error_type, message}}` — auth errors (401/403) and api errors. */
const wireObjectErrorSchema = z.object({
  detail: z.object({
    error_type: z.string(),
    message: z.string().optional(),
  }),
});

/** `{detail: "plain text reason"}` — 400 semantic errors (unaskable question). */
const wireStringErrorSchema = z.object({
  detail: z.string(),
});

/** `{detail: [{type, loc, msg, …}]}` — 422 FastAPI validation list. */
const wireValidationErrorSchema = z.object({
  detail: z.array(
    z.object({
      loc: z.array(z.union([z.string(), z.number()])).optional(),
      msg: z.string().optional(),
      type: z.string().optional(),
    }),
  ),
});

// ─── Answer mapping ──────────────────────────────────────────────────────────

type Redact = (message: string) => string;

function invalidResponse(redact: Redact, message: string): TypedJudgmentError {
  return new TypedJudgmentError('invalid_response', redact(message));
}

function mapChoiceAnswer(
  question: TypedJudgmentChoiceQuestion,
  wire: Extract<WireAnswer, { type: 'choice' }>,
  redact: Redact,
): TypedJudgmentAnswer {
  if (!question.options.includes(wire.choice)) {
    throw invalidResponse(
      redact,
      `judge answered choice '${wire.choice}' for question '${question.id}', ` +
        'which is not one of the declared options',
    );
  }
  for (const key of Object.keys(wire.probabilities)) {
    if (!question.options.includes(key)) {
      throw invalidResponse(
        redact,
        `judge returned a probability for unknown option '${key}' ` +
          `on question '${question.id}'`,
      );
    }
  }
  return {
    kind: 'choice',
    choice: wire.choice,
    probabilities: wire.probabilities,
    confidence: wire.confidence,
  };
}

function mapScoreAnswer(
  question: TypedJudgmentScoreQuestion,
  wire: Extract<WireAnswer, { type: 'score' }>,
  redact: Redact,
): TypedJudgmentAnswer {
  // The wire is 0-indexed over the level list; the domain carries explicit
  // anchor scores. Re-key legend/probabilities onto anchor scores and lift
  // the expected level into anchor-score space (Σ pᵢ·anchorᵢ.score).
  const legend: Record<string, string> = {};
  const probabilities: Record<string, number> = {};
  let expected = 0;
  question.anchors.forEach((anchor, index) => {
    const wireKey = String(index);
    const probability = wire.probabilities[wireKey];
    if (probability === undefined) {
      throw invalidResponse(
        redact,
        `judge score answer for question '${question.id}' is missing ` +
          `a probability for level ${wireKey}`,
      );
    }
    const domainKey = String(anchor.score);
    legend[domainKey] = wire.legend[wireKey] ?? anchor.description;
    probabilities[domainKey] = probability;
    expected += probability * anchor.score;
  });
  return {
    kind: 'score',
    score: expected,
    legend,
    probabilities,
    confidence: wire.confidence,
  };
}

function mapNoulAnswer(
  _question: TypedJudgmentNoulQuestion,
  wire: Extract<WireAnswer, { type: 'noul' }>,
): TypedJudgmentAnswer {
  return { kind: 'noul', noul: wire.noul };
}

function mapAnswer(
  question: TypedJudgmentQuestion,
  wire: WireAnswer,
  redact: Redact,
): TypedJudgmentAnswer {
  if (wire.type !== question.kind) {
    throw invalidResponse(
      redact,
      `judge answered question '${question.id}' with type '${wire.type}', ` +
        `expected '${question.kind}'`,
    );
  }
  switch (question.kind) {
    case 'choice':
      return mapChoiceAnswer(question, wire as Extract<WireAnswer, { type: 'choice' }>, redact);
    case 'score':
      return mapScoreAnswer(question, wire as Extract<WireAnswer, { type: 'score' }>, redact);
    case 'noul':
      return mapNoulAnswer(question, wire as Extract<WireAnswer, { type: 'noul' }>);
  }
}

// ─── HTTP error mapping ──────────────────────────────────────────────────────

/**
 * Map an HTTP error status + parsed body to a `TypedJudgmentError`. Auth
 * errors carry `detail.error_type` only (never the provider message); all
 * messages are redacted by the caller.
 */
function mapHttpError(status: number, body: unknown, redact: Redact): TypedJudgmentError {
  if (status === 400) {
    const objectError = wireObjectErrorSchema.safeParse(body);
    if (objectError.success) {
      const { error_type, message } = objectError.data.detail;
      return new TypedJudgmentError(
        'bad_request',
        redact(
          `judge rejected the request (${error_type})` + (message ? `: ${message}` : ''),
        ),
      );
    }
    const stringError = wireStringErrorSchema.safeParse(body);
    const reason = stringError.success ? `: ${stringError.data.detail}` : '';
    return new TypedJudgmentError('bad_request', redact(`judge rejected the request${reason}`));
  }

  if (status === 422) {
    const validationError = wireValidationErrorSchema.safeParse(body);
    const summary = validationError.success
      ? validationError.data.detail
          .map((item) => {
            const loc = item.loc?.join('.') ?? '';
            const parts = [loc, item.type, item.msg].filter(
              (part): part is string => part !== undefined && part !== '',
            );
            return parts.join(': ');
          })
          .join('; ')
      : '';
    return new TypedJudgmentError(
      'validation',
      redact(`judge could not validate the request${summary ? `: ${summary}` : ''}`),
    );
  }

  if (status === 401 || status === 403) {
    // Carry detail.error_type only — the provider message is not forwarded.
    const objectError = wireObjectErrorSchema.safeParse(body);
    const errorType = objectError.success ? objectError.data.detail.error_type : 'unknown';
    return new TypedJudgmentError('auth', `judge authentication failed (${errorType})`);
  }

  if (status === 429) {
    return new TypedJudgmentError('rate_limited', 'judge rate limited the request');
  }

  if (status === 529) {
    return new TypedJudgmentError('overloaded', 'judge is overloaded');
  }

  return new TypedJudgmentError('transport', `judge returned unexpected HTTP ${status}`);
}

// ─── Abort helpers ───────────────────────────────────────────────────────────

/** True for the abort/timeout reasons fetch rejects with. */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/** Sleep, rejecting with the signal's reason when the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

/**
 * `TypedJudgmentPort` over global fetch against a Jev-compatible endpoint.
 *
 * Construction is cheap and side-effect free apart from reading no env —
 * the API key (remote endpoints only) is handed in by
 * {@link createTypedJudgmentPort}, which is the fail-closed composition path.
 * Direct construction is intended for tests; the factory enforces remote-key
 * gating.
 */
export class JevTypedJudgmentAdapter implements TypedJudgmentPort {
  readonly #config: TypedJudgmentConfig;
  readonly #apiKey: string | undefined;
  readonly #remote: boolean;
  readonly #fetchImpl: FetchLike | undefined;

  constructor(
    config: TypedJudgmentConfig,
    apiKey?: string,
    fetchImpl?: FetchLike,
  ) {
    this.#config = config;
    this.#apiKey = apiKey;
    this.#remote = !isLoopbackEndpoint(config.endpoint);
    this.#fetchImpl = fetchImpl;
  }

  async judge(
    state: string,
    questions: readonly TypedJudgmentQuestion[],
    options: { signal: AbortSignal },
  ): Promise<TypedJudgmentAnswers> {
    const redact: Redact = (message) => {
      let out = redactPromptFromError(message, state);
      for (const question of questions) {
        out = redactPromptFromError(out, question.prompt);
      }
      return out;
    };

    // One deadline covers the whole call including retries; the caller's
    // signal composes with it so either can abort the in-flight request.
    const timeoutSignal = AbortSignal.timeout(this.#config.timeout_ms);
    const callerSignal = options.signal;
    const signal = AbortSignal.any([callerSignal, timeoutSignal]);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    // Remote endpoints authenticate; loopback (local OpenJev) never sees the
    // key. The key itself never appears in errors or logs.
    if (this.#remote && this.#apiKey !== undefined) {
      headers.authorization = `Bearer ${this.#apiKey}`;
    }

    const wireQuestions: Record<string, WireQuestion> = {};
    for (const question of questions) {
      wireQuestions[question.id] = toWireQuestion(question);
    }
    const body: Record<string, unknown> = {
      model: this.#config.model,
      state,
      questions: wireQuestions,
    };
    // `samples` is an OpenJev extension; hosted Jev rejects unknown fields.
    if (!this.#remote) {
      body.samples = this.#config.samples;
    }

    try {
      const response = await this.#postWithRetry(
        JSON.stringify(body),
        headers,
        signal,
        timeoutSignal,
      );

      if (!response.ok) {
        const errorBody: unknown = await response.json().catch(() => undefined);
        throw mapHttpError(response.status, errorBody, redact);
      }

      const payload: unknown = await response.json().catch(() => undefined);
      const parsed = wireResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw invalidResponse(redact, 'judge returned a malformed response envelope');
      }

      const answers: Record<string, TypedJudgmentAnswer> = {};
      for (const question of questions) {
        const wire = parsed.data.answers[question.id];
        if (wire === undefined) {
          throw invalidResponse(
            redact,
            `judge response is missing an answer for question '${question.id}'`,
          );
        }
        answers[question.id] = mapAnswer(question, wire, redact);
      }
      return answers;
    } catch (error) {
      if (error instanceof TypedJudgmentError) {
        throw error;
      }
      if (isAbortError(error) || signal.aborted) {
        // Caller abort wins over timeout when both fired together.
        if (callerSignal.aborted) {
          throw new TypedJudgmentError('aborted', 'typed judgment aborted by caller');
        }
        if (timeoutSignal.aborted) {
          throw new TypedJudgmentError(
            'timeout',
            `typed judgment timed out after ${this.#config.timeout_ms} ms`,
          );
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new TypedJudgmentError(
        'transport',
        redact(`typed judgment transport failure: ${message}`),
      );
    }
  }

  /** POST with bounded retries on 429/529 (linear backoff, shared deadline). */
  async #postWithRetry(
    body: string,
    headers: Record<string, string>,
    signal: AbortSignal,
    timeoutSignal: AbortSignal,
  ): Promise<Response> {
    const doFetch = this.#fetchImpl ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init));
    let retries = 0;
    for (;;) {
      if (signal.aborted) {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      const response = await doFetch(this.#config.endpoint, {
        method: 'POST',
        headers,
        body,
        signal,
      });
      const retryable = response.status === 429 || response.status === 529;
      // Retry only while retries remain and the deadline has not passed —
      // the backoff sleep and the next attempt share `timeoutSignal`.
      if (!retryable || retries >= MAX_RETRIES || timeoutSignal.aborted) {
        return response;
      }
      retries += 1;
      await sleep(BACKOFF_BASE_MS * retries, signal);
    }
  }
}

// ─── Fail-closed factory ─────────────────────────────────────────────────────

/** Why no typed judgment port was created. */
export type TypedJudgmentUnavailableReason =
  | 'typed_judgment_disabled'
  | 'typed_judgment_remote_key_missing';

export type CreateTypedJudgmentPortResult =
  | { port: TypedJudgmentPort }
  | { port: null; reason: TypedJudgmentUnavailableReason };

/**
 * Composition-root factory (SP-305, #184). Fails closed:
 * - `enabled: false` → `{ port: null, reason: 'typed_judgment_disabled' }`
 * - remote endpoint with an empty/missing `api_key_env` value →
 *   `{ port: null, reason: 'typed_judgment_remote_key_missing' }`
 *
 * The key is read from `env[config.api_key_env]` here (at construction) and
 * only ever lives inside the adapter; it is never read from config files
 * and never logged.
 */
export function createTypedJudgmentPort(
  config: TypedJudgmentConfig,
  env: Readonly<Record<string, string | undefined>> = process.env,
): CreateTypedJudgmentPortResult {
  if (!config.enabled) {
    return { port: null, reason: 'typed_judgment_disabled' };
  }
  if (!isLoopbackEndpoint(config.endpoint)) {
    const key = env[config.api_key_env];
    if (key === undefined || key.trim() === '') {
      return { port: null, reason: 'typed_judgment_remote_key_missing' };
    }
    return { port: new JevTypedJudgmentAdapter(config, key) };
  }
  return { port: new JevTypedJudgmentAdapter(config) };
}
