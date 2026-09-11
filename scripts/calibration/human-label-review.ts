#!/usr/bin/env node
/**
 * Human label review CLI — SP-287 / close #168.
 *
 * Imports privacy-safe shadow exports (telemetry-contrib / dataset JSONL) and/or
 * SP-282 campaign disagreements (+ optional task/generation context), presents
 * one queue item at a time, and emits contrib rows tagged
 * `label_provenance: human_feedback` only when the operator answers good|bad.
 *
 * Skipped items never get invented labels. Untagged legacy rows are never
 * auto-promoted — promotion only happens through an explicit review decision.
 */

import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertContribRecordSafe,
  CALIBRATION_CONTRIB_REJECT_KEYS,
  CONTRIB_TAINTED_KEY_PATTERN,
  CONTRIB_TAINTED_KEY_ALLOWLIST,
  sanitizeContribRecord,
} from '../calibration-aggregate.js';
import type { CampaignDisagreement } from './adversarial-label-campaign.js';

export const HUMAN_FEEDBACK_PROVENANCE = 'human_feedback' as const;
export const FEEDBACK_GOOD_SIGNAL = 'feedback_good' as const;
export const FEEDBACK_BAD_SIGNAL = 'feedback_bad' as const;

export type ReviewDecision = 'good' | 'bad' | 'skip' | 'quit';

export type ReviewQueueSource =
  | 'telemetry_contrib'
  | 'dataset'
  | 'campaign_disagreement';

export interface ReviewQueueItem {
  readonly id: string;
  readonly source: ReviewQueueSource;
  readonly display: {
    readonly summary: string;
    readonly responseExcerpt?: string;
    readonly signals: readonly string[];
    readonly graderScores?: Readonly<Record<string, number>>;
    readonly featureHints?: Readonly<Record<string, number | string | boolean | null>>;
  };
  /** Privacy-safe base fields copied into the emitted contrib row. */
  readonly baseRecord: Readonly<Record<string, unknown>>;
}

export interface ReviewEmitResult {
  readonly emitted: readonly Record<string, unknown>[];
  readonly skipped: number;
  readonly quitEarly: boolean;
  readonly decisions: Readonly<Record<string, Exclude<ReviewDecision, 'quit'>>>;
}

export class HumanLabelReviewError extends Error {
  override readonly name = 'HumanLabelReviewError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function shortHash(value: string): string {
  return sha256Hex(value).slice(0, 12);
}

/** Reject records that still carry prompt/message taint (fail closed). */
export function assertNoTaintedPromptKeys(
  record: Record<string, unknown>,
  context?: string,
): void {
  for (const key of Object.keys(record)) {
    if (CONTRIB_TAINTED_KEY_ALLOWLIST.includes(key)) {
      continue;
    }
    if (
      (CALIBRATION_CONTRIB_REJECT_KEYS as readonly string[]).includes(key) ||
      CONTRIB_TAINTED_KEY_PATTERN.test(key)
    ) {
      const suffix = context ? ` (${context})` : '';
      throw new HumanLabelReviewError(
        `Tainted key "${key}" rejected${suffix} — review CLI never forwards prompt/message content`,
      );
    }
  }
}

function stripFeedbackSignals(signals: readonly unknown[]): string[] {
  return signals
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .filter((s) => s !== FEEDBACK_GOOD_SIGNAL && s !== FEEDBACK_BAD_SIGNAL);
}

function readSignals(record: Record<string, unknown>): string[] {
  const raw = record.outcome_signals;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((s): s is string => typeof s === 'string' && s.length > 0);
}

function featureHintsFromRecord(
  record: Record<string, unknown>,
): Record<string, number | string | boolean | null> {
  const keys = [
    'tier',
    'selected_model_id',
    'prompt_length_chars',
    'message_count',
    'has_tool_context',
    'triage_verdict',
    'triage_cyclomatic_score',
    'p_success_cheap',
    'success_label',
  ] as const;
  const hints: Record<string, number | string | boolean | null> = {};
  for (const key of keys) {
    const value = record[key];
    if (
      typeof value === 'number' ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      hints[key] = value;
    }
  }
  return hints;
}

function stableItemId(source: ReviewQueueSource, parts: readonly string[]): string {
  return `${source}:${shortHash(parts.join('|'))}`;
}

