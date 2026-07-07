import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync as readSchema } from 'node:fs';

import { describe, expect, it, beforeAll } from 'vitest';

import {
  buildTelemetryContribRecords,
  datasetExportRowToTelemetryContrib,
  executeUnpinCommand,
  exportTelemetryContrib,
  formatTelemetryContribJson,
  hashSessionIdForContribExport,
  isExportTelemetryContribInvocation,
  isUnpinInvocation,
  parseExportTelemetryContribArgs,
  TELEMETRY_CONTRIB_VERSION,
  toTelemetryContribRecord,
  validateTelemetryContribRecord,
  assertTelemetryContribRecordSafe,
  EXPORT_TELEMETRY_CONTRIB_COMMAND,
  UNPIN_SUBCOMMAND,
} from '../../src/cli/smart-router-cli.js';
import { SessionPinner } from '../../src/domain/pinning/session-pinner.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';
import type { RoutingDatasetRecord, RoutingOutcomeRecord } from '../../src/domain/types/index.js';
import { DEFAULT_CONTEXT_FIT_DATASET_FIELDS, DEFAULT_TIER_SELECTION_DATASET_FIELDS } from '../../src/infrastructure/telemetry/routing-telemetry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCHEMA_PATH = resolve(
  ROOT,
  'specs/001-build-smart-router/contracts/telemetry-contrib.schema.json',
);

type ValidateFn = (data: unknown) => boolean;

