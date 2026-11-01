/**
 * Typed-judgment question set (SP-306, GitHub #185 / epic #183) — constants,
 * one module, no I/O. Typed with the SP-304 question wire types
 * (`src/domain/ports/typed-judgment-port.ts`).
 *
 * Measured on local OpenJev (epic #183): a single isolated yes/no question
 * was unstable, while anchored level descriptions were stable — so every
 * ordinal question here carries anchored levels and every noul carries
 * explicit true/false criteria.
 *
 * Attribution: the level descriptions and criteria for `task_kind`,
 * `capability_deserved`, and `needs_deep_reasoning` are adapted from
 * pi-jev-model-router (`extensions/pi-jev-model-router/jev.ts` and
 * `config.ts`), MIT License, © 2026 Shah Rukh.
 * https://github.com/da-vinci-noob/pi-jev-model-router
 *
 * The `complexity` question from the reference router is deliberately
 * omitted — dropped pending the #191 eval ablation.
 */

import type {
  TypedJudgmentChoiceQuestion,
  TypedJudgmentNoulQuestion,
  TypedJudgmentQuestion,
  TypedJudgmentScoreQuestion,
} from '../ports/typed-judgment-port.js';

/** Stable ids of the six typed-judgment questions. */
export const TYPED_JUDGMENT_QUESTION_IDS = [
  'task_kind',
  'capability_deserved',
  'needs_deep_reasoning',
  'code_gen',
  'tool_use',
  'destructive',
] as const;

export type TypedJudgmentSixQuestionId =
  (typeof TYPED_JUDGMENT_QUESTION_IDS)[number];

/** The ten task-kind options, in canonical order. */
export const TASK_KIND_OPTIONS = [
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
] as const;

export type TaskKind = (typeof TASK_KIND_OPTIONS)[number];

/**
 * Per-kind descriptions embedded in the `task_kind` prompt so the judge sees
 * anchored definitions, not bare labels. Adapted from pi-jev-model-router
 * `config.ts` `TASK_KINDS` (MIT, © 2026 Shah Rukh).
 */
const TASK_KIND_DESCRIPTIONS: Readonly<Record<TaskKind, string>> = {
  plan: 'Deciding what to build, sequencing work, or designing an approach before editing',
  implement:
    'Writing or changing code, scripts, or configuration to produce a concrete result',
  write:
    'Producing prose, documentation, comments, or other non-code content from scratch',
  debug:
    'Diagnosing a failure, error, or unexpected behavior and finding its root cause',
  refactor: 'Restructuring existing code without changing intended behavior',
  review: 'Auditing code, a diff, a document, or a plan for problems and risks',
  research:
    'Searching, reading, and synthesizing external information or unfamiliar APIs',
  explain: 'Answering a question or explaining how something works',
  operate: 'Running commands, tooling, git, deploys, or environment setup',
  chat: 'Small talk, acknowledgements, or a request with no real work attached',
};

const TASK_KIND_PROMPT = [
  'Which single kind of work does `latest_user_message` ask for? Judge the work the user wants done, not the topic they mention. Read `recent_activity` when the request is a short follow-up that only makes sense in context. Pick the closest kind even when the request is ambiguous.',
  ...TASK_KIND_OPTIONS.map(
    (kind) => `- ${kind}: ${TASK_KIND_DESCRIPTIONS[kind]}`,
  ),
].join('\n');

/** `task_kind` — categorical, ten anchored options. */
export const TASK_KIND_QUESTION: TypedJudgmentChoiceQuestion = {
  id: 'task_kind',
  kind: 'choice',
  prompt: TASK_KIND_PROMPT,
  options: TASK_KIND_OPTIONS,
};

/**
 * `capability_deserved` — 4 anchored levels. Setting price aside: how much
 * model capability does this request deserve? Anchors adapted from
 * pi-jev-model-router (MIT, © 2026 Shah Rukh).
 */
