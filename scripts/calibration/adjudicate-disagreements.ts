#!/usr/bin/env node
/**
 * Panel adjudication for SP-282 campaign disagreements (close #168).
 *
 * Post-campaign follow-on: regenerate disagreement (task, generator) pairs,
 * blind-grade with a 3-model panel (GLM / Kimi / Gemini Pro), and append
 * majority-agreed rows as llm_judge labels with panel_adjudication signals.
 * Residuals stay for SP-287 human-label-review — never invent labels.
 *
 * Does not change the SP-282 campaign rule that in-campaign disagreements
 * are never majority-coerced.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  LABEL_PACK_SCHEMA_VERSION,
  formatLabelPackJsonl,
  loadLabelPackFile,
  parseLabelPackRow,
  type LabelPackRow,
} from '../lib/label-pack-schema.js';
import {
  ADVERSARIAL_LABEL_SOURCE,
  DEFAULT_HOLDOUT_PERCENT,
  DEFAULT_PASS_SCORE,
  DEFAULT_SEED,
  LLM_JUDGE_PROVENANCE_SIGNAL,
  AdversarialLabelingError,
  assignSessionHoldout,
  assertGeneratorBlinded,
  loadAdversarialTasks,
  normalizeGraderScore,
  type AdversarialTask,
  type BlindedGraderInput,
  type CampaignDisagreement,
  type GeneratorClient,
  type GraderClient,
} from './adversarial-label-campaign.js';
import {
  DEFAULT_PI_CLI_TIMEOUT_MS,
  createPiCliGenerator,
  createPiCliGrader,
  parsePiCliClientSpec,
  type PiModelRef,
} from './pi-cli-clients.js';

export const PANEL_ADJUDICATION_SIGNAL = 'panel_adjudication' as const;
export const PANEL_MAJORITY_SIGNAL = 'panel_majority' as const;
export const MIN_PANEL_SIZE = 3;
export const MIN_MAJORITY = 2;

/** Live-run generator map (matches successful 2026-09-12 campaign). */
export const DEFAULT_GENERATOR_SPECS = [
  'gen-0=google/gemini-3.1-pro-preview',
  'gen-1=kimi-coding/k3',
] as const;

/** Primary panel: GLM, Kimi, Gemini Pro. */
export const DEFAULT_PANEL_SPECS = [
  'panel-glm=zai/glm-5.3',
  'panel-kimi=kimi-coding/k3',
  'panel-pro=google/gemini-3.1-pro-preview',
] as const;

/** Fill when a panelist matches the generator model. */
export const DEFAULT_PANEL_FILL_SPECS = [
  'panel-fill-0=google/gemini-flash-lite-latest',
  'panel-fill-1=zai/glm-5.3-flash',
] as const;

export class AdjudicationError extends Error {
  override readonly name = 'AdjudicationError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface AdjudicationGenerationRecord {
  readonly kind: 'generation';
  readonly task_id: string;
  readonly client_id: string;
  readonly response_text: string;
  readonly provider_model: string;
}

export interface ResolvedAdjudication {
  readonly taskId: string;
  readonly generatorId: string;
  readonly generatorProviderModel: string;
  readonly panelistScores: Readonly<Record<string, number>>;
  readonly panelistModels: Readonly<Record<string, string>>;
  readonly success: boolean;
  readonly judgeScore: number;
  readonly partition: 'fit' | 'holdout';
  readonly row: LabelPackRow;
}

export interface ResidualAdjudication {
  readonly taskId: string;
  readonly generatorId: string;
  readonly reason: string;
  readonly panelistScores?: Readonly<Record<string, number>>;
  readonly originalGraderScores: Readonly<Record<string, number>>;
}

