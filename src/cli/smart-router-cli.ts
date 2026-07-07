/**
 * Smart Router CLI subcommands — library-facing command handlers.
 *
 * Extension wiring lives in `.pi/extensions/smart-router/commands.ts`;
 * this module holds reusable subcommand logic for dogfooding and tests.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  attachOutcomeLabelsToExport,
  deriveSuccessLabel,
  indexOutcomesByRequestId,
} from '../domain/routing/p-success-classifier.js';
import { SessionPinner } from '../domain/pinning/session-pinner.js';
import { DATASET_MAX_ENTRIES } from '../infrastructure/telemetry/dataset-limits.js';
import type { RoutingDatasetRecord, RoutingOutcomeRecord } from '../domain/types/index.js';
import type { StorePort } from '../domain/types/store-port.js';

export const UNPIN_SUBCOMMAND = 'unpin' as const;
export const EXPORT_TELEMETRY_CONTRIB_COMMAND = 'export telemetry-contrib' as const;

export const TELEMETRY_CONTRIB_VERSION = 1 as const;
export const TELEMETRY_CONTRIB_SCHEMA_PATH =
  'specs/001-build-smart-router/contracts/telemetry-contrib.schema.json';

export const DEFAULT_TELEMETRY_CONTRIB_EXPORT_DIR = '.pi-smart-router/exports';
export const DEFAULT_TELEMETRY_CONTRIB_EXPORT_LIMIT = DATASET_MAX_ENTRIES;

/** Keys stripped from contrib export (install-local identifiers and prompt-adjacent fields). */
export const TELEMETRY_CONTRIB_STRIP_KEYS = [
  'request_id',
  'session_id',
  'prompt_text',
  'messages',
  'prompt',
  'prompt_fingerprint',
  'pepper',
  'install_pepper',
  'dataset_pepper',
  'dataset_key',
  'pepper_key',
  'install_key',
  'candidates_json',
  'context_fit_rejected_json',
] as const;

/** Mirrors SP-116 `CALIBRATION_CONTRIB_REJECT_KEYS` for ingest-safe export. */
export const TELEMETRY_CONTRIB_REJECT_KEYS = [
  'session_id',
  'prompt_text',
  'messages',
  'prompt',
  'prompt_fingerprint',
] as const;

/** Mirrors SP-116 tainted key pattern for ingest-safe export. */
export const TELEMETRY_CONTRIB_TAINTED_KEY_PATTERN =
  /(?:^|_)(prompt|message|messages|content|tool_calls?|secret|password|token|api_key)(?:_|$)/i;

export class TelemetryContribValidationError extends Error {
  override readonly name = 'TelemetryContribValidationError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectForbiddenContribKeys(
  value: unknown,
  path = '',
  found: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectForbiddenContribKeys(value[i], `${path}[${i}]`, found);
    }
    return found;
  }

  if (!isPlainObject(value)) {
    return found;
  }

  for (const [key, nested] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key;

    if (
      (TELEMETRY_CONTRIB_REJECT_KEYS as readonly string[]).includes(key) ||
      TELEMETRY_CONTRIB_TAINTED_KEY_PATTERN.test(key)
    ) {
      found.push(keyPath);
    }

    collectForbiddenContribKeys(nested, keyPath, found);
  }

  return found;
}

/** Fail closed when a contrib row contains forbidden or tainted keys (SP-116 parity). */
export function assertTelemetryContribRecordSafe(
  record: unknown,
  context?: string,
): asserts record is Record<string, unknown> {
  if (!isPlainObject(record)) {
    const suffix = context ? ` (${context})` : '';
    throw new TelemetryContribValidationError(
      `Contrib record must be a JSON object${suffix}`,
    );
  }

  const forbidden = collectForbiddenContribKeys(record);
  if (forbidden.length > 0) {
    const suffix = context ? ` (${context})` : '';
    throw new TelemetryContribValidationError(
      `Tainted contrib record rejected${suffix}: forbidden keys ${forbidden.join(', ')}`,
    );
  }
}

