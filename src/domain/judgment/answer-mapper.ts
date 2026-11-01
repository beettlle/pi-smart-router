/**
 * Typed-judgment answer mapper (SP-306, GitHub #185) — pure domain, no I/O.
 *
 * Maps raw {@link TypedJudgmentAnswers} (keyed by question id, SP-304 wire
 * types) onto the normalized {@link TypedJudgment} signal consumed by the
 * routing pipeline:
 * - score answers are normalized by `(levels - 1)` onto 0–1;
 * - noul answers become probabilities (1/0 — the wire type carries no
 *   per-branch probability);
 * - a missing answer maps its fields to `null` (no signal);
 * - malformed answers are **rejected** with `TypedJudgmentError`
 *   (`kind: 'invalid_response'`): unknown choice, answer/question kind
 *   mismatch, out-of-range or non-finite scores, out-of-range confidence.
 */

import {
  TypedJudgmentError,
  type TypedJudgmentAnswer,
  type TypedJudgmentAnswers,
  type TypedJudgmentChoiceAnswer,
  type TypedJudgmentChoiceQuestion,
  type TypedJudgmentNoulAnswer,
  type TypedJudgmentScoreAnswer,
  type TypedJudgmentScoreQuestion,
} from '../ports/typed-judgment-port.js';
import {
  CAPABILITY_DESERVED_QUESTION,
  CODE_GEN_QUESTION,
  TASK_KIND_QUESTION,
  TOOL_USE_QUESTION,
  type TaskKind,
} from './questions.js';

/** Normalized, pipeline-ready typed judgment. Fields are `null` when the
 * corresponding question was not answered (partial results allowed). */
export interface TypedJudgment {
  /** Selected task kind, or `null` when `task_kind` was not answered. */
  readonly taskKind: TaskKind | null;
  /** Judge confidence in `taskKind` (0–1), or `null`. */
  readonly taskKindConfidence: number | null;
  /** `capability_deserved` normalized to 0–1 (`score / (levels - 1)`), or `null`. */
  readonly capabilityDeserved: number | null;
  /** Probability the task needs deep reasoning (noul → 1/0), or `null`. */
  readonly deepReasoningP: number | null;
  /** `code_gen` normalized to 0–1, or `null`. */
  readonly codeGen: number | null;
  /** `tool_use` normalized to 0–1, or `null`. */
  readonly toolUse: number | null;
  /** Probability the request is destructive (noul → 1/0), or `null`. */
  readonly destructiveP: number | null;
  /**
   * Judge confidence (0–1) per answered question that carries one (choice
   * and score answers). Noul answers carry no confidence on the wire.
   */
  readonly confidences: Readonly<Record<string, number>>;
}

function invalid(message: string): never {
  throw new TypedJudgmentError('invalid_response', message);
}

function requireConfidence(value: number, questionId: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    invalid(`question '${questionId}': confidence out of range 0–1`);
  }
  return value;
}

function mapChoiceAnswer(
  question: TypedJudgmentChoiceQuestion,
  answer: TypedJudgmentAnswer,
): TypedJudgmentChoiceAnswer {
  if (answer.kind !== 'choice') {
    invalid(
      `question '${question.id}': expected a choice answer, got '${answer.kind}'`,
    );
  }
  if (!question.options.includes(answer.choice)) {
    invalid(
      `question '${question.id}': unknown choice '${answer.choice}'`,
    );
  }
  requireConfidence(answer.confidence, question.id);
  return answer;
}

