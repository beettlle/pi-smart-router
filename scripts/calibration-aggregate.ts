#!/usr/bin/env node
/**
 * Calibration contrib aggregate and validate — SP-116, GitHub #66 (stage 1–2).
 *
 * Collects privacy-safe JSONL contributions from `data/contrib/` (or stdin),
 * rejects tainted payloads (prompt text, messages, secrets), strips install-local
 * pepper fields, and emits validated JSONL for offline training (SP-117).
 *
 * Minimum sample sizes for training are documented in
 * `specs/001-build-smart-router/contracts/routing-calibration.schema.json`
 * (`minimum_training_samples`) and `config/routing-calibration.json.example`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { MIN_TRAINING_SAMPLES } from '../src/domain/routing/p-success-classifier.js';

export const DEFAULT_CONTRIB_DIR = 'data/contrib';

/** Documented minimum labeled rows before each artifact deviates from defaults. */
export const MINIMUM_TRAINING_SAMPLES = {
  hydra_projection: 100,
  triage_thresholds: 50,
  p_success_weights: MIN_TRAINING_SAMPLES,
  routing_centroids: 10,
} as const;

/** Keys whose presence rejects the whole contrib row (prompt content, raw identifiers). */
export const CALIBRATION_CONTRIB_REJECT_KEYS: readonly string[] = [
  'session_id',
  'prompt_text',
  'messages',
  'prompt',
  'prompt_fingerprint',
] as const;

/** Install-local pepper and correlation fields — stripped after validation, not rejected. */
export const CALIBRATION_CONTRIB_STRIP_KEYS: readonly string[] = [
  'request_id',
  'pepper',
  'install_pepper',
  'dataset_pepper',
  'dataset_key',
  'pepper_key',
  'install_key',
] as const;

/** Keys whose names suggest prompt or message content — reject on ingest. */
export const CONTRIB_TAINTED_KEY_PATTERN =
  /(?:^|_)(prompt|message|messages|content|tool_calls?|secret|password|token|api_key)(?:_|$)/i;

export class CalibrationContribError extends Error {
  override readonly name = 'CalibrationContribError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export interface CalibrationAggregateResult {
  readonly records: readonly Record<string, unknown>[];
  readonly accepted: number;
  readonly rejected: number;
  readonly source_files: readonly string[];
}

export interface CalibrationAggregateOptions {
  readonly contribDir?: string;
  readonly stdin?: boolean;
  readonly quiet?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectForbiddenKeys(
  value: unknown,
  path = '',
  found: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectForbiddenKeys(value[i], `${path}[${i}]`, found);
    }
    return found;
  }

  if (!isPlainObject(value)) {
    return found;
  }

  for (const [key, nested] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key;

    if (
      (CALIBRATION_CONTRIB_REJECT_KEYS as readonly string[]).includes(key) ||
      CONTRIB_TAINTED_KEY_PATTERN.test(key)
    ) {
      found.push(keyPath);
    }

    collectForbiddenKeys(nested, keyPath, found);
  }

  return found;
}

/** Fail closed when a contrib row contains forbidden or tainted keys. */
export function assertContribRecordSafe(
  record: unknown,
  context?: string,
): asserts record is Record<string, unknown> {
  if (!isPlainObject(record)) {
    const suffix = context ? ` (${context})` : '';
    throw new CalibrationContribError(`Contrib record must be a JSON object${suffix}`);
  }

  const forbidden = collectForbiddenKeys(record);
  if (forbidden.length > 0) {
    const suffix = context ? ` (${context})` : '';
    throw new CalibrationContribError(
      `Tainted contrib record rejected${suffix}: forbidden keys ${forbidden.join(', ')}`,
    );
  }
}

/** Strip install-local pepper fields from a validated contrib row. */
export function sanitizeContribRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...record };
  for (const key of CALIBRATION_CONTRIB_STRIP_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

export function parseContribJsonl(
  text: string,
  source = 'input',
): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/);
  const records: Record<string, unknown>[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new CalibrationContribError(
        `Invalid JSONL at ${source}:${i + 1}: ${message}`,
      );
    }

    assertContribRecordSafe(parsed, `${source}:${i + 1}`);
    records.push(sanitizeContribRecord(parsed));
  }

  return records;
}

