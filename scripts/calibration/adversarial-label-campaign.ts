#!/usr/bin/env node
/**
 * Adversarial LLM labeling campaign harness — SP-282, GitHub #169.
 *
 * Multi-model generation + blinded LLM judges produce verifier-grade-style
 * labels with `llm_judge` provenance (SP-281 vocabulary). Replaces the
 * abandoned scripted pack-intent labeling (~94.5% positives → Sept isotonic
 * collapse) with a campaign that must clear adversarial floors before any
 * artifact is written.
 *
 * Campaign contract (issue #169):
 * - ≥2 generators (multi-model); 2–3 blinded graders at temperature 0; the
 *   generator of a response is always excluded from grading that response.
 * - Blinding: grader payloads contain exactly {prompt_text, response_text} —
 *   no generator identity, no task metadata.
 * - Floors: ≥20% genuine negatives and ≥5 distinct failure scores across the
 *   labeled set, else the campaign is INVALID (exit 1, no pack files written,
 *   report still emitted for evidence).
 * - Session-level holdout: deterministic seeded split; every row of a session
 *   lands in the same partition. Holdout rows never mix into the fit file.
 * - Labels emit as privacy-safe label-pack JSONL (features + outcome only —
 *   never prompt/response text) carrying `llm_judge` outcome signals. Judge
 *   disagreements are excluded from labels (never coerced).
 * - Optional warm-start packs (--warm-start-pack) join the FIT file only and
 *   must already carry `exclude_from_holdout_ece` (mirrors the calibration
 *   dry-run --include-excluded-in-fit rule; weak labels never reach holdout).
 *
 * Offline/deterministic mode replays recorded generations/grades
 * (--recorded); live OpenAI-compatible mode uses id=model@endpoint +
 * ADVERSARIAL_LABEL_API_KEY; pi-CLI mode (--pi-cli) drives scoped pi models
 * via `pi -p --provider/--model` (SP-288 / #169) with no OpenAI-compat key.
 * Graders always run at temperature 0 (OpenAI path). Pi-CLI omits --thinking
 * so Google models that reject MINIMAL/off still work (SP-288).
 *
 * Not part of the published npm bundle (scripts/ is outside package.json
 * "files"); this packet ships no production config/ artifacts.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  LABEL_PACK_SCHEMA_VERSION,
  collectLabelPackForbiddenKeys,
  formatLabelPackJsonl,
  loadLabelPackFile,
  type LabelPackRow,
  type LabelPackTier,
} from '../lib/label-pack-schema.js';

export const ADVERSARIAL_LABEL_SOURCE = 'adversarial-llm-judge' as const;
export const LLM_JUDGE_PROVENANCE_SIGNAL = 'llm_judge' as const;
export const WARM_START_EXCLUSION_SIGNAL = 'exclude_from_holdout_ece' as const;

export const MIN_GENERATORS = 2;
export const MIN_GRADERS = 2;
export const MAX_GRADERS = 3;
export const GRADER_TEMPERATURE = 0;
export const DEFAULT_GENERATOR_TEMPERATURE = 0.7;
export const SCORE_MIN = 0;
export const SCORE_MAX = 9;
export const DEFAULT_PASS_SCORE = 7;
export const DEFAULT_HOLDOUT_PERCENT = 20;
export const DEFAULT_SEED = 'sp-282-adversarial-labeling';
export const MIN_NEGATIVE_FRACTION = 0.2;
export const MIN_DISTINCT_FAILURE_SCORES = 5;

const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export const GRADER_SYSTEM_PROMPT =
  'You are a strict, blinded grader for coding-agent responses. ' +
  'Score the response on an integer scale of 0-9 (0 = completely wrong or harmful, ' +
  '9 = fully correct and complete). Reply with only the integer.';

export class AdversarialLabelingError extends Error {
  override readonly name = 'AdversarialLabelingError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Operator-local campaign input. prompt_text never leaves the harness. */
export interface AdversarialTask {
  readonly taskId: string;
  readonly sessionId: string;
  readonly promptText: string;
  readonly tier?: LabelPackTier;
  readonly features: Record<string, number>;
}

/**
 * Blinded grader payload — exactly these two keys, never generator identity
 * or task metadata. Enforced by assertGeneratorBlinded before every grade.
 */
export interface BlindedGraderInput {
  readonly prompt_text: string;
  readonly response_text: string;
}

/** Harness-side grading context. Never included in the grader payload. */
export interface GradingContext {
  readonly taskId: string;
  readonly generatorId: string;
}

export interface GeneratorClient {
  readonly id: string;
  /** When set, graders with the same provider/model are excluded (v1.1 A4). */
  readonly providerModel?: string;
  generate(task: AdversarialTask): Promise<string>;
}

export interface GraderClient {
  readonly id: string;
  /** When set, excluded from grading a generator with the same provider/model. */
  readonly providerModel?: string;
  grade(input: BlindedGraderInput, context: GradingContext): Promise<number>;
}

/** True when a grader must not score this generator (id or shared provider/model). */
export function isGraderExcludedForGenerator(
  grader: GraderClient,
  generator: GeneratorClient,
): boolean {
  if (grader.id === generator.id) {
    return true;
  }
  const graderModel = grader.providerModel;
  const generatorModel = generator.providerModel;
  if (
    typeof graderModel === 'string' &&
    graderModel.length > 0 &&
    typeof generatorModel === 'string' &&
    generatorModel.length > 0 &&
    graderModel === generatorModel
  ) {
    return true;
  }
  return false;
}

export interface CampaignLabeledRow {
  readonly row: LabelPackRow;
  readonly partition: 'fit' | 'holdout';
  readonly taskId: string;
  readonly generatorId: string;
  readonly graderIds: readonly string[];
  readonly judgeScore: number;
}