/** Parse telemetry-contrib JSON array or JSONL into review queue items. */
export function loadTelemetryContribQueue(
  raw: string,
  options?: { readonly labeledOnly?: boolean },
): ReviewQueueItem[] {
  const labeledOnly = options?.labeledOnly ?? false;
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }

  let records: unknown[];
  if (trimmed.startsWith('[')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new HumanLabelReviewError('telemetry-contrib JSON root must be an array');
    }
    records = parsed;
  } else {
    records = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => {
        try {
          return JSON.parse(line) as unknown;
        } catch (error) {
          throw new HumanLabelReviewError(
            `Invalid JSONL at line ${index + 1}: ${(error as Error).message}`,
            { cause: error },
          );
        }
      });
  }

  const items: ReviewQueueItem[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!isPlainObject(record)) {
      throw new HumanLabelReviewError(`telemetry-contrib row ${i} must be an object`);
    }
    assertNoTaintedPromptKeys(record, `telemetry-contrib[${i}]`);

    const signals = readSignals(record);
    const hasFeedback = signals.some(
      (s) => s === FEEDBACK_GOOD_SIGNAL || s === FEEDBACK_BAD_SIGNAL,
    );
    if (labeledOnly && !hasFeedback) {
      continue;
    }

    const rowId =
      typeof record.row_id === 'string' && record.row_id.length > 0
        ? record.row_id
        : typeof record.session_id_hash === 'string'
          ? `${record.session_id_hash}:${i}`
          : `row-${i}`;

    items.push({
      id: stableItemId('telemetry_contrib', [rowId, String(i)]),
      source: 'telemetry_contrib',
      display: {
        summary:
          `telemetry row ${i + 1}` +
          (typeof record.tier === 'string' ? ` tier=${record.tier}` : '') +
          (typeof record.selected_model_id === 'string'
            ? ` model=${record.selected_model_id}`
            : '') +
          (hasFeedback ? ' [prior feedback]' : ' [unlabeled]'),
        signals,
        featureHints: featureHintsFromRecord(record),
      },
      baseRecord: { ...record },
    });
  }
  return items;
}

/**
 * Parse dataset JSONL. Prompt text is never queued — only hash + routing
 * features so review stays privacy-safe when dataset rows still carry prompts.
 */
export function loadDatasetQueue(
  raw: string,
  options?: { readonly labeledOnly?: boolean },
): ReviewQueueItem[] {
  const labeledOnly = options?.labeledOnly ?? false;
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const items: ReviewQueueItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]!);
    } catch (error) {
      throw new HumanLabelReviewError(
        `Invalid dataset JSONL at line ${i + 1}: ${(error as Error).message}`,
        { cause: error },
      );
    }
    if (!isPlainObject(parsed)) {
      throw new HumanLabelReviewError(`dataset row ${i} must be an object`);
    }

    const signals = readSignals(parsed);
    const hasFeedback = signals.some(
      (s) => s === FEEDBACK_GOOD_SIGNAL || s === FEEDBACK_BAD_SIGNAL,
    );
    if (labeledOnly && !hasFeedback) {
      continue;
    }

    // Drop tainted keys before queueing — review never forwards prompt text.
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (CONTRIB_TAINTED_KEY_ALLOWLIST.includes(key)) {
        safe[key] = value;
        continue;
      }
      if (
        (CALIBRATION_CONTRIB_REJECT_KEYS as readonly string[]).includes(key) ||
        CONTRIB_TAINTED_KEY_PATTERN.test(key)
      ) {
        continue;
      }
      safe[key] = value;
    }

    const requestId =
      typeof parsed.request_id === 'string'
        ? shortHash(parsed.request_id)
        : typeof parsed.session_id === 'string'
          ? shortHash(parsed.session_id)
          : `row-${i}`;
    const promptHash =
      typeof parsed.prompt_text === 'string'
        ? shortHash(parsed.prompt_text)
        : typeof parsed.prompt === 'string'
          ? shortHash(parsed.prompt)
          : 'no-prompt';

    items.push({
      id: stableItemId('dataset', [requestId, promptHash, String(i)]),
      source: 'dataset',
      display: {
        summary: `dataset row ${i + 1} prompt_hash=${promptHash}` +
          (typeof safe.tier === 'string' ? ` tier=${safe.tier}` : '') +
          (hasFeedback ? ' [prior feedback]' : ' [unlabeled]'),
        signals,
        featureHints: featureHintsFromRecord(safe),
      },
      baseRecord: safe,
    });
  }
  return items;
}