export function parseContribJson(
  text: string,
  source = 'input',
): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CalibrationContribError(`Invalid JSON at ${source}: ${message}`);
  }

  if (Array.isArray(parsed)) {
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < parsed.length; i++) {
      assertContribRecordSafe(parsed[i], `${source}[${i}]`);
      records.push(sanitizeContribRecord(parsed[i] as Record<string, unknown>));
    }
    return records;
  }

  assertContribRecordSafe(parsed, source);
  return [sanitizeContribRecord(parsed)];
}

function listContribFiles(contribDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(contribDir);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  return entries
    .filter((name) => name.endsWith('.json') || name.endsWith('.jsonl'))
    .map((name) => join(contribDir, name))
    .filter((path) => statSync(path).isFile())
    .sort();
}

export function readContribFile(filePath: string): Record<string, unknown>[] {
  const text = readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.jsonl')) {
    return parseContribJsonl(text, filePath);
  }
  return parseContribJson(text, filePath);
}

export function collectContribFromDir(contribDir: string): CalibrationAggregateResult {
  const files = listContribFiles(contribDir);
  const records: Record<string, unknown>[] = [];

  for (const filePath of files) {
    records.push(...readContribFile(filePath));
  }

  return {
    records,
    accepted: records.length,
    rejected: 0,
    source_files: files,
  };
}

export async function readContribFromStdin(): Promise<Record<string, unknown>[]> {
  if (process.stdin.isTTY) {
    return [];
  }

  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }

  const text = chunks.join('');
  if (text.trim().length === 0) {
    return [];
  }

  if (text.includes('\n')) {
    return parseContribJsonl(text, 'stdin');
  }

  return parseContribJson(text, 'stdin');
}

export function aggregateContribRecords(
  batches: ReadonlyArray<readonly Record<string, unknown>[]>,
): Record<string, unknown>[] {
  return batches.flatMap((batch) => [...batch]);
}

export function formatContribJsonl(records: readonly Record<string, unknown>[]): string {
  if (records.length === 0) {
    return '';
  }
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

function usage(): void {
  console.error(
    [
      'Usage: npm run routing:calibration-aggregate -- [options]',
      '',
      'Options:',
      '  --contrib-dir <path>  Directory with .json/.jsonl contrib files (default: data/contrib)',
      '  --stdin               Also read JSONL from stdin (merged with directory files)',
      '  --quiet               Suppress summary on stderr',
      '  -h, --help            Show this help',
      '',
      'Writes validated JSONL to stdout. Rejects records containing prompt text,',
      'messages, or install-local pepper fields.',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  let contribDir = resolve(DEFAULT_CONTRIB_DIR);
  let includeStdin = false;
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--contrib-dir') {
      const next = args[i + 1];
      if (!next) {
        throw new CalibrationContribError('--contrib-dir requires a path');
      }
      contribDir = resolve(next);
      i++;
      continue;
    }
    if (arg === '--stdin') {
      includeStdin = true;
      continue;
    }
    if (arg === '--quiet') {
      quiet = true;
      continue;
    }
    throw new CalibrationContribError(`Unknown argument: ${arg}`);
  }

  const dirResult = collectContribFromDir(contribDir);
  const stdinRecords = includeStdin || !process.stdin.isTTY
    ? await readContribFromStdin()
    : [];

  const records = aggregateContribRecords([dirResult.records, stdinRecords]);
  process.stdout.write(formatContribJsonl(records));

  if (!quiet) {
    const sources = [...dirResult.source_files];
    if (stdinRecords.length > 0) {
      sources.push('stdin');
    }
    console.error(
      `calibration-aggregate: accepted ${records.length} record(s) from ${sources.length} source(s)`,
    );
    if (records.length < MINIMUM_TRAINING_SAMPLES.p_success_weights) {
      console.error(
        `calibration-aggregate: warning — fewer than ${MINIMUM_TRAINING_SAMPLES.p_success_weights} rows; P(success) training will use neutral fallback`,
      );
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`calibration-aggregate failed: ${message}`);
  process.exit(1);
});