/** Strip install-local pepper fields from a validated contrib row (SP-116 parity). */
export function sanitizeTelemetryContribRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...record };
  for (const key of TELEMETRY_CONTRIB_STRIP_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

export type UnpinOutcome = 'cleared' | 'noop' | 'unavailable';

export interface UnpinCommandResult {
  readonly outcome: UnpinOutcome;
  readonly message: string;
  readonly level: 'info' | 'error';
  readonly previousModelId?: string;
}

export interface UnpinCommandContext {
  readonly sessionId: string;
  readonly sessionPinner: SessionPinner | undefined;
}

export interface ExportTelemetryContribOptions {
  readonly limit?: number;
  readonly cwd?: string;
  readonly writeFile?: boolean;
}

export interface ExportTelemetryContribResult {
  readonly path: string | null;
  readonly recordCount: number;
  readonly json: string;
}

export interface TelemetryContribExportContext {
  readonly store: StorePort;
  readonly cwd: string;
  readonly limit: number;
}

/** Returns true when args invoke `/smart-router unpin`. */
export function isUnpinInvocation(args: string): boolean {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  return tokens.length === 1 && tokens[0] === UNPIN_SUBCOMMAND;
}

/** Returns true when args invoke `export telemetry-contrib`. */
export function isExportTelemetryContribInvocation(args: string): boolean {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  return (
    tokens.length >= 2 &&
    tokens[0] === 'export' &&
    tokens[1] === 'telemetry-contrib'
  );
}

export function parseExportTelemetryContribArgs(args: string): {
  readonly limit: number;
} {
  if (!isExportTelemetryContribInvocation(args)) {
    throw new Error(
      'Usage: export telemetry-contrib [--limit N]',
    );
  }

  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let limit = DEFAULT_TELEMETRY_CONTRIB_EXPORT_LIMIT;

  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '--limit') {
      const next = tokens[i + 1];
      if (!next) {
        throw new Error('Usage: export telemetry-contrib [--limit N]');
      }
      limit = parsePositiveLimit(next);
      i++;
      continue;
    }
    if (token.startsWith('--limit=')) {
      limit = parsePositiveLimit(token.slice('--limit='.length));
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return { limit };
}

function parsePositiveLimit(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Usage: export telemetry-contrib [--limit N]');
  }
  return Math.min(parsed, DEFAULT_TELEMETRY_CONTRIB_EXPORT_LIMIT);
}

/**
 * Clear the current session pin via SessionPinner.breakPin().
 * Does not modify SessionPinner break rules — operator-initiated unpin only.
 */
export function executeUnpinCommand(ctx: UnpinCommandContext): UnpinCommandResult {
  const { sessionId, sessionPinner } = ctx;

  if (!sessionPinner) {
    return {
      outcome: 'unavailable',
      message: 'Session pinner unavailable.',
      level: 'error',
    };
  }

  const pin = sessionPinner.getPin(sessionId);
  if (!pin) {
    return {
      outcome: 'noop',
      message: 'No session pin to clear.',
      level: 'info',
    };
  }

  sessionPinner.breakPin(sessionId);

  return {
    outcome: 'cleared',
    previousModelId: pin.pinned_model_id,
    message: `Cleared session pin (was ${pin.pinned_model_id}). Next request will run full routing.`,
    level: 'info',
  };
}

export function hashSessionIdForContribExport(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

function resolveSessionIdHash(
  record: RoutingDatasetRecord,
  outcomes: readonly RoutingOutcomeRecord[],
): string {
  const sessionId = outcomes[0]?.session_id;
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    return hashSessionIdForContribExport(sessionId);
  }

  const raw = record as RoutingDatasetRecord & { session_id?: string };
  if (typeof raw.session_id === 'string' && raw.session_id.length > 0) {
    return hashSessionIdForContribExport(raw.session_id);
  }

  return hashSessionIdForContribExport('');
}

/** Map a dataset row plus linked outcomes to a privacy-safe telemetry contrib record. */
export function toTelemetryContribRecord(
  record: RoutingDatasetRecord,
  outcomes: readonly RoutingOutcomeRecord[] = [],
): Record<string, unknown> {
  const { success, outcome_signals } = deriveSuccessLabel(outcomes);

  const contrib: Record<string, unknown> = {
    version: TELEMETRY_CONTRIB_VERSION,
    timestamp: record.timestamp,
    session_id_hash: resolveSessionIdHash(record, outcomes),
    turn_type: record.turn_type,
    stage: record.stage,
    reason_code: record.reason_code,
    selected_model_id: record.selected_model_id,
    tier: record.tier,
    routing_latency_ms: record.routing_latency_ms,
    estimated_cost_usd: record.estimated_cost_usd,
    estimated_input_tokens: record.estimated_input_tokens,
    has_tool_context: record.has_tool_context,
    compaction_flag: record.compaction_flag,
    triage_verdict: record.triage_verdict,
    triage_reason_code: record.triage_reason_code,
    triage_cyclomatic_score: record.triage_cyclomatic_score,
    triage_trivial_hits: record.triage_trivial_hits,
    triage_complex_hits: record.triage_complex_hits,
    triage_sanitized_length_delta: record.triage_sanitized_length_delta,
    requirement_reasoning: record.requirement_reasoning,
    requirement_code_gen: record.requirement_code_gen,
    requirement_tool_use: record.requirement_tool_use,
    cluster_id: record.cluster_id,
    cluster_similarity: record.cluster_similarity,
    cluster_margin: record.cluster_margin,
    low_intensity_score: record.low_intensity_score,
    tier_hint: record.tier_hint,
    p_success_cheap: record.p_success_cheap,
    local_eligible_reason: record.local_eligible_reason,
    tier_selection_reason_code: record.tier_selection_reason_code,
    success_label: success,
    outcome_signals,
  };

  for (const key of TELEMETRY_CONTRIB_STRIP_KEYS) {
    delete contrib[key];
  }

  return sanitizeTelemetryContribRecord(contrib);
}