export interface DisagreementTaskContext {
  readonly task_id: string;
  readonly session_id?: string;
  readonly tier?: string;
  readonly features?: Record<string, number>;
  /** Optional generation text for display only — never emitted. */
  readonly response_text?: string;
  readonly prompt_text?: string;
}

/** Load disagreement queue from a campaign report (or disagreements array file). */
export function loadDisagreementQueue(
  reportRaw: string,
  tasksById?: ReadonlyMap<string, DisagreementTaskContext>,
): ReviewQueueItem[] {
  const parsed: unknown = JSON.parse(reportRaw);
  if (!isPlainObject(parsed)) {
    throw new HumanLabelReviewError('campaign report must be a JSON object');
  }

  const disagreementsRaw = parsed.disagreements;
  if (disagreementsRaw === undefined) {
    throw new HumanLabelReviewError(
      'campaign report missing disagreements[] — re-run SP-282 campaign with a build that embeds disagreements in the report (SP-287)',
    );
  }
  if (!Array.isArray(disagreementsRaw)) {
    throw new HumanLabelReviewError('report.disagreements must be an array');
  }

  const items: ReviewQueueItem[] = [];
  for (let i = 0; i < disagreementsRaw.length; i++) {
    const entry = disagreementsRaw[i];
    if (!isPlainObject(entry)) {
      throw new HumanLabelReviewError(`disagreement[${i}] must be an object`);
    }
    const taskId = entry.taskId ?? entry.task_id;
    const generatorId = entry.generatorId ?? entry.generator_id;
    const graderScores = entry.graderScores ?? entry.grader_scores;
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new HumanLabelReviewError(`disagreement[${i}] missing taskId`);
    }
    if (typeof generatorId !== 'string' || generatorId.length === 0) {
      throw new HumanLabelReviewError(`disagreement[${i}] missing generatorId`);
    }
    if (!isPlainObject(graderScores)) {
      throw new HumanLabelReviewError(`disagreement[${i}] missing graderScores object`);
    }
    const scores: Record<string, number> = {};
    for (const [graderId, score] of Object.entries(graderScores)) {
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        throw new HumanLabelReviewError(
          `disagreement[${i}] grader score for ${graderId} must be a finite number`,
        );
      }
      scores[graderId] = score;
    }

    const ctx = tasksById?.get(taskId);
    const features = ctx?.features ?? {};
    assertNoTaintedPromptKeys(features as Record<string, unknown>, `task ${taskId} features`);

    const promptHash =
      typeof ctx?.prompt_text === 'string' ? shortHash(ctx.prompt_text) : undefined;
    const responseExcerpt =
      typeof ctx?.response_text === 'string'
        ? ctx.response_text.slice(0, 240)
        : undefined;

    const baseRecord: Record<string, unknown> = {
      version: 2,
      timestamp: new Date().toISOString(),
      row_id: sha256Hex(`disagreement:${taskId}:${generatorId}`),
      session_id_hash:
        typeof ctx?.session_id === 'string'
          ? sha256Hex(ctx.session_id)
          : sha256Hex(`task-session:${taskId}`),
      turn_type: 'main_loop',
      stage: 'adversarial_disagreement_review',
      reason_code: 'human_adjudication',
      selected_model_id: generatorId,
      tier: ctx?.tier ?? 'economical-cloud',
      routing_latency_ms: 0,
      estimated_cost_usd: 0,
      estimated_input_tokens: 0,
      has_tool_context: false,
      compaction_flag: false,
      outcome_signals: [
        'llm_judge_disagreement',
        `generator:${generatorId}`,
        ...Object.keys(scores).map((id) => `grader:${id}`),
      ],
    };
    for (const [key, value] of Object.entries(features)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        baseRecord[key] = value;
      }
    }
    if (typeof features.prompt_length_chars === 'number') {
      baseRecord.prompt_length_chars = features.prompt_length_chars;
    }
    if (typeof features.message_count === 'number') {
      baseRecord.message_count = features.message_count;
    }

    items.push({
      id: stableItemId('campaign_disagreement', [taskId, generatorId]),
      source: 'campaign_disagreement',
      display: {
        summary:
          `disagreement task=${taskId} generator=${generatorId}` +
          (promptHash ? ` prompt_hash=${promptHash}` : ''),
        ...(responseExcerpt !== undefined ? { responseExcerpt } : {}),
        signals: baseRecord.outcome_signals as string[],
        graderScores: scores,
        featureHints: featureHintsFromRecord(baseRecord),
      },
      baseRecord,
    });
  }
  return items;
}