export const CAPABILITY_DESERVED_QUESTION: TypedJudgmentScoreQuestion = {
  id: 'capability_deserved',
  kind: 'score',
  prompt:
    'Setting price aside entirely, how much model capability does this request deserve to get a good outcome? Judge by stakes, difficulty, and how much a stronger model would measurably improve the result.',
  anchors: [
    { score: 0, description: 'Minimal: any fast small model answers this just as well' },
    { score: 1, description: 'Standard: a competent mid-tier model is enough' },
    { score: 2, description: 'High: a strong frontier model materially improves the outcome' },
    { score: 3, description: 'Maximum: correctness matters more than cost; use the best available' },
  ],
};

/**
 * `needs_deep_reasoning` — noul with explicit true/false criteria. Criteria
 * adapted from pi-jev-model-router (MIT, © 2026 Shah Rukh).
 */
export const NEEDS_DEEP_REASONING_QUESTION: TypedJudgmentNoulQuestion = {
  id: 'needs_deep_reasoning',
  kind: 'noul',
  prompt:
    'Does answering `latest_user_message` well require extended multi-step reasoning (algorithm design, subtle debugging, proof, careful long-horizon planning) rather than recall, lookup, or a short direct edit?',
  criteria_true:
    'The work hinges on reasoning through non-obvious steps or edge cases',
  criteria_false:
    'The work is recall, lookup, formatting, or a short direct change',
};

/** `code_gen` — 4 anchored levels of code-generation demand. */
export const CODE_GEN_QUESTION: TypedJudgmentScoreQuestion = {
  id: 'code_gen',
  kind: 'score',
  prompt:
    'How much code or configuration must be written or modified to satisfy `latest_user_message` well?',
  anchors: [
    { score: 0, description: 'None: no code or configuration is written or modified' },
    { score: 1, description: 'Small: a short snippet, single-line change, or simple config value' },
    { score: 2, description: 'Moderate: a function, test, or file-scale change using familiar patterns' },
    { score: 3, description: 'Substantial: multi-file or architecturally significant code generation' },
  ],
};

/** `tool_use` — 4 anchored levels of tool-execution demand. */
export const TOOL_USE_QUESTION: TypedJudgmentScoreQuestion = {
  id: 'tool_use',
  kind: 'score',
  prompt:
    'How much tool execution (shell, file, search, or agentic tool calls) does satisfying `latest_user_message` require? Use `session` and `recent_activity` to judge whether a tool loop is already underway.',
  anchors: [
    { score: 0, description: 'None: the answer needs no tool execution' },
    { score: 1, description: 'Light: at most a couple of simple read-only tool calls' },
    { score: 2, description: 'Moderate: several tool calls or state-changing commands in a known sequence' },
    { score: 3, description: 'Heavy: long agentic tool loops, orchestration across many calls, or recovery from tool failures' },
  ],
};

/** `destructive` — noul guarding irreversible actions. */
export const DESTRUCTIVE_QUESTION: TypedJudgmentNoulQuestion = {
  id: 'destructive',
  kind: 'noul',
  prompt:
    'Could satisfying `latest_user_message` destroy, overwrite, or irreversibly modify data, state, or history?',
  criteria_true:
    'The request could delete, overwrite, or irreversibly modify data, state, or history (e.g. recursive deletes, force pushes, dropped tables, branch resets, mass edits without a checkpoint)',
  criteria_false:
    'The request is read-only, additive, or easily reversible',
};

/**
 * The six typed-judgment questions, in canonical order. This is the only
 * module that defines them — consumers import, never redefine.
 */
export const TYPED_JUDGMENT_QUESTIONS: readonly TypedJudgmentQuestion[] = [
  TASK_KIND_QUESTION,
  CAPABILITY_DESERVED_QUESTION,
  NEEDS_DEEP_REASONING_QUESTION,
  CODE_GEN_QUESTION,
  TOOL_USE_QUESTION,
  DESTRUCTIVE_QUESTION,
];

/** FNV-1a 32-bit hex — deterministic across runs, no crypto dependency. */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Stable question-set version hash. Derived deterministically from the
 * canonical serialization of {@link TYPED_JUDGMENT_QUESTIONS}; any wording,
 * option, or anchor change produces a new hash. Consumed by the #191 answer
 * cache to key cached judgments to the exact question set that produced them.
 */
export const TYPED_JUDGMENT_QUESTION_SET_VERSION = `tjq-v1-${fnv1aHex(
  JSON.stringify(TYPED_JUDGMENT_QUESTIONS),
)}`;