export function formatTelemetryContribJson(
  records: readonly Record<string, unknown>[],
): string {
  if (records.length === 0) {
    return '[]';
  }
  return JSON.stringify(records, null, 2);
}

export function formatTelemetryContribJsonl(
  records: readonly Record<string, unknown>[],
): string {
  if (records.length === 0) {
    return '';
  }
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

export function formatTelemetryContribExportTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function getTelemetryContribExportPath(cwd: string, timestamp: string): string {
  return join(
    cwd,
    DEFAULT_TELEMETRY_CONTRIB_EXPORT_DIR,
    `telemetry-contrib-${timestamp}.json`,
  );
}

/** Defense-in-depth validation using SP-116 contrib safety checks. */
export function validateTelemetryContribRecord(
  record: unknown,
  context?: string,
): Record<string, unknown> {
  assertTelemetryContribRecordSafe(record, context);
  return sanitizeTelemetryContribRecord(record);
}

export function buildTelemetryContribRecords(
  datasetRecords: readonly RoutingDatasetRecord[],
  outcomeRecords: readonly RoutingOutcomeRecord[] = [],
): Record<string, unknown>[] {
  const outcomesByRequest = indexOutcomesByRequestId(outcomeRecords);

  return datasetRecords.map((record) => {
    const linkedOutcomes = outcomesByRequest.get(record.request_id) ?? [];
    const contrib = toTelemetryContribRecord(record, linkedOutcomes);
    validateTelemetryContribRecord(contrib, record.request_id);
    return contrib;
  });
}

export async function exportTelemetryContrib(
  ctx: TelemetryContribExportContext,
  options?: Pick<ExportTelemetryContribOptions, 'writeFile'>,
): Promise<ExportTelemetryContribResult> {
  const datasetRecords = await ctx.store.listDatasetRecords({ limit: ctx.limit });
  const outcomeRecords = await ctx.store.listOutcomeRecords({ limit: ctx.limit });
  const records = buildTelemetryContribRecords(datasetRecords, outcomeRecords);
  const json = formatTelemetryContribJson(records);

  if (records.length === 0 || options?.writeFile === false) {
    return { path: null, recordCount: records.length, json };
  }

  const timestamp = formatTelemetryContribExportTimestamp();
  const exportDir = join(ctx.cwd, DEFAULT_TELEMETRY_CONTRIB_EXPORT_DIR);
  mkdirSync(exportDir, { recursive: true });
  const exportPath = getTelemetryContribExportPath(ctx.cwd, timestamp);
  writeFileSync(exportPath, `${json}\n`, 'utf8');

  return { path: exportPath, recordCount: records.length, json };
}

/** Join dataset export shape with outcome labels, then strip to contrib-safe fields. */
export function datasetExportRowToTelemetryContrib(
  exportRecord: Record<string, unknown>,
  outcomes: readonly RoutingOutcomeRecord[],
): Record<string, unknown> {
  const joined = attachOutcomeLabelsToExport(exportRecord, outcomes);
  const contrib: Record<string, unknown> = {
    version: TELEMETRY_CONTRIB_VERSION,
    ...joined,
  };

  for (const key of TELEMETRY_CONTRIB_STRIP_KEYS) {
    delete contrib[key];
  }

  if (typeof exportRecord.session_id_hash === 'string') {
    contrib.session_id_hash = exportRecord.session_id_hash;
  } else if (typeof exportRecord.session_id === 'string') {
    contrib.session_id_hash = hashSessionIdForContribExport(exportRecord.session_id);
  }

  delete contrib.session_id;

  return validateTelemetryContribRecord(contrib);
}

export const smartRouterCliSubcommands = {
  unpin: executeUnpinCommand,
  exportTelemetryContrib,
} as const;