/** Parse optional task JSONL for disagreement display / feature attach. */
export function loadTaskContextMap(raw: string): Map<string, DisagreementTaskContext> {
  const map = new Map<string, DisagreementTaskContext>();
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]!);
    } catch (error) {
      throw new HumanLabelReviewError(
        `Invalid task JSONL at line ${i + 1}: ${(error as Error).message}`,
        { cause: error },
      );
    }
    if (!isPlainObject(parsed) || typeof parsed.task_id !== 'string') {
      throw new HumanLabelReviewError(`task JSONL line ${i + 1} needs task_id`);
    }
    const features =
      isPlainObject(parsed.features)
        ? Object.fromEntries(
            Object.entries(parsed.features).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number' && Number.isFinite(entry[1]),
            ),
          )
        : undefined;
    map.set(parsed.task_id, {
      task_id: parsed.task_id,
      ...(typeof parsed.session_id === 'string' ? { session_id: parsed.session_id } : {}),
      ...(typeof parsed.tier === 'string' ? { tier: parsed.tier } : {}),
      ...(features !== undefined ? { features } : {}),
      ...(typeof parsed.response_text === 'string'
        ? { response_text: parsed.response_text }
        : {}),
      ...(typeof parsed.prompt_text === 'string' ? { prompt_text: parsed.prompt_text } : {}),
    });
  }
  return map;
}

/** Build contrib row from a good|bad decision. Never called for skip. */
export function emitHumanFeedbackRow(
  item: ReviewQueueItem,
  decision: 'good' | 'bad',
): Record<string, unknown> {
  if (decision !== 'good' && decision !== 'bad') {
    throw new HumanLabelReviewError(`emit requires good|bad, got ${String(decision)}`);
  }

  const feedbackSignal =
    decision === 'good' ? FEEDBACK_GOOD_SIGNAL : FEEDBACK_BAD_SIGNAL;
  const priorSignals = readSignals(item.baseRecord as Record<string, unknown>);
  const outcome_signals = [...stripFeedbackSignals(priorSignals), feedbackSignal];

  const row: Record<string, unknown> = {
    ...item.baseRecord,
    success_label: decision === 'good',
    outcome_signals,
    label_provenance: HUMAN_FEEDBACK_PROVENANCE,
  };

  assertNoTaintedPromptKeys(row, `emit ${item.id}`);
  assertContribRecordSafe(row, `emit ${item.id}`);
  return sanitizeContribRecord(row);
}

/**
 * Derive answers from prior feedback_good/feedback_bad signals.
 * Unlabeled items become skip — never invents a polarity.
 */
export function answersFromExistingFeedback(
  items: readonly ReviewQueueItem[],
): Record<string, Exclude<ReviewDecision, 'quit'>> {
  const answers: Record<string, Exclude<ReviewDecision, 'quit'>> = {};
  for (const item of items) {
    const signals = item.display.signals;
    const hasGood = signals.includes(FEEDBACK_GOOD_SIGNAL);
    const hasBad = signals.includes(FEEDBACK_BAD_SIGNAL);
    if (hasGood && hasBad) {
      answers[item.id] = 'skip';
      continue;
    }
    if (hasGood) {
      answers[item.id] = 'good';
      continue;
    }
    if (hasBad) {
      answers[item.id] = 'bad';
      continue;
    }
    answers[item.id] = 'skip';
  }
  return answers;
}

export function parseAnswersFile(raw: string): Record<string, Exclude<ReviewDecision, 'quit'>> {
  const answers: Record<string, Exclude<ReviewDecision, 'quit'>> = {};
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const space = line.search(/\s+/);
    if (space < 0) {
      throw new HumanLabelReviewError(
        `answers line ${i + 1}: expected "<id> good|bad|skip"`,
      );
    }
    const id = line.slice(0, space).trim();
    const decision = line.slice(space).trim().toLowerCase();
    if (decision !== 'good' && decision !== 'bad' && decision !== 'skip') {
      throw new HumanLabelReviewError(
        `answers line ${i + 1}: decision must be good|bad|skip (got ${decision})`,
      );
    }
    answers[id] = decision;
  }
  return answers;
}

