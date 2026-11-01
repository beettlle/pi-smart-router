/**
 * Typed-judgment question set + answer mapper tests (SP-306, #185).
 *
 * Covers: the six-question constants module (ids, kinds, anchored levels,
 * attribution, version hash) and `mapTypedJudgment` — normalization by
 * `(levels - 1)`, unknown-choice rejection, kind-mismatch rejection,
 * out-of-range score rejection, and missing answers mapping to `null`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  mapTypedJudgment,
  type TypedJudgment,
} from '../../src/domain/judgment/answer-mapper.js';
import * as judgmentBarrel from '../../src/domain/judgment/index.js';
import {
  CAPABILITY_DESERVED_QUESTION,
  CODE_GEN_QUESTION,
  DESTRUCTIVE_QUESTION,
  NEEDS_DEEP_REASONING_QUESTION,
  TASK_KIND_OPTIONS,
  TASK_KIND_QUESTION,
  TOOL_USE_QUESTION,
  TYPED_JUDGMENT_QUESTIONS,
  TYPED_JUDGMENT_QUESTION_IDS,
  TYPED_JUDGMENT_QUESTION_SET_VERSION,
} from '../../src/domain/judgment/questions.js';
import {
  TypedJudgmentError,
  type TypedJudgmentAnswers,
  type TypedJudgmentChoiceAnswer,
  type TypedJudgmentNoulAnswer,
  type TypedJudgmentScoreAnswer,
  type TypedJudgmentScoreQuestion,
} from '../../src/domain/ports/typed-judgment-port.js';

function choiceAnswer(
  choice: string,
  confidence = 0.9,
): TypedJudgmentChoiceAnswer {
  return { kind: 'choice', choice, probabilities: {}, confidence };
}

function scoreAnswer(score: number, confidence = 0.8): TypedJudgmentScoreAnswer {
  return { kind: 'score', score, legend: {}, probabilities: {}, confidence };
}

function noulAnswer(noul: boolean): TypedJudgmentNoulAnswer {
  return { kind: 'noul', noul };
}

describe('judgment module barrel', () => {
  it('re-exports the state builder, question set, and mapper', () => {
    expect(typeof judgmentBarrel.buildJudgeState).toBe('function');
    expect(typeof judgmentBarrel.isAcknowledgement).toBe('function');
    expect(typeof judgmentBarrel.mapTypedJudgment).toBe('function');
    expect(judgmentBarrel.TYPED_JUDGMENT_QUESTIONS).toHaveLength(6);
    expect(judgmentBarrel.TYPED_JUDGMENT_QUESTION_SET_VERSION).toBe(
      TYPED_JUDGMENT_QUESTION_SET_VERSION,
    );
  });
});

describe('question set', () => {
  it('defines exactly the six questions, in canonical order, in one module', () => {
    expect(TYPED_JUDGMENT_QUESTIONS.map((q) => q.id)).toEqual([
      ...TYPED_JUDGMENT_QUESTION_IDS,
    ]);
    expect(TYPED_JUDGMENT_QUESTION_IDS).toEqual([
      'task_kind',
      'capability_deserved',
      'needs_deep_reasoning',
      'code_gen',
      'tool_use',
      'destructive',
    ]);
  });

  it('task_kind is a choice question with the ten anchored options', () => {
    expect(TASK_KIND_QUESTION.kind).toBe('choice');
    expect(TASK_KIND_QUESTION.options).toEqual([
      'plan',
      'implement',
      'debug',
      'refactor',
      'review',
      'research',
      'explain',
      'operate',
      'write',
      'chat',
    ]);
    expect(TASK_KIND_OPTIONS).toHaveLength(10);
    // Anchored descriptions live in the prompt, not bare labels.
    for (const option of TASK_KIND_OPTIONS) {
      expect(TASK_KIND_QUESTION.prompt).toContain(option);
    }
  });

  it('capability_deserved, code_gen, and tool_use are 4-level anchored scores', () => {
    for (const question of [
      CAPABILITY_DESERVED_QUESTION,
      CODE_GEN_QUESTION,
      TOOL_USE_QUESTION,
    ] satisfies TypedJudgmentScoreQuestion[]) {
      expect(question.kind).toBe('score');
      expect(question.anchors).toHaveLength(4);
      expect(question.anchors.map((a) => a.score)).toEqual([0, 1, 2, 3]);
      for (const anchor of question.anchors) {
        expect(anchor.description.length).toBeGreaterThan(0);
      }
    }
    expect(
      CAPABILITY_DESERVED_QUESTION.anchors.map((a) => a.description),
    ).toEqual([
      expect.stringContaining('Minimal'),
      expect.stringContaining('Standard'),
      expect.stringContaining('High'),
      expect.stringContaining('Maximum'),
    ]);
  });

  it('needs_deep_reasoning and destructive are nouls with explicit criteria', () => {
    for (const question of [
      NEEDS_DEEP_REASONING_QUESTION,
      DESTRUCTIVE_QUESTION,
    ]) {
      expect(question.kind).toBe('noul');
      expect(question.criteria_true.length).toBeGreaterThan(0);
      expect(question.criteria_false.length).toBeGreaterThan(0);
    }
  });

  it('does not include the dropped complexity question', () => {
    expect(
      TYPED_JUDGMENT_QUESTIONS.some((q) => q.id === 'complexity'),
    ).toBe(false);
  });

  it('exports a stable question-set version hash', () => {
    expect(TYPED_JUDGMENT_QUESTION_SET_VERSION).toMatch(
      /^tjq-v1-[0-9a-f]{8}$/,
    );
  });

  it('carries the pi-jev-model-router attribution in source', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'src', 'domain', 'judgment', 'questions.ts'),
      'utf8',
    );
    expect(source).toContain('pi-jev-model-router');
    expect(source).toContain('MIT');
    expect(source).toContain('Shah Rukh');
  });
});

describe('mapTypedJudgment', () => {
  const fullAnswers: TypedJudgmentAnswers = {
    task_kind: choiceAnswer('debug', 0.92),
    capability_deserved: scoreAnswer(3, 0.7),
    needs_deep_reasoning: noulAnswer(true),
    code_gen: scoreAnswer(1, 0.6),
    tool_use: scoreAnswer(2, 0.55),
    destructive: noulAnswer(false),
  };

  it('maps a complete answer set, normalizing scores by (levels - 1)', () => {
    const judgment = mapTypedJudgment(fullAnswers);

    expect(judgment.taskKind).toBe('debug');
    expect(judgment.taskKindConfidence).toBe(0.92);
    expect(judgment.capabilityDeserved).toBe(1); // 3 / (4 - 1)
    expect(judgment.deepReasoningP).toBe(1);
    expect(judgment.codeGen).toBeCloseTo(1 / 3);
    expect(judgment.toolUse).toBeCloseTo(2 / 3);
    expect(judgment.destructiveP).toBe(0);
    expect(judgment.confidences).toEqual({
      task_kind: 0.92,
      capability_deserved: 0.7,
      code_gen: 0.6,
      tool_use: 0.55,
    });
  });

  it('normalizes score 0 to 0', () => {
    const judgment = mapTypedJudgment({
      capability_deserved: scoreAnswer(0),
    });
    expect(judgment.capabilityDeserved).toBe(0);
  });

  it('maps missing answers to null fields', () => {
    const judgment: TypedJudgment = mapTypedJudgment({});
    expect(judgment).toEqual({
      taskKind: null,
      taskKindConfidence: null,
      capabilityDeserved: null,
      deepReasoningP: null,
      codeGen: null,
      toolUse: null,
      destructiveP: null,
      confidences: {},
    });
  });

  it('maps a partial answer set, leaving the rest null', () => {
    const judgment = mapTypedJudgment({
      destructive: noulAnswer(true),
    });
    expect(judgment.destructiveP).toBe(1);
    expect(judgment.taskKind).toBeNull();
    expect(judgment.capabilityDeserved).toBeNull();
  });

  it('rejects an unknown choice', () => {
    expect(() =>
      mapTypedJudgment({ task_kind: choiceAnswer('compose') }),
    ).toThrowError(TypedJudgmentError);
    expect(() =>
      mapTypedJudgment({ task_kind: choiceAnswer('compose') }),
    ).toThrowError(/unknown choice 'compose'/);
  });

  it('rejects an answer/question kind mismatch', () => {
    expect(() =>
      mapTypedJudgment({ capability_deserved: noulAnswer(true) }),
    ).toThrowError(/expected a score answer/);
    expect(() =>
      mapTypedJudgment({ destructive: scoreAnswer(1) }),
    ).toThrowError(/expected a noul answer/);
  });

  it('rejects out-of-range and non-integer scores', () => {
    for (const bad of [4, -1, 1.5, Number.NaN]) {
      expect(() =>
        mapTypedJudgment({ code_gen: scoreAnswer(bad) }),
      ).toThrowError(TypedJudgmentError);
    }
  });

  it('rejects out-of-range confidence', () => {
    expect(() =>
      mapTypedJudgment({ task_kind: choiceAnswer('chat', 1.5) }),
    ).toThrowError(/confidence out of range/);
  });

  it('rejects with kind invalid_response so callers fail open', () => {
    try {
      mapTypedJudgment({ task_kind: choiceAnswer('nope') });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TypedJudgmentError);
      expect((error as TypedJudgmentError).kind).toBe('invalid_response');
    }
  });
});
