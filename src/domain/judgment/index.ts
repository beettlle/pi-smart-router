/**
 * Typed-judgment domain module (SP-306, #185) — barrel export.
 * Pure domain: no I/O, no infrastructure dependencies.
 */

export {
  ACTIVITY_LINE_MAX_CHARS,
  ACK_DEEP_SESSION_MESSAGE_THRESHOLD,
  JUDGE_STATE_TOKEN_CAP,
  WORKSPACE_MAX_CHARS,
  buildJudgeState,
  isAcknowledgement,
  type IsAcknowledgementOptions,
  type JudgeStateOptions,
} from './judge-state.js';

export {
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
  type TaskKind,
  type TypedJudgmentSixQuestionId,
} from './questions.js';

export { mapTypedJudgment, type TypedJudgment } from './answer-mapper.js';