export function applyReviewDecisions(
  items: readonly ReviewQueueItem[],
  answers: Readonly<Record<string, Exclude<ReviewDecision, 'quit'>>>,
  options?: { readonly requireAll?: boolean },
): ReviewEmitResult {
  const emitted: Record<string, unknown>[] = [];
  const decisions: Record<string, Exclude<ReviewDecision, 'quit'>> = {};
  let skipped = 0;

  for (const item of items) {
    const decision = answers[item.id];
    if (decision === undefined) {
      if (options?.requireAll) {
        throw new HumanLabelReviewError(`missing answer for queue item ${item.id}`);
      }
      skipped += 1;
      decisions[item.id] = 'skip';
      continue;
    }
    decisions[item.id] = decision;
    if (decision === 'skip') {
      skipped += 1;
      continue;
    }
    emitted.push(emitHumanFeedbackRow(item, decision));
  }

  return { emitted, skipped, quitEarly: false, decisions };
}

export function formatQueuePrompt(item: ReviewQueueItem, index: number, total: number): string {
  const lines = [
    `--- review ${index + 1}/${total} id=${item.id} source=${item.source} ---`,
    item.display.summary,
  ];
  if (item.display.responseExcerpt) {
    lines.push(`response_excerpt: ${item.display.responseExcerpt}`);
  }
  if (item.display.signals.length > 0) {
    lines.push(`signals: ${item.display.signals.join(', ')}`);
  }
  if (item.display.graderScores) {
    lines.push(`grader_scores: ${JSON.stringify(item.display.graderScores)}`);
  }
  if (item.display.featureHints && Object.keys(item.display.featureHints).length > 0) {
    lines.push(`features: ${JSON.stringify(item.display.featureHints)}`);
  }
  lines.push('Answer: good | bad | skip | quit');
  return lines.join('\n');
}