export interface CampaignDisagreement {
  readonly taskId: string;
  readonly generatorId: string;
  readonly graderScores: Record<string, number>;
}

export interface CampaignRunResult {
  readonly labeled: readonly CampaignLabeledRow[];
  readonly disagreements: readonly CampaignDisagreement[];
  readonly generations: number;
  readonly tasksProcessed: number;
}

export interface CampaignRunOptions {
  readonly seed?: string;
  readonly holdoutPercent?: number;
  readonly passScore?: number;
  readonly maxGradersPerGeneration?: number;
  readonly limit?: number;
}

export interface CampaignFloorOptions {
  readonly minNegativeFraction?: number;
  readonly minDistinctFailureScores?: number;
}

export interface CampaignReport {
  readonly campaign: typeof ADVERSARIAL_LABEL_SOURCE;
  readonly provenance: typeof LLM_JUDGE_PROVENANCE_SIGNAL;
  readonly seed: string;
  readonly holdout_percent: number;
  readonly pass_score: number;
  readonly floors: {
    readonly min_negative_fraction: number;
    readonly min_distinct_failure_scores: number;
  };
  readonly totals: {
    readonly tasks: number;
    readonly generations: number;
    readonly labeled: number;
    readonly disagreements: number;
    readonly negatives: number;
    readonly negative_fraction: number;
    readonly distinct_failure_scores: number;
    readonly fit_rows: number;
    readonly holdout_rows: number;
    readonly warm_start_rows: number;
  };
  readonly per_generator: Record<
    string,
    { readonly generations: number; readonly labeled: number; readonly negatives: number }
  >;
  readonly per_grader: Record<string, { readonly grades: number }>;
  readonly campaign_valid: boolean;
  readonly violations: readonly string[];
  /**
   * Judge disagreements excluded from pack labels (SP-287 human review queue).
   * Embedded so operators can adjudicate without a separate sidecar.
   */
  readonly disagreements: readonly CampaignDisagreement[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function assertClientId(id: unknown, context: string): asserts id is string {
  if (typeof id !== 'string' || !CLIENT_ID_PATTERN.test(id)) {
    throw new AdversarialLabelingError(
      `Invalid client id ${String(id)} (${context}); expected ${CLIENT_ID_PATTERN}`,
    );
  }
}

function assertUniqueIds(clients: readonly { id: string }[], kind: string): void {
  const seen = new Set<string>();
  for (const client of clients) {
    if (seen.has(client.id)) {
      throw new AdversarialLabelingError(`Duplicate ${kind} id "${client.id}"`);
    }
    seen.add(client.id);
  }
}

/** Deterministic seeded session-level holdout assignment. */
export function assignSessionHoldout(
  sessionId: string,
  seed: string,
  holdoutPercent: number,
): boolean {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new AdversarialLabelingError('sessionId must be a non-empty string');
  }
  if (!Number.isFinite(holdoutPercent) || holdoutPercent < 0 || holdoutPercent > 100) {
    throw new AdversarialLabelingError(
      `holdoutPercent must be within [0, 100]; got ${String(holdoutPercent)}`,
    );
  }
  const digest = createHash('sha256').update(`${seed}:${sessionId}`).digest();
  return digest.readUInt32BE(0) % 100 < holdoutPercent;
}

/**
 * Blinding contract: the grader payload contains exactly prompt_text and
 * response_text — never generator identity or task metadata.
 */
export function assertGeneratorBlinded(input: BlindedGraderInput, generatorId: string): void {
  assertClientId(generatorId, 'assertGeneratorBlinded');
  const keys = Object.keys(input).sort();
  if (keys.length !== 2 || keys[0] !== 'prompt_text' || keys[1] !== 'response_text') {
    throw new AdversarialLabelingError(
      `Blinded grader input must contain exactly prompt_text and response_text; got [${keys.join(', ')}]`,
    );
  }
}

/** Fail loud on non-integer / out-of-range grader scores — never coerce. */
export function normalizeGraderScore(raw: unknown, context: string): number {
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < SCORE_MIN ||
    raw > SCORE_MAX
  ) {
    throw new AdversarialLabelingError(
      `Grader score must be an integer ${SCORE_MIN}–${SCORE_MAX} (${context}); got ${String(raw)}`,
    );
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Task input parsing (operator-local; prompt_text never emitted)
// ---------------------------------------------------------------------------

const TASK_TIERS: readonly string[] = ['zero-tier', 'economical-cloud', 'frontier-cloud'];

export function parseAdversarialTaskLine(
  line: string,
  context: string,
): AdversarialTask | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch (error) {
    throw new AdversarialLabelingError(`Invalid JSON in task line (${context})`, {
      cause: error,
    });
  }
  if (!isPlainObject(raw)) {
    throw new AdversarialLabelingError(`Task line must be a JSON object (${context})`);
  }

  const taskId = raw.task_id;
  const sessionId = raw.session_id;
  const promptText = raw.prompt_text;
  if (typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw new AdversarialLabelingError(`Task requires non-empty task_id (${context})`);
  }
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    throw new AdversarialLabelingError(`Task requires non-empty session_id (${context})`);
  }
  if (typeof promptText !== 'string' || promptText.trim().length === 0) {
    throw new AdversarialLabelingError(`Task requires non-empty prompt_text (${context})`);
  }

  let tier: LabelPackTier | undefined;
  if (raw.tier !== undefined) {
    if (typeof raw.tier !== 'string' || !TASK_TIERS.includes(raw.tier)) {
      throw new AdversarialLabelingError(
        `Task tier must be one of ${TASK_TIERS.join('|')} (${context})`,
      );
    }
    tier = raw.tier as LabelPackTier;
  }

