import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { createHash } from 'node:crypto';

import {
  attachOutcomeLabelsToExport,
  indexOutcomesByRequestId,
} from '../../../src/domain/routing/p-success-classifier.js';
import { DATASET_MAX_ENTRIES } from '../../../src/infrastructure/telemetry/dataset-limits.js';
import {
  DatasetRecorder,
  DATASET_ENABLED_NOTIFY_MESSAGE,
} from '../../../src/infrastructure/telemetry/dataset-recorder.js';
import { OutcomeRecorder } from '../../../src/infrastructure/telemetry/outcome-recorder.js';
import type { RoutingDatasetRecord, RoutingOutcomeRecord } from '../../../src/domain/types/index.js';
import type { StorePort } from '../../../src/domain/types/store-port.js';

const DEFAULT_DATASET_EXPORT_DIR = '.pi-smart-router/exports';
const DEFAULT_DATASET_EXPORT_LIMIT = DATASET_MAX_ENTRIES;
const MAX_DATASET_EXPORT_LIMIT = DATASET_MAX_ENTRIES;

export const DATASET_EXPORT_FORBIDDEN_KEYS = [
  'session_id',
  'prompt_text',
  'messages',
  'prompt',
  'pepper',
  'install_pepper',
  'dataset_pepper',
  'dataset_key',
] as const;

export function createExtensionDatasetRecorder(
  store: StorePort,
  cwdOrNotify?: string | ((message: string) => void),
  notifyEnabled?: (message: string) => void,
): DatasetRecorder {
  let cwd = process.cwd();
  let notify: ((message: string) => void) | undefined;

  if (typeof cwdOrNotify === 'string') {
    cwd = cwdOrNotify;
    notify = notifyEnabled;
  } else if (typeof cwdOrNotify === 'function') {
    notify = cwdOrNotify;
  }

  return new DatasetRecorder({
    cwd,
    onRecord: (record) => {
      store.appendDatasetRecord(record);
    },
    onFirstEnable: () => {
      notify?.(DATASET_ENABLED_NOTIFY_MESSAGE);
    },
  });
}

export function createExtensionOutcomeRecorder(store: StorePort): OutcomeRecorder {
  return new OutcomeRecorder({
    onRecord: (record) => {
      store.appendOutcomeRecord(record);
    },
  });
}

export function hashSessionIdForExport(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

/** Map a stored dataset row to a privacy-safe JSON export object (Tier 1 only). */
export function toDatasetExportRecord(
  record: RoutingDatasetRecord,
): Record<string, unknown> {
  const raw = record as RoutingDatasetRecord & Record<string, unknown>;
  const exportable: Record<string, unknown> = { ...record };

  for (const key of DATASET_EXPORT_FORBIDDEN_KEYS) {
    delete exportable[key];
  }

  const sessionId = raw.session_id;
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    delete exportable.session_id;
    exportable.session_id_hash = hashSessionIdForExport(sessionId);
  }

  return exportable;
}

export function formatDatasetExportJsonl(
  records: readonly RoutingDatasetRecord[],
  outcomeRecords: readonly RoutingOutcomeRecord[] = [],
): string {
  const outcomesByRequest = indexOutcomesByRequestId(outcomeRecords);

  return records
    .map((record) => {
      const exportable = toDatasetExportRecord(record);
      const linkedOutcomes = outcomesByRequest.get(record.request_id) ?? [];
      return JSON.stringify(attachOutcomeLabelsToExport(exportable, linkedOutcomes));
    })
    .join('\n');
}

export function formatDatasetExportTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function getDatasetExportPath(cwd: string, timestamp: string): string {
  return join(cwd, DEFAULT_DATASET_EXPORT_DIR, `dataset-${timestamp}.jsonl`);
}

export interface DatasetExportResult {
  readonly path: string;
  readonly recordCount: number;
}

export async function exportDatasetToFile(
  store: StorePort,
  cwd: string,
  limit: number,
): Promise<DatasetExportResult | null> {
  const records = await store.listDatasetRecords({ limit });
  if (records.length === 0) {
    return null;
  }

  const outcomeRecords = await store.listOutcomeRecords({ limit });

  const timestamp = formatDatasetExportTimestamp();
  const exportDir = join(cwd, DEFAULT_DATASET_EXPORT_DIR);
  mkdirSync(exportDir, { recursive: true });
  const exportPath = getDatasetExportPath(cwd, timestamp);
  const jsonl = formatDatasetExportJsonl(records, outcomeRecords);
  writeFileSync(exportPath, jsonl.length > 0 ? `${jsonl}\n` : '', 'utf8');

  return { path: exportPath, recordCount: records.length };
}

export { DEFAULT_DATASET_EXPORT_LIMIT, MAX_DATASET_EXPORT_LIMIT };