export function writeContribJsonl(
  rows: readonly Record<string, unknown>[],
  outputPath: string,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  const body =
    rows.length === 0 ? '' : `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  writeFileSync(outputPath, body, 'utf8');
}

function parseArgs(argv: readonly string[]): {
  contrib?: string;
  dataset?: string;
  report?: string;
  tasks?: string;
  output: string;
  answers?: string;
  fromExistingFeedback: boolean;
  labeledOnly: boolean;
  limit?: number;
  dumpQueue?: string;
} {
  let contrib: string | undefined;
  let dataset: string | undefined;
  let report: string | undefined;
  let tasks: string | undefined;
  let output = 'data/contrib/shadow-human-review.jsonl';
  let answers: string | undefined;
  let fromExistingFeedback = false;
  let labeledOnly = false;
  let limit: number | undefined;
  let dumpQueue: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = (): string => {
      const value = argv[++i];
      if (value === undefined) {
        throw new HumanLabelReviewError(`Missing value after ${arg}`);
      }
      return value;
    };
    if (arg === '--contrib') {
      contrib = next();
    } else if (arg === '--dataset') {
      dataset = next();
    } else if (arg === '--report') {
      report = next();
    } else if (arg === '--tasks') {
      tasks = next();
    } else if (arg === '--output') {
      output = next();
    } else if (arg === '--answers') {
      answers = next();
    } else if (arg === '--from-existing-feedback') {
      fromExistingFeedback = true;
    } else if (arg === '--labeled-only') {
      labeledOnly = true;
    } else if (arg === '--limit') {
      limit = Number(next());
      if (!Number.isInteger(limit) || limit! < 1) {
        throw new HumanLabelReviewError('--limit must be a positive integer');
      }
    } else if (arg === '--dump-queue') {
      dumpQueue = next();
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new HumanLabelReviewError(`Unknown argument: ${arg}`);
    }
  }

  if (!contrib && !dataset && !report) {
    throw new HumanLabelReviewError(
      'Provide at least one of --contrib, --dataset, or --report',
    );
  }

  return {
    ...(contrib !== undefined ? { contrib } : {}),
    ...(dataset !== undefined ? { dataset } : {}),
    ...(report !== undefined ? { report } : {}),
    ...(tasks !== undefined ? { tasks } : {}),
    output,
    ...(answers !== undefined ? { answers } : {}),
    fromExistingFeedback,
    labeledOnly,
    ...(limit !== undefined ? { limit } : {}),
    ...(dumpQueue !== undefined ? { dumpQueue } : {}),
  };
}

function printUsage(): void {
  process.stderr.write(`Usage: npx tsx scripts/calibration/human-label-review.ts \\
  [--contrib telemetry-contrib.json|.jsonl] \\
  [--dataset dataset.jsonl] \\
  [--report adversarial-report.json] \\
  [--tasks tasks.jsonl] \\
  [--output data/contrib/shadow-human-YYYYMMDD.jsonl] \\
  [--answers answers.txt | --from-existing-feedback] \\
  [--labeled-only] [--limit N] [--dump-queue queue-ids.txt]

Interactive: omit --answers / --from-existing-feedback (TTY required).
Non-interactive: --answers "<id> good|bad|skip" lines, or --from-existing-feedback
to reaffirm prior feedback_good/feedback_bad signals (unlabeled → skip).

Emits only human_feedback provenance rows. Skip/quit never invents labels.
`);
}

async function readInteractiveDecision(
  prompt: string,
): Promise<ReviewDecision> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      const answer: string = await new Promise((resolveAnswer) => {
        rl.question(`${prompt}\n> `, resolveAnswer);
      });
      const normalized = answer.trim().toLowerCase();
      if (
        normalized === 'good' ||
        normalized === 'bad' ||
        normalized === 'skip' ||
        normalized === 'quit'
      ) {
        return normalized;
      }
      process.stderr.write('Please answer good, bad, skip, or quit.\n');
    }
  } finally {
    rl.close();
  }
}

export async function runInteractiveReview(
  items: readonly ReviewQueueItem[],
): Promise<ReviewEmitResult> {
  const emitted: Record<string, unknown>[] = [];
  const decisions: Record<string, Exclude<ReviewDecision, 'quit'>> = {};
  let skipped = 0;
  let quitEarly = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const decision = await readInteractiveDecision(
      formatQueuePrompt(item, i, items.length),
    );
    if (decision === 'quit') {
      quitEarly = true;
      break;
    }
    decisions[item.id] = decision;
    if (decision === 'skip') {
      skipped += 1;
      continue;
    }
    emitted.push(emitHumanFeedbackRow(item, decision));
  }

  return { emitted, skipped, quitEarly, decisions };
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const items: ReviewQueueItem[] = [];

  if (args.contrib) {
    const raw = readFileSync(resolve(args.contrib), 'utf8');
    items.push(
      ...loadTelemetryContribQueue(raw, { labeledOnly: args.labeledOnly }),
    );
  }
  if (args.dataset) {
    const raw = readFileSync(resolve(args.dataset), 'utf8');
    items.push(...loadDatasetQueue(raw, { labeledOnly: args.labeledOnly }));
  }
  if (args.report) {
    const tasksById =
      args.tasks !== undefined
        ? loadTaskContextMap(readFileSync(resolve(args.tasks), 'utf8'))
        : undefined;
    const raw = readFileSync(resolve(args.report), 'utf8');
    items.push(...loadDisagreementQueue(raw, tasksById));
  }

  const limited =
    args.limit !== undefined ? items.slice(0, args.limit) : items;

  if (args.dumpQueue) {
    const body = `${limited.map((item) => item.id).join('\n')}${limited.length > 0 ? '\n' : ''}`;
    mkdirSync(dirname(resolve(args.dumpQueue)), { recursive: true });
    writeFileSync(resolve(args.dumpQueue), body, 'utf8');
    process.stderr.write(
      `human-label-review: dumped ${limited.length} queue id(s) → ${args.dumpQueue}\n`,
    );
  }

  let result: ReviewEmitResult;
  if (args.fromExistingFeedback) {
    result = applyReviewDecisions(limited, answersFromExistingFeedback(limited));
  } else if (args.answers) {
    if (!existsSync(resolve(args.answers))) {
      throw new HumanLabelReviewError(`answers file not found: ${args.answers}`);
    }
    result = applyReviewDecisions(
      limited,
      parseAnswersFile(readFileSync(resolve(args.answers), 'utf8')),
    );
  } else if (process.stdin.isTTY) {
    result = await runInteractiveReview(limited);
  } else {
    throw new HumanLabelReviewError(
      'Non-TTY stdin requires --answers or --from-existing-feedback',
    );
  }

  writeContribJsonl(result.emitted, resolve(args.output));
  process.stderr.write(
    `human-label-review: emitted ${result.emitted.length} human_feedback row(s), ` +
      `skipped ${result.skipped}` +
      (result.quitEarly ? ', quit early' : '') +
      ` → ${args.output}\n`,
  );
}

const isDirect =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`human-label-review: ${message}\n`);
    process.exitCode = 1;
  });
}

export type { CampaignDisagreement };