  if (!isPlainObject(raw.features)) {
    throw new AdversarialLabelingError(
      `Task requires a features object of finite numbers (${context})`,
    );
  }
  const forbidden = collectLabelPackForbiddenKeys({ features: raw.features });
  if (forbidden.length > 0) {
    throw new AdversarialLabelingError(
      `Task features contain tainted keys (${context}): ${forbidden.join(', ')}`,
    );
  }
  const features: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.features)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new AdversarialLabelingError(
        `Task feature "${key}" must be a finite number (${context})`,
      );
    }
    features[key] = value;
  }
  if (Object.keys(features).length === 0) {
    throw new AdversarialLabelingError(`Task features must be non-empty (${context})`);
  }

  return {
    taskId: taskId.trim(),
    sessionId: sessionId.trim(),
    promptText,
    ...(tier ? { tier } : {}),
    features,
  };
}

export function loadAdversarialTasks(text: string, sourceLabel = 'tasks'): AdversarialTask[] {
  const tasks: AdversarialTask[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const task = parseAdversarialTaskLine(lines[i]!, `${sourceLabel}:${i + 1}`);
    if (task === null) {
      continue;
    }
    if (seen.has(task.taskId)) {
      throw new AdversarialLabelingError(
        `Duplicate task_id "${task.taskId}" (${sourceLabel}:${i + 1})`,
      );
    }
    seen.add(task.taskId);
    tasks.push(task);
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Campaign runner
// ---------------------------------------------------------------------------

export async function runAdversarialLabelingCampaign(
  tasks: readonly AdversarialTask[],
  generators: readonly GeneratorClient[],
  graders: readonly GraderClient[],
  options: CampaignRunOptions = {},
): Promise<CampaignRunResult> {
  if (generators.length < MIN_GENERATORS) {
    throw new AdversarialLabelingError(
      `Adversarial campaign requires ≥${MIN_GENERATORS} generators (multi-model); got ${generators.length}`,
    );
  }
  if (graders.length < MIN_GRADERS || graders.length > MAX_GRADERS) {
    throw new AdversarialLabelingError(
      `Adversarial campaign requires ${MIN_GRADERS}–${MAX_GRADERS} blinded graders; got ${graders.length}`,
    );
  }
  for (const generator of generators) {
    assertClientId(generator.id, 'generator');
  }
  for (const grader of graders) {
    assertClientId(grader.id, 'grader');
  }
  assertUniqueIds(generators, 'generator');
  assertUniqueIds(graders, 'grader');

  const seed = options.seed ?? DEFAULT_SEED;
  const holdoutPercent = options.holdoutPercent ?? DEFAULT_HOLDOUT_PERCENT;
  if (!Number.isFinite(holdoutPercent) || holdoutPercent < 0 || holdoutPercent > 100) {
    throw new AdversarialLabelingError(
      `holdoutPercent must be within [0, 100]; got ${String(holdoutPercent)}`,
    );
  }
  const passScore = options.passScore ?? DEFAULT_PASS_SCORE;
  if (!Number.isInteger(passScore) || passScore <= SCORE_MIN || passScore > SCORE_MAX) {
    throw new AdversarialLabelingError(
      `passScore must be an integer in (${SCORE_MIN}, ${SCORE_MAX}]; got ${String(passScore)}`,
    );
  }
  const maxGraders = options.maxGradersPerGeneration ?? MAX_GRADERS;
  if (!Number.isInteger(maxGraders) || maxGraders < MIN_GRADERS || maxGraders > MAX_GRADERS) {
    throw new AdversarialLabelingError(
      `maxGradersPerGeneration must be an integer ${MIN_GRADERS}–${MAX_GRADERS}; got ${String(maxGraders)}`,
    );
  }

  const selected =
    options.limit !== undefined && options.limit >= 0 ? tasks.slice(0, options.limit) : tasks;

  const labeled: CampaignLabeledRow[] = [];
  const disagreements: CampaignDisagreement[] = [];
  let generations = 0;
  let taskIndex = 0;

  for (const task of selected) {
    taskIndex += 1;
    console.error(`[campaign] task ${taskIndex}/${selected.length} ${task.taskId}`);
    for (const generator of generators) {
      const responseText = await generator.generate(task);
      if (typeof responseText !== 'string' || responseText.trim().length === 0) {
        throw new AdversarialLabelingError(
          `Generator ${generator.id} returned an empty response for task ${task.taskId} — never invent labels`,
        );
      }
      generations += 1;

      // Generator exclusion: same client id or same provider/model never grades it.
      const eligible = graders.filter(
        (grader) => !isGraderExcludedForGenerator(grader, generator),
      );
      if (eligible.length < MIN_GRADERS) {
        throw new AdversarialLabelingError(
          `Generator exclusion leaves fewer than ${MIN_GRADERS} graders for task ${task.taskId} ` +
            `(generator ${generator.id}` +
            (generator.providerModel !== undefined
              ? ` model ${generator.providerModel}`
              : '') +
            `); add an independent grader`,
        );
      }
      const used = eligible.slice(0, maxGraders);

      const blinded: BlindedGraderInput = {
        prompt_text: task.promptText,
        response_text: responseText,
      };
      assertGeneratorBlinded(blinded, generator.id);

      const graderScores: Record<string, number> = {};
      for (const grader of used) {
        graderScores[grader.id] = normalizeGraderScore(
          await grader.grade(blinded, { taskId: task.taskId, generatorId: generator.id }),
          `grader ${grader.id} task ${task.taskId} generator ${generator.id}`,
        );
      }

      const votes = used.map((grader) => graderScores[grader.id]! >= passScore);
      const agreed = votes.every((vote) => vote === votes[0]);
      if (!agreed) {
        // Disagreement → excluded from labels, never coerced to a majority vote.
        disagreements.push({
          taskId: task.taskId,
          generatorId: generator.id,
          graderScores: { ...graderScores },
        });
        continue;
      }

      const success = votes[0]!;
      const scores = used.map((grader) => graderScores[grader.id]!);
      const judgeScore = round1(scores.reduce((sum, score) => sum + score, 0) / scores.length);
      const holdout = assignSessionHoldout(task.sessionId, seed, holdoutPercent);

      const outcomeSignals = [
        LLM_JUDGE_PROVENANCE_SIGNAL,
        `generator:${generator.id}`,
        ...used.map((grader) => `grader:${grader.id}`),
        used.length === MIN_GRADERS ? 'dual_judge_agreement' : 'multi_judge_agreement',
        `judge_score:${judgeScore}`,
        ...(success ? [] : [`failure_score:${judgeScore}`]),
        holdout ? 'session_holdout' : 'session_fit',
      ];

      const row: LabelPackRow = {
        schema_version: LABEL_PACK_SCHEMA_VERSION,
        sample_id: `${ADVERSARIAL_LABEL_SOURCE}:${sha256Hex(`${task.taskId}|${generator.id}`).slice(0, 16)}`,
        source: ADVERSARIAL_LABEL_SOURCE,
        features: { ...task.features },
        success,
        ...(task.tier ? { tier: task.tier } : {}),
        outcome_signals: outcomeSignals,
      };

      labeled.push({
        row,
        partition: holdout ? 'holdout' : 'fit',
        taskId: task.taskId,
        generatorId: generator.id,
        graderIds: used.map((grader) => grader.id),
        judgeScore,
      });
    }
  }

  return { labeled, disagreements, generations, tasksProcessed: selected.length };
}

// ---------------------------------------------------------------------------
// Campaign floors (issue #169 acceptance gates)
// ---------------------------------------------------------------------------

export function validateCampaignFloors(
  labeled: readonly CampaignLabeledRow[],
  options: CampaignFloorOptions = {},
): string[] {
  const minNegativeFraction = options.minNegativeFraction ?? MIN_NEGATIVE_FRACTION;
  const minDistinctFailureScores =
    options.minDistinctFailureScores ?? MIN_DISTINCT_FAILURE_SCORES;

  const violations: string[] = [];
  if (labeled.length === 0) {
    violations.push('campaign produced no labeled rows (all disagreements or no tasks)');
    return violations;
  }

  const negatives = labeled.filter((entry) => !entry.row.success);
  const negativeFraction = negatives.length / labeled.length;
  if (negativeFraction < minNegativeFraction) {
    violations.push(
      `negative fraction ${negativeFraction.toFixed(3)} below floor ${minNegativeFraction} ` +
        `(${negatives.length}/${labeled.length}) — #169 requires ≥20% genuine negatives`,
    );
  }

  const distinctFailureScores = new Set(negatives.map((entry) => entry.judgeScore));
  if (distinctFailureScores.size < minDistinctFailureScores) {
    violations.push(
      `distinct failure scores ${distinctFailureScores.size} below floor ${minDistinctFailureScores} ` +
        `(scores: ${[...distinctFailureScores].sort((a, b) => a - b).join(', ') || 'none'})`,
    );
  }

  return violations;
}

export function buildCampaignReport(
  run: CampaignRunResult,
  options: {
    seed: string;
    holdoutPercent: number;
    passScore: number;
    minNegativeFraction: number;
    minDistinctFailureScores: number;
    warmStartRows: number;
  },
): CampaignReport {
  const negatives = run.labeled.filter((entry) => !entry.row.success);
  const distinctFailureScores = new Set(negatives.map((entry) => entry.judgeScore));
  const violations = validateCampaignFloors(run.labeled, {
    minNegativeFraction: options.minNegativeFraction,
    minDistinctFailureScores: options.minDistinctFailureScores,
  });

  const perGenerator: Record<string, { generations: number; labeled: number; negatives: number }> =
    {};
  for (const entry of run.labeled) {
    const stats = (perGenerator[entry.generatorId] ??= {
      generations: 0,
      labeled: 0,
      negatives: 0,
    });
    stats.labeled += 1;
    if (!entry.row.success) {
      stats.negatives += 1;
    }
  }
  for (const disagreement of run.disagreements) {
    const stats = (perGenerator[disagreement.generatorId] ??= {
      generations: 0,
      labeled: 0,
      negatives: 0,
    });
    stats.generations += 1;
  }
  for (const stats of Object.values(perGenerator)) {
    stats.generations += stats.labeled;
  }

  const perGrader: Record<string, { grades: number }> = {};
  for (const entry of run.labeled) {
    for (const graderId of entry.graderIds) {
      const stats = (perGrader[graderId] ??= { grades: 0 });
      stats.grades += 1;
    }
  }
  for (const disagreement of run.disagreements) {
    for (const graderId of Object.keys(disagreement.graderScores)) {
      const stats = (perGrader[graderId] ??= { grades: 0 });
      stats.grades += 1;
    }
  }

  return {
    campaign: ADVERSARIAL_LABEL_SOURCE,
    provenance: LLM_JUDGE_PROVENANCE_SIGNAL,
    seed: options.seed,
    holdout_percent: options.holdoutPercent,
    pass_score: options.passScore,
    floors: {
      min_negative_fraction: options.minNegativeFraction,
      min_distinct_failure_scores: options.minDistinctFailureScores,
    },
    totals: {
      tasks: run.tasksProcessed,
      generations: run.generations,
      labeled: run.labeled.length,
      disagreements: run.disagreements.length,
      negatives: negatives.length,
      negative_fraction:
        run.labeled.length === 0 ? 0 : round1(negatives.length / run.labeled.length * 1000) / 1000,
      distinct_failure_scores: distinctFailureScores.size,
      fit_rows: run.labeled.filter((entry) => entry.partition === 'fit').length,
      holdout_rows: run.labeled.filter((entry) => entry.partition === 'holdout').length,
      warm_start_rows: options.warmStartRows,
    },
    per_generator: perGenerator,
    per_grader: perGrader,
    campaign_valid: violations.length === 0,
    violations,
    disagreements: run.disagreements,
  };
}

// ---------------------------------------------------------------------------
// Recorded clients (deterministic offline mode)
// ---------------------------------------------------------------------------

export interface RecordedGenerationEntry {
  readonly kind: 'generation';
  readonly task_id: string;
  readonly client_id: string;
  readonly response_text: string;
}

export interface RecordedGradeEntry {
  readonly kind: 'grade';
  readonly task_id: string;
  readonly client_id: string;
  /** Replay routing metadata only — never included in the grader payload. */
  readonly generator_id: string;
  readonly score: number;
}

export type RecordedEntry = RecordedGenerationEntry | RecordedGradeEntry;

export function parseRecordedEntries(jsonl: string, sourceLabel = 'recorded'): RecordedEntry[] {
  const entries: RecordedEntry[] = [];
  const lines = jsonl.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const context = `${sourceLabel}:${i + 1}`;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch (error) {
      throw new AdversarialLabelingError(`Invalid JSON in recorded line (${context})`, {
        cause: error,
      });
    }
    if (!isPlainObject(raw)) {
      throw new AdversarialLabelingError(`Recorded line must be a JSON object (${context})`);
    }
    if (raw.kind === 'generation') {
      if (
        typeof raw.task_id !== 'string' ||
        typeof raw.client_id !== 'string' ||
        typeof raw.response_text !== 'string'
      ) {
        throw new AdversarialLabelingError(
          `Recorded generation requires task_id, client_id, response_text (${context})`,
        );
      }
      entries.push({
        kind: 'generation',
        task_id: raw.task_id,
        client_id: raw.client_id,
        response_text: raw.response_text,
      });
    } else if (raw.kind === 'grade') {
      if (
        typeof raw.task_id !== 'string' ||
        typeof raw.client_id !== 'string' ||
        typeof raw.generator_id !== 'string'
      ) {
        throw new AdversarialLabelingError(
          `Recorded grade requires task_id, client_id, generator_id (${context})`,
        );
      }
      entries.push({
        kind: 'grade',
        task_id: raw.task_id,
        client_id: raw.client_id,
        generator_id: raw.generator_id,
        score: normalizeGraderScore(raw.score, context),
      });
    } else {
      throw new AdversarialLabelingError(
        `Recorded entry kind must be generation|grade (${context})`,
      );
    }
  }
  return entries;
}

export function createRecordedGenerator(
  id: string,
  entries: readonly RecordedEntry[],
): GeneratorClient {
  assertClientId(id, 'recorded generator');
  const responses = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind === 'generation' && entry.client_id === id) {
      responses.set(entry.task_id, entry.response_text);
    }
  }
  return {
    id,
    async generate(task) {
      const response = responses.get(task.taskId);
      if (response === undefined) {
        throw new AdversarialLabelingError(
          `Recorded generation missing for task ${task.taskId} generator ${id} — never invent labels`,
        );
      }
      return response;
    },
  };
}