function mapScoreAnswer(
  question: TypedJudgmentScoreQuestion,
  answer: TypedJudgmentAnswer,
): number {
  if (answer.kind !== 'score') {
    invalid(
      `question '${question.id}': expected a score answer, got '${answer.kind}'`,
    );
  }
  const scoreAnswer = answer as TypedJudgmentScoreAnswer;
  const levels = question.anchors.length;
  const max = levels - 1;
  if (
    !Number.isFinite(scoreAnswer.score) ||
    !Number.isInteger(scoreAnswer.score) ||
    scoreAnswer.score < 0 ||
    scoreAnswer.score > max
  ) {
    invalid(
      `question '${question.id}': score ${String(scoreAnswer.score)} out of range 0–${max}`,
    );
  }
  requireConfidence(scoreAnswer.confidence, question.id);
  // Normalized by (levels - 1) onto 0–1 (#185).
  return scoreAnswer.score / max;
}

function mapNoulAnswer(
  questionId: string,
  answer: TypedJudgmentAnswer,
): number {
  if (answer.kind !== 'noul') {
    invalid(
      `question '${questionId}': expected a noul answer, got '${answer.kind}'`,
    );
  }
  return (answer as TypedJudgmentNoulAnswer).noul ? 1 : 0;
}

/**
 * Map raw judge answers to the normalized {@link TypedJudgment} signal.
 *
 * @throws {TypedJudgmentError} with `kind: 'invalid_response'` when an
 *   answer is malformed (unknown choice, kind mismatch, out-of-range
 *   score/confidence). Callers follow the port's fail-open contract: any
 *   rejection means "no judgment available".
 */
export function mapTypedJudgment(
  answers: TypedJudgmentAnswers,
): TypedJudgment {
  const confidences: Record<string, number> = {};

  let taskKind: TaskKind | null = null;
  let taskKindConfidence: number | null = null;
  const taskKindAnswer = answers[TASK_KIND_QUESTION.id];
  if (taskKindAnswer !== undefined) {
    const mapped = mapChoiceAnswer(TASK_KIND_QUESTION, taskKindAnswer);
    taskKind = mapped.choice as TaskKind;
    taskKindConfidence = mapped.confidence;
    confidences[TASK_KIND_QUESTION.id] = mapped.confidence;
  }

  let capabilityDeserved: number | null = null;
  const capabilityAnswer = answers[CAPABILITY_DESERVED_QUESTION.id];
  if (capabilityAnswer !== undefined) {
    capabilityDeserved = mapScoreAnswer(
      CAPABILITY_DESERVED_QUESTION,
      capabilityAnswer,
    );
    confidences[CAPABILITY_DESERVED_QUESTION.id] = (
      capabilityAnswer as TypedJudgmentScoreAnswer
    ).confidence;
  }

  let codeGen: number | null = null;
  const codeGenAnswer = answers[CODE_GEN_QUESTION.id];
  if (codeGenAnswer !== undefined) {
    codeGen = mapScoreAnswer(CODE_GEN_QUESTION, codeGenAnswer);
    confidences[CODE_GEN_QUESTION.id] = (
      codeGenAnswer as TypedJudgmentScoreAnswer
    ).confidence;
  }

  let toolUse: number | null = null;
  const toolUseAnswer = answers[TOOL_USE_QUESTION.id];
  if (toolUseAnswer !== undefined) {
    toolUse = mapScoreAnswer(TOOL_USE_QUESTION, toolUseAnswer);
    confidences[TOOL_USE_QUESTION.id] = (
      toolUseAnswer as TypedJudgmentScoreAnswer
    ).confidence;
  }

  let deepReasoningP: number | null = null;
  const deepReasoningAnswer = answers['needs_deep_reasoning'];
  if (deepReasoningAnswer !== undefined) {
    deepReasoningP = mapNoulAnswer('needs_deep_reasoning', deepReasoningAnswer);
  }

  let destructiveP: number | null = null;
  const destructiveAnswer = answers['destructive'];
  if (destructiveAnswer !== undefined) {
    destructiveP = mapNoulAnswer('destructive', destructiveAnswer);
  }

  return {
    taskKind,
    taskKindConfidence,
    capabilityDeserved,
    deepReasoningP,
    codeGen,
    toolUse,
    destructiveP,
    confidences,
  };
}
