/**
 * Typed judgment port (SP-304, #184 partial — domain side).
 *
 * Domain-owned contract for asking a calibrated, schema-safe semantic
 * question about a turn (Jev-compatible "systemone" typed judgments). Unlike
 * {@link HttpFetchPort} in `local-runtime-port.ts` (GET-style pings), this
 * port carries structured questions and returns typed answers keyed by
 * question id.
 *
 * This module is **types only** — it performs no I/O. The HTTP adapter lands
 * in SP-305 (`src/infrastructure/`), and pipeline wiring lands in
 * SP-307/SP-308. Dependency direction: domain owns the port; infrastructure
 * implements.
 *
 * Fail-open contract: `judge` may reject (always with a
 * {@link TypedJudgmentError}). Callers treat any rejection as "no judgment
 * available" and continue routing without it — a typed-judgment outage must
 * never break routing (constitution §11: fail secure by default).
 */

// ─── Question wire types ─────────────────────────────────────────────────────

/**
 * Stable question identifier. Answers in {@link TypedJudgmentAnswers} are
 * keyed by this id so callers correlate questions and answers without
 * relying on array order.
 */
export type TypedJudgmentQuestionId = string;

/** Shared fields for every Jev question kind. */
interface TypedJudgmentQuestionBase {
  /** Stable caller-assigned id; echoed back as the answer map key. */
  readonly id: TypedJudgmentQuestionId;
  /** Natural-language question text presented to the judge. */
  readonly prompt: string;
}

/** Categorical question: pick exactly one of `options`. */
export interface TypedJudgmentChoiceQuestion extends TypedJudgmentQuestionBase {
  readonly kind: 'choice';
  /** Candidate labels; the answer's `choice` is one of these strings. */
  readonly options: readonly string[];
}

/** Anchor describing one level of an ordinal score scale. */
export interface TypedJudgmentScoreAnchor {
  /** Ordinal score value. */
  readonly score: number;
  /** Human-readable anchor description for this level (e.g. "fully stated"). */
  readonly description: string;
}

/** Ordinal question: assign a score on an anchored scale. */
export interface TypedJudgmentScoreQuestion extends TypedJudgmentQuestionBase {
  readonly kind: 'score';
  /** Anchored levels defining the scale; at least two, ascending. */
  readonly anchors: readonly TypedJudgmentScoreAnchor[];
}

/**
 * Binary ("noul") question: yes/no judged against explicit true/false
 * criteria so the judge cannot free-style the boundary.
 */
export interface TypedJudgmentNoulQuestion extends TypedJudgmentQuestionBase {
  readonly kind: 'noul';
  /** Criterion under which the answer is `true`. */
  readonly criteria_true: string;
  /** Criterion under which the answer is `false`. */
  readonly criteria_false: string;
}

/** The three Jev answer kinds. */
export type TypedJudgmentQuestion =
  | TypedJudgmentChoiceQuestion
  | TypedJudgmentScoreQuestion
  | TypedJudgmentNoulQuestion;

// ─── Answer types ────────────────────────────────────────────────────────────

/** Answer to a {@link TypedJudgmentChoiceQuestion}. */
export interface TypedJudgmentChoiceAnswer {
  readonly kind: 'choice';
  /** The selected option (one of the question's `options`). */
  readonly choice: string;
  /** Calibrated per-option probabilities (keys = question options). */
  readonly probabilities: Readonly<Record<string, number>>;
  /** Judge confidence in the selection (0–1). */
  readonly confidence: number;
}

/** Answer to a {@link TypedJudgmentScoreQuestion}. */
export interface TypedJudgmentScoreAnswer {
  readonly kind: 'score';
  /** The assigned ordinal score. */
  readonly score: number;
  /** Score → anchor description legend echoed by the judge. */
  readonly legend: Readonly<Record<string, string>>;
  /** Calibrated per-score probabilities (keys = stringified scores). */
  readonly probabilities: Readonly<Record<string, number>>;
  /** Judge confidence in the score (0–1). */
  readonly confidence: number;
}

/** Answer to a {@link TypedJudgmentNoulQuestion}. */
export interface TypedJudgmentNoulAnswer {
  readonly kind: 'noul';
  /** Binary judgment against the question's criteria. */
  readonly noul: boolean;
}

export type TypedJudgmentAnswer =
  | TypedJudgmentChoiceAnswer
  | TypedJudgmentScoreAnswer
  | TypedJudgmentNoulAnswer;

/**
 * Answers returned by {@link TypedJudgmentPort.judge}, keyed by the question
 * `id` supplied by the caller. A question with no entry was not answered
 * (partial results are allowed; callers treat missing ids as no-signal).
 */
export type TypedJudgmentAnswers = Readonly<
  Record<TypedJudgmentQuestionId, TypedJudgmentAnswer>
>;

// ─── Error shape ─────────────────────────────────────────────────────────────

/**
 * Machine-readable failure classification for typed-judgment calls. The
 * adapter (SP-305) maps HTTP status codes and transport failures onto these
 * kinds so callers branch on `kind` without parsing provider error text
 * (which may contain request/response content and must not leak).
 */
export type TypedJudgmentErrorKind =
  | 'bad_request'
  | 'validation'
  | 'auth'
  | 'rate_limited'
  | 'overloaded'
  | 'timeout'
  | 'aborted'
  | 'invalid_response'
  | 'transport';

export class TypedJudgmentError extends Error {
  readonly kind: TypedJudgmentErrorKind;

  constructor(kind: TypedJudgmentErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TypedJudgmentError';
    this.kind = kind;
  }
}

// ─── Port ────────────────────────────────────────────────────────────────────

export interface TypedJudgmentJudgeOptions {
  /** Caller-owned abort signal (turn deadline / cancellation). */
  readonly signal: AbortSignal;
}

/**
 * Port for typed (schema-safe) semantic judgments about a turn.
 *
 * The adapter is injected by the composition root; the pipeline consumes the
 * port via options (SP-307). Implementations must honor `options.signal` and
 * reject with {@link TypedJudgmentError} (`kind: 'aborted'`) on abort.
 *
 * Fail-open contract: any rejection means "no judgment available" — callers
 * continue routing without typed-judgment signal. Implementations must never
 * resolve with malformed answers; schema failures reject with
 * `kind: 'invalid_response'`.
 */
export interface TypedJudgmentPort {
  judge(
    state: string,
    questions: readonly TypedJudgmentQuestion[],
    options: TypedJudgmentJudgeOptions,
  ): Promise<TypedJudgmentAnswers>;
}