export function createRecordedGrader(
  id: string,
  entries: readonly RecordedEntry[],
): GraderClient {
  assertClientId(id, 'recorded grader');
  const scores = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === 'grade' && entry.client_id === id) {
      scores.set(`${entry.task_id}|${entry.generator_id}`, entry.score);
    }
  }
  return {
    id,
    async grade(input, context) {
      assertGeneratorBlinded(input, context.generatorId);
      const score = scores.get(`${context.taskId}|${context.generatorId}`);
      if (score === undefined) {
        throw new AdversarialLabelingError(
          `Recorded grade missing for task ${context.taskId} grader ${id} generator ${context.generatorId} — never invent labels`,
        );
      }
      return score;
    },
  };
}

// ---------------------------------------------------------------------------
// Live clients (OpenAI-compatible chat endpoints; graders pinned to temp 0)
// ---------------------------------------------------------------------------

export interface LiveClientConfig {
  readonly id: string;
  readonly model: string;
  readonly endpoint: string;
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
}

interface ChatMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

async function postChatCompletion(
  config: LiveClientConfig,
  messages: readonly ChatMessage[],
  temperature: number,
  context: string,
): Promise<string> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AdversarialLabelingError(`No fetch implementation available (${context})`);
  }
  const url = `${config.endpoint.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      messages,
    }),
  });
  if (!response.ok) {
    throw new AdversarialLabelingError(
      `Chat completion failed (${context}): HTTP ${response.status} from ${url}`,
    );
  }
  const payload: unknown = await response.json();
  if (!isPlainObject(payload) || !Array.isArray(payload.choices)) {
    throw new AdversarialLabelingError(
      `Chat completion response missing choices array (${context})`,
    );
  }
  const first: unknown = payload.choices[0];
  if (!isPlainObject(first) || !isPlainObject(first.message)) {
    throw new AdversarialLabelingError(
      `Chat completion response missing choices[0].message (${context})`,
    );
  }
  const content: unknown = first.message.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new AdversarialLabelingError(
      `Chat completion returned empty content (${context}) — never invent labels`,
    );
  }
  return content;
}

export function createOpenAiCompatibleGenerator(
  config: LiveClientConfig,
  temperature: number = DEFAULT_GENERATOR_TEMPERATURE,
): GeneratorClient {
  assertClientId(config.id, 'live generator');
  return {
    id: config.id,
    providerModel: config.model,
    async generate(task) {
      return postChatCompletion(
        config,
        [{ role: 'user', content: task.promptText }],
        temperature,
        `generator ${config.id} task ${task.taskId}`,
      );
    },
  };
}

export function createOpenAiCompatibleGrader(config: LiveClientConfig): GraderClient {
  assertClientId(config.id, 'live grader');
  return {
    id: config.id,
    providerModel: config.model,
    async grade(input, context) {
      // Blinding: payload contains only prompt + response text. No generator
      // identity, no task metadata — context is harness-side routing only.
      assertGeneratorBlinded(input, context.generatorId);
      const content = await postChatCompletion(
        config,
        [
          { role: 'system', content: GRADER_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `## Task\n${input.prompt_text}\n\n## Response\n${input.response_text}\n\n` +
              'Score (integer 0-9):',
          },
        ],
        GRADER_TEMPERATURE,
        `grader ${config.id} task ${context.taskId}`,
      );
      const match = content.match(/[0-9]/);
      if (match === null) {
        throw new AdversarialLabelingError(
          `Grader ${config.id} returned an unparseable score for task ${context.taskId} — never invent labels`,
        );
      }
      return normalizeGraderScore(
        Number.parseInt(match[0], 10),
        `grader ${config.id} task ${context.taskId}`,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface AdversarialCampaignArgs {
  readonly input?: string;
  readonly output?: string;
  readonly holdoutOutput?: string;
  readonly report?: string;
  readonly recorded?: string;
  readonly generators: string[];
  readonly graders: string[];
  readonly warmStartPacks: string[];
  readonly seed: string;
  readonly holdoutPercent: number;
  readonly passScore: number;
  readonly limit?: number;
  readonly help: boolean;
  /** SP-288: drive clients via pi CLI instead of OpenAI-compat HTTP. */
  readonly piCli: boolean;
  /** SP-288: auto-pick gens/graders from pi enabledModels. */
  readonly fromScopedModels: boolean;
  /** SP-288: override path to pi agent settings.json. */
  readonly piSettings?: string;
  /** SP-288: per-call pi CLI timeout in ms (default from pi-cli-clients). */
  readonly piTimeoutMs?: number;
}

const USAGE = `Usage: tsx scripts/calibration/adversarial-label-campaign.ts [options]

Adversarial LLM labeling campaign (SP-282 / #169): multi-model generate,
2-3 blinded graders (temp 0, generator excluded), >=20% negatives and >=5
distinct failure scores floors, session-level holdout, llm_judge provenance.

Required:
  --input <tasks.jsonl>           Campaign tasks ({task_id, session_id, prompt_text, features, tier?})
  --output <fit.jsonl>            Fit-partition label pack (llm_judge rows)
  --holdout-output <holdout.jsonl> Session-holdout label pack
  --report <report.json>          Campaign report (always written)

Clients (pick one mode):
  --recorded <recorded.jsonl>     Offline replay; --generator/--grader take plain ids
  --generator <id=model@endpoint> Live OpenAI-compat generator (repeatable; >=2)
  --grader <id=model@endpoint>    Live OpenAI-compat grader (repeatable; 2-3, temp 0)
  OpenAI-compat live mode reads ADVERSARIAL_LABEL_API_KEY from the environment.

  --pi-cli                        Live via pi CLI (SP-288); specs are id=provider/model
  --from-scoped-models            Auto-pick 2 gens + 2 graders from pi enabledModels
                                  (excludes smart-router/* and cursor/auto as grader)
  --pi-settings <path>            Override ~/.pi/agent/settings.json (or PI_AGENT_SETTINGS)
  --pi-timeout-ms <n>             Per-call pi CLI timeout (default 300000)

Options:
  --warm-start-pack <pack.jsonl>  Weak pack appended to FIT only (repeatable);
                                  rows must carry exclude_from_holdout_ece
  --seed <s>                      Holdout split seed (default ${DEFAULT_SEED})
  --holdout-percent <n>           Session holdout percent (default ${DEFAULT_HOLDOUT_PERCENT})
  --pass-score <n>                Grader pass threshold 1-${SCORE_MAX} (default ${DEFAULT_PASS_SCORE})
  --limit <n>                     Process at most n tasks
  --help                          Show this help
`;

function parseNumberFlag(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AdversarialLabelingError(`--${flag} expects a number; got "${value}"`);
  }
  return parsed;
}