async function compileTelemetryContribValidator(): Promise<ValidateFn> {
  const ajvMod = await import('ajv/dist/2020.js');
  const formatsMod = await import('ajv-formats');
  const AjvCtor = (ajvMod as Record<string, unknown>).default ?? ajvMod;
  const addFmts = (formatsMod as Record<string, unknown>).default ?? formatsMod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (AjvCtor as any)({ strict: false, allErrors: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (addFmts as any)(ajv);
  const schema = JSON.parse(readSchema(SCHEMA_PATH, 'utf8')) as Record<string, unknown>;
  return ajv.compile(schema) as ValidateFn;
}

function makeDatasetRecord(
  overrides: Partial<RoutingDatasetRecord> = {},
): RoutingDatasetRecord {
  return {
    request_id: 'req-contrib-1',
    timestamp: '2026-07-07T12:00:00.000Z',
    turn_type: 'main_loop',
    stage: 'hydra_match',
    reason_code: 'hydra_embedding_match',
    selected_model_id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    candidates_json: '[{"model_id":"gpt-4o-mini","score":0.9}]',
    prompt_length_chars: 240,
    estimated_input_tokens: 60,
    message_count: 2,
    has_tool_context: false,
    compaction_flag: false,
    triage_verdict: 'ambiguous',
    triage_reason_code: 'mixed_signals',
    triage_cyclomatic_score: 1,
    triage_trivial_hits: 0,
    triage_complex_hits: 1,
    triage_sanitized_length_delta: 0,
    requirement_reasoning: 0.5,
    requirement_code_gen: 0.4,
    requirement_tool_use: 0.2,
    routing_latency_ms: 12,
    estimated_cost_usd: 0.001,
    prompt_fingerprint: 'deadbeef'.repeat(8),
    ...DEFAULT_CONTEXT_FIT_DATASET_FIELDS,
    ...DEFAULT_TIER_SELECTION_DATASET_FIELDS,
    ...overrides,
  };
}

function makeOutcome(
  overrides: Partial<RoutingOutcomeRecord> = {},
): RoutingOutcomeRecord {
  return {
    request_id: 'req-contrib-1',
    session_id: 'sess-contrib-secret',
    timestamp: '2026-07-07T12:01:00.000Z',
    signal_type: 'feedback_good',
    routed_model_id: 'gpt-4o-mini',
    override_model_id: null,
    ...overrides,
  };
}

describe('smart-router-cli unpin subcommand (SP-079)', () => {
  it('recognizes unpin invocation', () => {
    expect(isUnpinInvocation('unpin')).toBe(true);
    expect(isUnpinInvocation('  unpin  ')).toBe(true);
    expect(isUnpinInvocation('status')).toBe(false);
    expect(isUnpinInvocation('unpin all')).toBe(false);
    expect(UNPIN_SUBCOMMAND).toBe('unpin');
  });

  it('clears the current session pin', () => {
    const sessionPinner = new SessionPinner();
    const sessionId = 'sess-cli-unpin';
    sessionPinner.recordPin(sessionId, 'gpt-4o-mini', 'initial');

    const result = executeUnpinCommand({ sessionId, sessionPinner });

    expect(result).toEqual({
      outcome: 'cleared',
      previousModelId: 'gpt-4o-mini',
      message:
        'Cleared session pin (was gpt-4o-mini). Next request will run full routing.',
      level: 'info',
    });
    expect(sessionPinner.getPin(sessionId)).toBeNull();
  });

  it('no-ops when the session has no pin', () => {
    const sessionPinner = new SessionPinner();
    const sessionId = 'sess-cli-no-pin';

    const result = executeUnpinCommand({ sessionId, sessionPinner });

    expect(result).toEqual({
      outcome: 'noop',
      message: 'No session pin to clear.',
      level: 'info',
    });
  });

  it('reports unavailable when session pinner is missing', () => {
    const result = executeUnpinCommand({
      sessionId: 'sess-cli-missing-pinner',
      sessionPinner: undefined,
    });

    expect(result).toEqual({
      outcome: 'unavailable',
      message: 'Session pinner unavailable.',
      level: 'error',
    });
  });

  it('does not clear pins for other sessions', () => {
    const sessionPinner = new SessionPinner();
    sessionPinner.recordPin('sess-a', 'claude-opus', 'initial');
    sessionPinner.recordPin('sess-b', 'gpt-4o', 'initial');

    executeUnpinCommand({ sessionId: 'sess-a', sessionPinner });

    expect(sessionPinner.getPin('sess-a')).toBeNull();
    expect(sessionPinner.getPin('sess-b')?.pinned_model_id).toBe('gpt-4o');
  });
});

describe('export telemetry-contrib (SP-118)', () => {
  let validateSchema: ValidateFn;

  beforeAll(async () => {
    validateSchema = await compileTelemetryContribValidator();
  });

  it('recognizes export telemetry-contrib invocation', () => {
    expect(isExportTelemetryContribInvocation('export telemetry-contrib')).toBe(true);
    expect(isExportTelemetryContribInvocation('export telemetry-contrib --limit 50')).toBe(
      true,
    );
    expect(isExportTelemetryContribInvocation('export dataset')).toBe(false);
    expect(EXPORT_TELEMETRY_CONTRIB_COMMAND).toBe('export telemetry-contrib');
  });

  it('parses export telemetry-contrib limit flag', () => {
    expect(parseExportTelemetryContribArgs('export telemetry-contrib')).toEqual({
      limit: 10_000,
    });
    expect(parseExportTelemetryContribArgs('export telemetry-contrib --limit 25')).toEqual({
      limit: 25,
    });
    expect(parseExportTelemetryContribArgs('export telemetry-contrib --limit=50')).toEqual({
      limit: 50,
    });
    expect(() => parseExportTelemetryContribArgs('export telemetry-contrib --limit 0')).toThrow(
      'Usage:',
    );
  });

  it('maps dataset rows to privacy-safe contrib records with outcome labels', () => {
    const record = makeDatasetRecord();
    const outcome = makeOutcome();

    const exported = toTelemetryContribRecord(record, [outcome]);

    expect(exported.version).toBe(TELEMETRY_CONTRIB_VERSION);
    expect(exported).not.toHaveProperty('request_id');
    expect(exported).not.toHaveProperty('prompt_fingerprint');
    expect(exported).not.toHaveProperty('candidates_json');
    expect(exported.session_id_hash).toBe(
      hashSessionIdForContribExport('sess-contrib-secret'),
    );
    expect(exported.success_label).toBe(true);
    expect(exported.outcome_signals).toEqual(['feedback_good']);
    expect(exported.requirement_reasoning).toBe(0.5);
  });

  it('produces schema-valid JSON with zero prompt content', () => {
    const records = buildTelemetryContribRecords(
      [makeDatasetRecord(), makeDatasetRecord({ request_id: 'req-contrib-2' })],
      [makeOutcome(), makeOutcome({ request_id: 'req-contrib-2', signal_type: 'feedback_bad' })],
    );

    const json = formatTelemetryContribJson(records);
    expect(json).not.toContain('prompt_text');
    expect(json).not.toContain('sess-contrib-secret');
    expect(json).not.toContain('deadbeef');

    for (const record of records) {
      expect(validateSchema(record)).toBe(true);
      assertTelemetryContribRecordSafe(record);
    }
  });

  it('rejects tainted contrib payloads on validation', () => {
    const tainted = {
      version: 1,
      timestamp: '2026-07-07T12:00:00.000Z',
      session_id_hash: 'a'.repeat(64),
      turn_type: 'main_loop',
      reason_code: 'hydra_embedding_match',
      selected_model_id: 'gpt-4o-mini',
      routing_latency_ms: 12,
      prompt_text: 'never export',
    };

    expect(() => validateTelemetryContribRecord(tainted)).toThrow(/Tainted contrib record rejected/);
    expect(() => assertTelemetryContribRecordSafe(tainted)).toThrow(/Tainted contrib record rejected/);
  });

  it('strips install-local pepper fields from export rows', () => {
    const record = {
      ...toTelemetryContribRecord(makeDatasetRecord(), [makeOutcome()]),
      dataset_key: 'install-local',
      pepper: 'local-pepper',
      request_id: 'req-secret',
    };

    const sanitized = validateTelemetryContribRecord(record);
    expect(sanitized).not.toHaveProperty('dataset_key');
    expect(sanitized).not.toHaveProperty('pepper');
    expect(sanitized).not.toHaveProperty('request_id');
  });

  it('writes export file under .pi-smart-router/exports', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sp118-export-'));
    try {
      const store = new MemoryStore([]);
      store.appendDatasetRecord(makeDatasetRecord());
      store.appendOutcomeRecord(makeOutcome());

      const result = await exportTelemetryContrib(
        { store, cwd, limit: 10 },
        { writeFile: true },
      );

      expect(result.recordCount).toBe(1);
      expect(result.path).toContain(
        join(cwd, '.pi-smart-router/exports/telemetry-contrib-'),
      );
      expect(result.path?.endsWith('.json')).toBe(true);

      const written = JSON.parse(readFileSync(result.path!, 'utf8')) as Record<string, unknown>[];
      expect(written).toHaveLength(1);
      expect(written[0]).not.toHaveProperty('request_id');
      expect(validateSchema(written[0])).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('converts dataset export rows without leaking request identifiers', () => {
    const contrib = datasetExportRowToTelemetryContrib(
      {
        request_id: 'req-secret',
        session_id_hash: hashSessionIdForContribExport('sess-secret'),
        timestamp: '2026-07-07T12:00:00.000Z',
        turn_type: 'main_loop',
        reason_code: 'hydra_embedding_match',
        selected_model_id: 'gpt-4o-mini',
        routing_latency_ms: 12,
        prompt_text: 'strip me',
      },
      [makeOutcome()],
    );

    expect(contrib).not.toHaveProperty('request_id');
    expect(contrib).not.toHaveProperty('prompt_text');
    expect(contrib.session_id_hash).toBe(hashSessionIdForContribExport('sess-secret'));
  });
});