export interface AdjudicationReport {
  readonly campaign: 'panel-adjudication';
  readonly seed: string;
  readonly holdout_percent: number;
  readonly pass_score: number;
  readonly generator_models: Readonly<Record<string, string>>;
  readonly panel_models: Readonly<Record<string, string>>;
  readonly totals: {
    readonly disagreements: number;
    readonly resolved: number;
    readonly residual: number;
    readonly fit_appended: number;
    readonly holdout_appended: number;
  };
  readonly resolved: readonly ResolvedAdjudication[];
  readonly residual: readonly ResidualAdjudication[];
}

export interface AdjudicateRunOptions {
  readonly disagreements: readonly CampaignDisagreement[];
  readonly tasksById: ReadonlyMap<string, AdversarialTask>;
  readonly generators: ReadonlyMap<string, GeneratorClient>;
  readonly generatorModels: ReadonlyMap<string, string>;
  readonly panelPool: readonly PiModelRef[];
  readonly panelFill: readonly PiModelRef[];
  readonly panelGraders: ReadonlyMap<string, GraderClient>;
  readonly seed?: string;
  readonly holdoutPercent?: number;
  readonly passScore?: number;
  /**
   * Stored generations keyed by `task_id|client_id`. When present, skip
   * regenerate for hits (v1.1 A3). Missing keys regenerate unless
   * `requireStoredGenerations` is true.
   */
  readonly storedGenerations?: ReadonlyMap<string, AdjudicationGenerationRecord>;
  /** Fail loud when a stored generation is missing (default: regenerate). */
  readonly requireStoredGenerations?: boolean;
}

export interface AdjudicateRunResult {
  readonly resolved: readonly ResolvedAdjudication[];
  readonly residual: readonly ResidualAdjudication[];
  readonly generations: readonly AdjudicationGenerationRecord[];
}

export function generationLookupKey(taskId: string, clientId: string): string {
  return `${taskId}|${clientId}`;
}