export function parseAdversarialCampaignArgs(argv: readonly string[]): AdversarialCampaignArgs {
  const generators: string[] = [];
  const graders: string[] = [];
  const warmStartPacks: string[] = [];
  let input: string | undefined;
  let output: string | undefined;
  let holdoutOutput: string | undefined;
  let report: string | undefined;
  let recorded: string | undefined;
  let seed = DEFAULT_SEED;
  let holdoutPercent = DEFAULT_HOLDOUT_PERCENT;
  let passScore = DEFAULT_PASS_SCORE;
  let limit: number | undefined;
  let help = false;
  let piCli = false;
  let fromScopedModels = false;
  let piSettings: string | undefined;
  let piTimeoutMs: number | undefined;

  const takeValue = (args: readonly string[], index: number, flag: string): string => {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new AdversarialLabelingError(`--${flag} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--input') {
      input = takeValue(argv, i, 'input');
      i += 1;
    } else if (arg === '--output') {
      output = takeValue(argv, i, 'output');
      i += 1;
    } else if (arg === '--holdout-output') {
      holdoutOutput = takeValue(argv, i, 'holdout-output');
      i += 1;
    } else if (arg === '--report') {
      report = takeValue(argv, i, 'report');
      i += 1;
    } else if (arg === '--recorded') {
      recorded = takeValue(argv, i, 'recorded');
      i += 1;
    } else if (arg === '--generator') {
      generators.push(takeValue(argv, i, 'generator'));
      i += 1;
    } else if (arg === '--grader') {
      graders.push(takeValue(argv, i, 'grader'));
      i += 1;
    } else if (arg === '--warm-start-pack') {
      warmStartPacks.push(takeValue(argv, i, 'warm-start-pack'));
      i += 1;
    } else if (arg === '--seed') {
      seed = takeValue(argv, i, 'seed');
      i += 1;
    } else if (arg === '--holdout-percent') {
      holdoutPercent = parseNumberFlag(takeValue(argv, i, 'holdout-percent'), 'holdout-percent');
      i += 1;
    } else if (arg === '--pass-score') {
      passScore = parseNumberFlag(takeValue(argv, i, 'pass-score'), 'pass-score');
      i += 1;
    } else if (arg === '--limit') {
      limit = parseNumberFlag(takeValue(argv, i, 'limit'), 'limit');
      i += 1;
    } else if (arg === '--pi-cli') {
      piCli = true;
    } else if (arg === '--from-scoped-models') {
      fromScopedModels = true;
    } else if (arg === '--pi-settings') {
      piSettings = takeValue(argv, i, 'pi-settings');
      i += 1;
    } else if (arg === '--pi-timeout-ms') {
      piTimeoutMs = parseNumberFlag(takeValue(argv, i, 'pi-timeout-ms'), 'pi-timeout-ms');
      i += 1;
    } else {
      throw new AdversarialLabelingError(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }

  if (piTimeoutMs !== undefined) {
    if (!Number.isInteger(piTimeoutMs) || piTimeoutMs < 1_000) {
      throw new AdversarialLabelingError(
        `--pi-timeout-ms must be an integer >= 1000; got ${String(piTimeoutMs)}`,
      );
    }
  }

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(holdoutOutput !== undefined ? { holdoutOutput } : {}),
    ...(report !== undefined ? { report } : {}),
    ...(recorded !== undefined ? { recorded } : {}),
    generators,
    graders,
    warmStartPacks,
    seed,
    holdoutPercent,
    passScore,
    ...(limit !== undefined ? { limit } : {}),
    help,
    piCli,
    fromScopedModels,
    ...(piSettings !== undefined ? { piSettings } : {}),
    ...(piTimeoutMs !== undefined ? { piTimeoutMs } : {}),
  };
}

interface LiveSpec {
  readonly id: string;
  readonly model: string;
  readonly endpoint: string;
}

/** Parse `id=model@endpoint` (live) or plain `id` (recorded mode). */
export function parseClientSpec(spec: string): LiveSpec | { readonly id: string } {
  const eq = spec.indexOf('=');
  if (eq === -1) {
    assertClientId(spec, 'client spec');
    return { id: spec };
  }
  const id = spec.slice(0, eq);
  const rest = spec.slice(eq + 1);
  const at = rest.lastIndexOf('@');
  if (at <= 0 || at === rest.length - 1) {
    throw new AdversarialLabelingError(
      `Client spec must be id=model@endpoint; got "${spec}"`,
    );
  }
  assertClientId(id, 'client spec');
  return { id, model: rest.slice(0, at), endpoint: rest.slice(at + 1) };
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writePackFile(path: string, rows: readonly LabelPackRow[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatLabelPackJsonl(rows), 'utf8');
}

export async function runAdversarialCampaignCli(argv: readonly string[]): Promise<number> {
  const args = parseAdversarialCampaignArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const missing: string[] = [];
  if (args.input === undefined) missing.push('--input');
  if (args.output === undefined) missing.push('--output');
  if (args.holdoutOutput === undefined) missing.push('--holdout-output');
  if (args.report === undefined) missing.push('--report');
  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.join(', ')}\n\n${USAGE}`);
    return 1;
  }

  const recordedMode = args.recorded !== undefined;
  const piCliMode = args.piCli;

  if (recordedMode && piCliMode) {
    console.error('Cannot combine --recorded with --pi-cli.');
    return 1;
  }
  if (args.fromScopedModels && !piCliMode) {
    console.error('--from-scoped-models requires --pi-cli.');
    return 1;
  }
  if (args.piSettings !== undefined && !piCliMode) {
    console.error('--pi-settings requires --pi-cli.');
    return 1;
  }

  if (!recordedMode && !piCliMode) {
    const liveSpecs = [...args.generators, ...args.graders].map(parseClientSpec);
    const anyLiveSpec = liveSpecs.some((spec) => 'model' in spec);
    if (!anyLiveSpec) {
      console.error(
        'Provide --recorded <file>, --pi-cli, or live --generator/--grader id=model@endpoint specs.',
      );
      return 1;
    }
  }

  if (recordedMode) {
    const liveSpecs = [...args.generators, ...args.graders].map(parseClientSpec);
    const anyLiveSpec = liveSpecs.some((spec) => 'model' in spec);
    if (anyLiveSpec) {
      console.error('Recorded mode takes plain client ids (no model@endpoint specs).');
      return 1;
    }
  }

  const tasks = loadAdversarialTasks(readFileSync(resolve(args.input!), 'utf8'), args.input!);

  let generators: GeneratorClient[];
  let graders: GraderClient[];
  if (recordedMode) {
    const entries = parseRecordedEntries(
      readFileSync(resolve(args.recorded!), 'utf8'),
      args.recorded!,
    );
    generators = args.generators.map((spec) => {
      const parsed = parseClientSpec(spec);
      return createRecordedGenerator(parsed.id, entries);
    });
    graders = args.graders.map((spec) => {
      const parsed = parseClientSpec(spec);
      return createRecordedGrader(parsed.id, entries);
    });
  } else if (piCliMode) {
    const {
      assertPiCliGraderAllowed,
      createPiCliGenerator,
      createPiCliGrader,
      defaultPiAgentSettingsPath,
      loadPiEnabledModels,
      parsePiCliClientSpec,
      pickScopedCampaignClients,
    } = await import('./pi-cli-clients.js');
    type PiModelRef = import('./pi-cli-clients.js').PiModelRef;
    let generatorRefs: PiModelRef[];
    let graderRefs: PiModelRef[];
    const hasExplicit = args.generators.length > 0 || args.graders.length > 0;
    if (args.fromScopedModels && !hasExplicit) {
      const settingsPath = args.piSettings ?? defaultPiAgentSettingsPath();
      const enabled = loadPiEnabledModels(settingsPath);
      const picked = pickScopedCampaignClients(enabled);
      generatorRefs = [...picked.generators];
      graderRefs = [...picked.graders];
      console.error(
        `pi-cli scoped pick: generators=${generatorRefs.map((r) => `${r.id}=${r.providerModel}`).join(',')}` +
          ` graders=${graderRefs.map((r) => `${r.id}=${r.providerModel}`).join(',')}`,
      );
    } else if (hasExplicit) {
      if (args.generators.length < MIN_GENERATORS || args.graders.length < MIN_GRADERS) {
        console.error(
          `Pi-CLI mode requires ≥${MIN_GENERATORS} --generator and ≥${MIN_GRADERS} --grader ` +
            `id=provider/model specs (or --from-scoped-models alone).`,
        );
        return 1;
      }
      generatorRefs = args.generators.map(parsePiCliClientSpec);
      graderRefs = args.graders.map(parsePiCliClientSpec);
      for (const ref of graderRefs) {
        assertPiCliGraderAllowed(ref);
      }
    } else {
      console.error(
        'Pi-CLI mode requires --from-scoped-models or explicit --generator/--grader id=provider/model specs.',
      );
      return 1;
    }
    const piClientOpts =
      args.piTimeoutMs !== undefined ? { timeoutMs: args.piTimeoutMs } : undefined;
    generators = generatorRefs.map((ref) => createPiCliGenerator(ref, piClientOpts));
    graders = graderRefs.map((ref) => createPiCliGrader(ref, piClientOpts));
  } else {
    const apiKey = process.env.ADVERSARIAL_LABEL_API_KEY;
    if (apiKey === undefined || apiKey.trim().length === 0) {
      console.error('ADVERSARIAL_LABEL_API_KEY is required for OpenAI-compat live mode.');
      return 1;
    }
    const toConfig = (spec: LiveSpec | { id: string }): LiveClientConfig => {
      if (!('model' in spec) || !('endpoint' in spec)) {
        throw new AdversarialLabelingError('live mode requires id=model@endpoint specs');
      }
      return { id: spec.id, model: spec.model, endpoint: spec.endpoint, apiKey };
    };
    generators = args.generators.map((spec) =>
      createOpenAiCompatibleGenerator(toConfig(parseClientSpec(spec))),
    );
    graders = args.graders.map((spec) =>
      createOpenAiCompatibleGrader(toConfig(parseClientSpec(spec))),
    );
  }

  const run = await runAdversarialLabelingCampaign(tasks, generators, graders, {
    seed: args.seed,
    holdoutPercent: args.holdoutPercent,
    passScore: args.passScore,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  });

  // Warm-start: weak packs join the FIT partition only, and only when they
  // already carry the holdout-exclusion signal (mirrors --include-excluded-in-fit).
  const warmStartRows: LabelPackRow[] = [];
  for (const packPath of args.warmStartPacks) {
    const pack = loadLabelPackFile(resolve(packPath));
    for (const row of pack.rows) {
      const signals = row.outcome_signals ?? [];
      if (!signals.includes(WARM_START_EXCLUSION_SIGNAL)) {
        throw new AdversarialLabelingError(
          `Warm-start pack row ${row.sample_id} lacks ${WARM_START_EXCLUSION_SIGNAL} — ` +
            'weak labels must never reach holdout ECE',
        );
      }
      warmStartRows.push(row);
    }
  }

  const report = buildCampaignReport(run, {
    seed: args.seed,
    holdoutPercent: args.holdoutPercent,
    passScore: args.passScore,
    minNegativeFraction: MIN_NEGATIVE_FRACTION,
    minDistinctFailureScores: MIN_DISTINCT_FAILURE_SCORES,
    warmStartRows: warmStartRows.length,
  });

  writeJsonFile(resolve(args.report!), report);

  if (!report.campaign_valid) {
    for (const violation of report.violations) {
      console.error(`CAMPAIGN INVALID: ${violation}`);
    }
    console.error(
      'No pack artifacts written. Fix the campaign (more adversarial tasks, genuine negatives) before re-running.',
    );
    return 1;
  }

  const fitRows = [
    ...run.labeled.filter((entry) => entry.partition === 'fit').map((entry) => entry.row),
    ...warmStartRows,
  ];
  const holdoutRows = run.labeled
    .filter((entry) => entry.partition === 'holdout')
    .map((entry) => entry.row);

  writePackFile(resolve(args.output!), fitRows);
  writePackFile(resolve(args.holdoutOutput!), holdoutRows);

  console.log(
    `Campaign VALID: ${report.totals.labeled} labeled ` +
      `(${report.totals.fit_rows} fit / ${report.totals.holdout_rows} holdout` +
      (warmStartRows.length > 0 ? ` + ${warmStartRows.length} warm-start fit-only` : '') +
      `), ${report.totals.disagreements} disagreements excluded, ` +
      `negative fraction ${report.totals.negative_fraction}, ` +
      `distinct failure scores ${report.totals.distinct_failure_scores}`,
  );
  return 0;
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  process.argv[1]?.endsWith('adversarial-label-campaign.ts') ||
  process.argv[1]?.endsWith('adversarial-label-campaign.js');

if (isMain) {
  runAdversarialCampaignCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