/** Parse generations JSONL into a lookup map (last write wins). */
export function loadGenerationsJsonl(
  text: string,
  sourceLabel = 'generations',
): Map<string, AdjudicationGenerationRecord> {
  const map = new Map<string, AdjudicationGenerationRecord>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new AdjudicationError(
        `Invalid JSON in ${sourceLabel} line ${i + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (!isPlainObject(parsed) || parsed.kind !== 'generation') {
      throw new AdjudicationError(
        `${sourceLabel} line ${i + 1}: expected kind "generation" object`,
      );
    }
    const taskId = parsed.task_id;
    const clientId = parsed.client_id;
    const responseText = parsed.response_text;
    const providerModel = parsed.provider_model;
    if (
      typeof taskId !== 'string' ||
      typeof clientId !== 'string' ||
      typeof responseText !== 'string' ||
      typeof providerModel !== 'string'
    ) {
      throw new AdjudicationError(
        `${sourceLabel} line ${i + 1}: missing task_id/client_id/response_text/provider_model`,
      );
    }
    const record: AdjudicationGenerationRecord = {
      kind: 'generation',
      task_id: taskId,
      client_id: clientId,
      response_text: responseText,
      provider_model: providerModel,
    };
    map.set(generationLookupKey(taskId, clientId), record);
  }
  return map;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse campaign report disagreements[] (same shape as SP-287). */
export function loadDisagreementsFromReport(reportRaw: string): {
  readonly disagreements: CampaignDisagreement[];
  readonly seed: string;
  readonly holdoutPercent: number;
  readonly passScore: number;
} {
  const parsed: unknown = JSON.parse(reportRaw);
  if (!isPlainObject(parsed)) {
    throw new AdjudicationError('campaign report must be a JSON object');
  }
  const disagreementsRaw = parsed.disagreements;
  if (!Array.isArray(disagreementsRaw)) {
    throw new AdjudicationError('report.disagreements must be an array');
  }
  const disagreements: CampaignDisagreement[] = [];
  for (let i = 0; i < disagreementsRaw.length; i++) {
    const entry = disagreementsRaw[i];
    if (!isPlainObject(entry)) {
      throw new AdjudicationError(`disagreement[${i}] must be an object`);
    }
    const taskId = entry.taskId ?? entry.task_id;
    const generatorId = entry.generatorId ?? entry.generator_id;
    const graderScores = entry.graderScores ?? entry.grader_scores;
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new AdjudicationError(`disagreement[${i}] missing taskId`);
    }
    if (typeof generatorId !== 'string' || generatorId.length === 0) {
      throw new AdjudicationError(`disagreement[${i}] missing generatorId`);
    }
    if (!isPlainObject(graderScores)) {
      throw new AdjudicationError(`disagreement[${i}] missing graderScores`);
    }
    const scores: Record<string, number> = {};
    for (const [graderId, score] of Object.entries(graderScores)) {
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        throw new AdjudicationError(
          `disagreement[${i}] grader score for ${graderId} must be finite`,
        );
      }
      scores[graderId] = score;
    }
    disagreements.push({ taskId, generatorId, graderScores: scores });
  }

  const seed =
    typeof parsed.seed === 'string' && parsed.seed.length > 0
      ? parsed.seed
      : DEFAULT_SEED;
  const holdoutPercent =
    typeof parsed.holdout_percent === 'number' && Number.isFinite(parsed.holdout_percent)
      ? parsed.holdout_percent
      : DEFAULT_HOLDOUT_PERCENT;
  const passScore =
    typeof parsed.pass_score === 'number' && Number.isFinite(parsed.pass_score)
      ? parsed.pass_score
      : DEFAULT_PASS_SCORE;

  return { disagreements, seed, holdoutPercent, passScore };
}

/**
 * Build a 3-judge panel excluding any panelist whose provider/model matches
 * the generator; fill from the fill pool until MIN_PANEL_SIZE.
 */
export function selectPanelForGenerator(
  generatorProviderModel: string,
  panelPool: readonly PiModelRef[],
  fillPool: readonly PiModelRef[],
  minPanel = MIN_PANEL_SIZE,
): PiModelRef[] {
  const selected: PiModelRef[] = [];
  const usedModels = new Set<string>();
  const usedIds = new Set<string>();

  const tryAdd = (ref: PiModelRef): void => {
    if (selected.length >= minPanel) {
      return;
    }
    if (ref.providerModel === generatorProviderModel) {
      return;
    }
    if (usedModels.has(ref.providerModel) || usedIds.has(ref.id)) {
      return;
    }
    selected.push(ref);
    usedModels.add(ref.providerModel);
    usedIds.add(ref.id);
  };

  for (const ref of panelPool) {
    tryAdd(ref);
  }
  for (const ref of fillPool) {
    tryAdd(ref);
  }

  if (selected.length < minPanel) {
    throw new AdjudicationError(
      `Need ≥${minPanel} panelists after excluding generator model ` +
        `"${generatorProviderModel}"; got ${selected.length}`,
    );
  }
  return selected.slice(0, minPanel);
}

/** Majority on pass/fail booleans; null when fewer than MIN_MAJORITY usable votes or no majority. */
export function majorityDecision(
  scores: Readonly<Record<string, number>>,
  passScore: number,
): { readonly success: boolean; readonly judgeScore: number } | null {
  const entries = Object.entries(scores);
  if (entries.length < MIN_MAJORITY) {
    return null;
  }
  let successVotes = 0;
  let failVotes = 0;
  let sum = 0;
  for (const [, score] of entries) {
    sum += score;
    if (score >= passScore) {
      successVotes += 1;
    } else {
      failVotes += 1;
    }
  }
  if (successVotes >= MIN_MAJORITY) {
    return { success: true, judgeScore: round1(sum / entries.length) };
  }
  if (failVotes >= MIN_MAJORITY) {
    return { success: false, judgeScore: round1(sum / entries.length) };
  }
  return null;
}

export function buildAdjudicatedSampleId(taskId: string, generatorId: string): string {
  return `${ADVERSARIAL_LABEL_SOURCE}:${sha256Hex(`${taskId}|${generatorId}`).slice(0, 16)}`;
}

export function buildAdjudicatedRow(input: {
  readonly task: AdversarialTask;
  readonly generatorId: string;
  readonly panelistIds: readonly string[];
  readonly success: boolean;
  readonly judgeScore: number;
  readonly holdout: boolean;
}): LabelPackRow {
  const outcomeSignals = [
    LLM_JUDGE_PROVENANCE_SIGNAL,
    PANEL_ADJUDICATION_SIGNAL,
    PANEL_MAJORITY_SIGNAL,
    `generator:${input.generatorId}`,
    ...input.panelistIds.map((id) => `grader:${id}`),
    `judge_score:${input.judgeScore}`,
    ...(input.success ? [] : [`failure_score:${input.judgeScore}`]),
    input.holdout ? 'session_holdout' : 'session_fit',
  ];
  return parseLabelPackRow({
    schema_version: LABEL_PACK_SCHEMA_VERSION,
    sample_id: buildAdjudicatedSampleId(input.task.taskId, input.generatorId),
    source: ADVERSARIAL_LABEL_SOURCE,
    features: { ...input.task.features },
    success: input.success,
    ...(input.task.tier ? { tier: input.task.tier } : {}),
    outcome_signals: outcomeSignals,
  });
}

/**
 * Append rows to fit/holdout packs, skipping sample_ids already present
 * (idempotent re-runs).
 */
export function appendPackRowsDeduped(
  existingFit: readonly LabelPackRow[],
  existingHoldout: readonly LabelPackRow[],
  resolved: readonly ResolvedAdjudication[],
): {
  readonly fit: LabelPackRow[];
  readonly holdout: LabelPackRow[];
  readonly fitAppended: number;
  readonly holdoutAppended: number;
} {
  const seen = new Set<string>();
  for (const row of existingFit) {
    seen.add(row.sample_id);
  }
  for (const row of existingHoldout) {
    seen.add(row.sample_id);
  }

  const fit = [...existingFit];
  const holdout = [...existingHoldout];
  let fitAppended = 0;
  let holdoutAppended = 0;

  for (const entry of resolved) {
    if (seen.has(entry.row.sample_id)) {
      continue;
    }
    seen.add(entry.row.sample_id);
    if (entry.partition === 'holdout') {
      holdout.push(entry.row);
      holdoutAppended += 1;
    } else {
      fit.push(entry.row);
      fitAppended += 1;
    }
  }

  return { fit, holdout, fitAppended, holdoutAppended };
}

/** Core adjudication loop (injectable clients for unit tests). */
export async function runAdjudication(
  options: AdjudicateRunOptions,
): Promise<AdjudicateRunResult> {
  const seed = options.seed ?? DEFAULT_SEED;
  const holdoutPercent = options.holdoutPercent ?? DEFAULT_HOLDOUT_PERCENT;
  const passScore = options.passScore ?? DEFAULT_PASS_SCORE;

  const resolved: ResolvedAdjudication[] = [];
  const residual: ResidualAdjudication[] = [];
  const generations: AdjudicationGenerationRecord[] = [];

  for (const disagreement of options.disagreements) {
    const task = options.tasksById.get(disagreement.taskId);
    if (task === undefined) {
      residual.push({
        taskId: disagreement.taskId,
        generatorId: disagreement.generatorId,
        reason: `task ${disagreement.taskId} missing from tasks file`,
        originalGraderScores: disagreement.graderScores,
      });
      continue;
    }

    const generator = options.generators.get(disagreement.generatorId);
    const generatorProviderModel = options.generatorModels.get(disagreement.generatorId);
    if (generator === undefined || generatorProviderModel === undefined) {
      residual.push({
        taskId: disagreement.taskId,
        generatorId: disagreement.generatorId,
        reason: `no generator client/model for ${disagreement.generatorId}`,
        originalGraderScores: disagreement.graderScores,
      });
      continue;
    }

    let responseText: string;
    const storedKey = generationLookupKey(disagreement.taskId, disagreement.generatorId);
    const stored = options.storedGenerations?.get(storedKey);
    if (stored !== undefined && stored.response_text.trim().length > 0) {
      responseText = stored.response_text;
      generations.push({
        kind: 'generation',
        task_id: task.taskId,
        client_id: disagreement.generatorId,
        response_text: responseText,
        provider_model: generatorProviderModel,
      });
    } else if (options.requireStoredGenerations === true) {
      residual.push({
        taskId: disagreement.taskId,
        generatorId: disagreement.generatorId,
        reason: `stored generation missing for ${storedKey} (--require-stored-generations)`,
        originalGraderScores: disagreement.graderScores,
      });
      continue;
    } else {
      try {
        responseText = await generator.generate(task);
      } catch (error) {
        residual.push({
          taskId: disagreement.taskId,
          generatorId: disagreement.generatorId,
          reason: `generation failed: ${error instanceof Error ? error.message : String(error)}`,
          originalGraderScores: disagreement.graderScores,
        });
        continue;
      }

      if (typeof responseText !== 'string' || responseText.trim().length === 0) {
        residual.push({
          taskId: disagreement.taskId,
          generatorId: disagreement.generatorId,
          reason: 'empty regenerated response — never invent labels',
          originalGraderScores: disagreement.graderScores,
        });
        continue;
      }

      generations.push({
        kind: 'generation',
        task_id: task.taskId,
        client_id: disagreement.generatorId,
        response_text: responseText,
        provider_model: generatorProviderModel,
      });
    }

    let panelRefs: PiModelRef[];
    try {
      panelRefs = selectPanelForGenerator(
        generatorProviderModel,
        options.panelPool,
        options.panelFill,
      );
    } catch (error) {
      residual.push({
        taskId: disagreement.taskId,
        generatorId: disagreement.generatorId,
        reason: error instanceof Error ? error.message : String(error),
        originalGraderScores: disagreement.graderScores,
      });
      continue;
    }

    const blinded: BlindedGraderInput = {
      prompt_text: task.promptText,
      response_text: responseText,
    };
    assertGeneratorBlinded(blinded, disagreement.generatorId);

    const panelistScores: Record<string, number> = {};
    const panelistModels: Record<string, string> = {};
    let missingPanelist = false;
    for (const ref of panelRefs) {
      const grader = options.panelGraders.get(ref.id);
      if (grader === undefined) {
        residual.push({
          taskId: disagreement.taskId,
          generatorId: disagreement.generatorId,
          reason: `missing panel grader client ${ref.id}`,
          originalGraderScores: disagreement.graderScores,
        });
        missingPanelist = true;
        break;
      }
      try {
        const raw = await grader.grade(blinded, {
          taskId: task.taskId,
          generatorId: disagreement.generatorId,
        });
        panelistScores[ref.id] = normalizeGraderScore(
          raw,
          `panel ${ref.id} task ${task.taskId}`,
        );
        panelistModels[ref.id] = ref.providerModel;
      } catch (error) {
        // Skip failed panelist; majority may still form from remaining scores.
        console.error(
          `[adjudicate] panelist ${ref.id} failed for ${task.taskId}/${disagreement.generatorId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (missingPanelist) {
      continue;
    }

    if (Object.keys(panelistScores).length === 0) {
      residual.push({
        taskId: disagreement.taskId,
        generatorId: disagreement.generatorId,
        reason: 'all panelists failed or missing — never invent labels',
        originalGraderScores: disagreement.graderScores,
      });
      continue;
    }

    const decision = majorityDecision(panelistScores, passScore);
    if (decision === null) {
      residual.push({
        taskId: disagreement.taskId,
        generatorId: disagreement.generatorId,
        reason: `no panel majority (scores=${JSON.stringify(panelistScores)})`,
        panelistScores,
        originalGraderScores: disagreement.graderScores,
      });
      continue;
    }

    const holdout = assignSessionHoldout(task.sessionId, seed, holdoutPercent);
    const panelistIds = Object.keys(panelistScores);
    const row = buildAdjudicatedRow({
      task,
      generatorId: disagreement.generatorId,
      panelistIds,
      success: decision.success,
      judgeScore: decision.judgeScore,
      holdout,
    });

    resolved.push({
      taskId: disagreement.taskId,
      generatorId: disagreement.generatorId,
      generatorProviderModel,
      panelistScores,
      panelistModels,
      success: decision.success,
      judgeScore: decision.judgeScore,
      partition: holdout ? 'holdout' : 'fit',
      row,
    });
  }

  return { resolved, residual, generations };
}

export function buildAdjudicationReport(
  result: AdjudicateRunResult,
  meta: {
    readonly seed: string;
    readonly holdoutPercent: number;
    readonly passScore: number;
    readonly generatorModels: ReadonlyMap<string, string>;
    readonly panelModels: ReadonlyMap<string, string>;
    readonly fitAppended: number;
    readonly holdoutAppended: number;
    readonly disagreementCount: number;
  },
): AdjudicationReport {
  return {
    campaign: 'panel-adjudication',
    seed: meta.seed,
    holdout_percent: meta.holdoutPercent,
    pass_score: meta.passScore,
    generator_models: Object.fromEntries(meta.generatorModels),
    panel_models: Object.fromEntries(meta.panelModels),
    totals: {
      disagreements: meta.disagreementCount,
      resolved: result.resolved.length,
      residual: result.residual.length,
      fit_appended: meta.fitAppended,
      holdout_appended: meta.holdoutAppended,
    },
    resolved: result.resolved,
    residual: result.residual,
  };
}

export function formatGenerationsJsonl(
  generations: readonly AdjudicationGenerationRecord[],
): string {
  if (generations.length === 0) {
    return '';
  }
  return `${generations.map((g) => JSON.stringify(g)).join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface AdjudicateCliArgs {
  readonly report?: string;
  readonly tasks?: string;
  readonly fit?: string;
  readonly holdout?: string;
  readonly generationsOut?: string;
  readonly generationsIn?: string;
  readonly requireStoredGenerations: boolean;
  readonly adjudicationReport?: string;
  readonly piTimeoutMs?: number;
  readonly generatorSpecs: string[];
  readonly panelSpecs: string[];
  readonly panelFillSpecs: string[];
  readonly help: boolean;
}

const USAGE = `Usage: tsx scripts/calibration/adjudicate-disagreements.ts [options]

Panel-adjudicate SP-282 campaign disagreements (GLM / Kimi / Gemini Pro).
Reuses stored generations when --generations-in is set; otherwise regenerates.
Majority-labels (≥2/3), appends packs. Residuals stay for human-label-review.

Required:
  --report <campaign-report.json>
  --tasks <tasks.jsonl>
  --fit <fit.jsonl>
  --holdout <holdout.jsonl>
  --generations-out <generations.jsonl>   Local sidecar (gitignored)
  --adjudication-report <report.json>

Options:
  --generations-in <generations.jsonl>  Re-grade stored responses (skip regenerate on hit)
  --require-stored-generations          Fail when --generations-in misses a key
  --generator <id=provider/model>   Override generator map (repeatable)
  --panel <id=provider/model>       Override panel pool (repeatable)
  --panel-fill <id=provider/model>  Override fill pool (repeatable)
  --pi-timeout-ms <n>               Per-call pi timeout (default ${DEFAULT_PI_CLI_TIMEOUT_MS})
  --help
`;

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new AdjudicationError(`--${flag} requires a value`);
  }
  return value;
}

export function parseAdjudicateArgs(argv: readonly string[]): AdjudicateCliArgs {
  const generatorSpecs: string[] = [];
  const panelSpecs: string[] = [];
  const panelFillSpecs: string[] = [];
  let report: string | undefined;
  let tasks: string | undefined;
  let fit: string | undefined;
  let holdout: string | undefined;
  let generationsOut: string | undefined;
  let generationsIn: string | undefined;
  let requireStoredGenerations = false;
  let adjudicationReport: string | undefined;
  let piTimeoutMs: number | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--report') {
      report = takeValue(argv, i, 'report');
      i += 1;
    } else if (arg === '--tasks') {
      tasks = takeValue(argv, i, 'tasks');
      i += 1;
    } else if (arg === '--fit') {
      fit = takeValue(argv, i, 'fit');
      i += 1;
    } else if (arg === '--holdout') {
      holdout = takeValue(argv, i, 'holdout');
      i += 1;
    } else if (arg === '--generations-out') {
      generationsOut = takeValue(argv, i, 'generations-out');
      i += 1;
    } else if (arg === '--generations-in') {
      generationsIn = takeValue(argv, i, 'generations-in');
      i += 1;
    } else if (arg === '--require-stored-generations') {
      requireStoredGenerations = true;
    } else if (arg === '--adjudication-report') {
      adjudicationReport = takeValue(argv, i, 'adjudication-report');
      i += 1;
    } else if (arg === '--generator') {
      generatorSpecs.push(takeValue(argv, i, 'generator'));
      i += 1;
    } else if (arg === '--panel') {
      panelSpecs.push(takeValue(argv, i, 'panel'));
      i += 1;
    } else if (arg === '--panel-fill') {
      panelFillSpecs.push(takeValue(argv, i, 'panel-fill'));
      i += 1;
    } else if (arg === '--pi-timeout-ms') {
      const raw = takeValue(argv, i, 'pi-timeout-ms');
      i += 1;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1_000) {
        throw new AdjudicationError(
          `--pi-timeout-ms must be an integer >= 1000; got "${raw}"`,
        );
      }
      piTimeoutMs = parsed;
    } else {
      throw new AdjudicationError(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }

  return {
    ...(report !== undefined ? { report } : {}),
    ...(tasks !== undefined ? { tasks } : {}),
    ...(fit !== undefined ? { fit } : {}),
    ...(holdout !== undefined ? { holdout } : {}),
    ...(generationsOut !== undefined ? { generationsOut } : {}),
    ...(generationsIn !== undefined ? { generationsIn } : {}),
    requireStoredGenerations,
    ...(adjudicationReport !== undefined ? { adjudicationReport } : {}),
    ...(piTimeoutMs !== undefined ? { piTimeoutMs } : {}),
    generatorSpecs,
    panelSpecs,
    panelFillSpecs,
    help,
  };
}

function writeTextFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

export async function runAdjudicateCli(argv: readonly string[]): Promise<number> {
  const args = parseAdjudicateArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const missing: string[] = [];
  for (const key of [
    'report',
    'tasks',
    'fit',
    'holdout',
    'generationsOut',
    'adjudicationReport',
  ] as const) {
    if (args[key] === undefined) {
      missing.push(`--${key === 'generationsOut' ? 'generations-out' : key === 'adjudicationReport' ? 'adjudication-report' : key}`);
    }
  }
  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.join(', ')}\n\n${USAGE}`);
    return 1;
  }

  if (args.requireStoredGenerations && args.generationsIn === undefined) {
    console.error('--require-stored-generations requires --generations-in\n\n' + USAGE);
    return 1;
  }

  const reportPath = resolve(args.report!);
  const tasksPath = resolve(args.tasks!);
  const fitPath = resolve(args.fit!);
  const holdoutPath = resolve(args.holdout!);
  const generationsPath = resolve(args.generationsOut!);
  const adjudicationReportPath = resolve(args.adjudicationReport!);
  const timeoutMs = args.piTimeoutMs ?? DEFAULT_PI_CLI_TIMEOUT_MS;
  const piOpts = { timeoutMs };

  const loaded = loadDisagreementsFromReport(readFileSync(reportPath, 'utf8'));
  const tasks = loadAdversarialTasks(readFileSync(tasksPath, 'utf8'), tasksPath);
  const tasksById = new Map(tasks.map((t) => [t.taskId, t]));

  const generatorSpecList =
    args.generatorSpecs.length > 0 ? args.generatorSpecs : [...DEFAULT_GENERATOR_SPECS];
  const panelSpecList =
    args.panelSpecs.length > 0 ? args.panelSpecs : [...DEFAULT_PANEL_SPECS];
  const fillSpecList =
    args.panelFillSpecs.length > 0 ? args.panelFillSpecs : [...DEFAULT_PANEL_FILL_SPECS];

  const generatorRefs = generatorSpecList.map(parsePiCliClientSpec);
  const panelPool = panelSpecList.map(parsePiCliClientSpec);
  const panelFill = fillSpecList.map(parsePiCliClientSpec);

  const generators = new Map<string, GeneratorClient>();
  const generatorModels = new Map<string, string>();
  for (const ref of generatorRefs) {
    generators.set(ref.id, createPiCliGenerator(ref, piOpts));
    generatorModels.set(ref.id, ref.providerModel);
  }

  const panelGraders = new Map<string, GraderClient>();
  const panelModels = new Map<string, string>();
  for (const ref of [...panelPool, ...panelFill]) {
    panelGraders.set(ref.id, createPiCliGrader(ref, piOpts));
    panelModels.set(ref.id, ref.providerModel);
  }

  console.error(
    `[adjudicate] ${loaded.disagreements.length} disagreements; ` +
      `generators=${[...generatorModels.entries()].map(([id, m]) => `${id}=${m}`).join(',')} ` +
      `panel=${panelPool.map((r) => `${r.id}=${r.providerModel}`).join(',')}`,
  );

  const result = await runAdjudication({
    disagreements: loaded.disagreements,
    tasksById,
    generators,
    generatorModels,
    panelPool,
    panelFill,
    panelGraders,
    seed: loaded.seed,
    holdoutPercent: loaded.holdoutPercent,
    passScore: loaded.passScore,
    ...(args.generationsIn !== undefined
      ? {
          storedGenerations: loadGenerationsJsonl(
            readFileSync(resolve(args.generationsIn), 'utf8'),
            args.generationsIn,
          ),
        }
      : {}),
    requireStoredGenerations: args.requireStoredGenerations,
  });

  const existingFit = existsSync(fitPath) ? loadLabelPackFile(fitPath).rows : [];
  const existingHoldout = existsSync(holdoutPath)
    ? loadLabelPackFile(holdoutPath).rows
    : [];
  const appended = appendPackRowsDeduped(existingFit, existingHoldout, result.resolved);

  writeTextFile(fitPath, formatLabelPackJsonl(appended.fit));
  writeTextFile(holdoutPath, formatLabelPackJsonl(appended.holdout));
  writeTextFile(generationsPath, formatGenerationsJsonl(result.generations));

  const report = buildAdjudicationReport(result, {
    seed: loaded.seed,
    holdoutPercent: loaded.holdoutPercent,
    passScore: loaded.passScore,
    generatorModels,
    panelModels,
    fitAppended: appended.fitAppended,
    holdoutAppended: appended.holdoutAppended,
    disagreementCount: loaded.disagreements.length,
  });
  // Strip full LabelPackRow nesting noise for residual-friendly report: keep resolved rows.
  writeTextFile(adjudicationReportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.error(
    `[adjudicate] resolved=${result.resolved.length} residual=${result.residual.length} ` +
      `fit+${appended.fitAppended} holdout+${appended.holdoutAppended}`,
  );
  if (result.residual.length > 0) {
    console.error(
      `[adjudicate] residuals remain — run human-label-review on the campaign report ` +
        `(or residual list in ${adjudicationReportPath})`,
    );
  }
  return 0;
}

async function main(): Promise<void> {
  try {
    const code = await runAdjudicateCli(process.argv.slice(2));
    process.exitCode = code;
  } catch (error) {
    const message =
      error instanceof AdjudicationError ||
      error instanceof AdversarialLabelingError ||
      error instanceof Error
        ? error.message
        : String(error);
    console.error(`adjudicate-disagreements: ${message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main();
}
