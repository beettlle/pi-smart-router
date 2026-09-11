/**
 * Shared contrib-row → labeled training sample parsing for offline trainers (SP-270).
 *
 * Aggregate output from `routing:calibration-aggregate` deliberately strips
 * `request_id` (install-local pepper, `CALIBRATION_CONTRIB_STRIP_KEYS`), but
 * `parseTrainingExportLine` hard-requires it — so real aggregates previously
 * trained zero samples. This helper accepts request_id-less rows by falling
 * back to a deterministic caller-supplied id (keeps isotonic hash splits
 * reproducible without reintroducing an identifier).
 *
 * Rows whose derived label is `null` (no boolean `success_label`, no outcome
 * signals) are skipped entirely — labels are never invented (#110 rule).
 */

import {
  deriveSuccessLabelFromExportRow,
  extractPSuccessFeatures,
  type LabeledTrainingSample,
} from '../../src/domain/routing/p-success-classifier.js';
import type { RoutingDatasetRecord } from '../../src/domain/types/index.js';

/**
 * Convert a privacy-safe contrib/aggregate record into a training sample.
 *
 * @param record Contrib row (feature vectors + outcome scalars only).
 * @param fallbackRequestId Deterministic id used when neither `record.row_id`
 *   nor `record.request_id` is present (e.g. `aggregate-row-7`); must be stable
 *   across runs of the same input so the isotonic holdout split is reproducible.
 * @returns The labeled sample, or `null` when the row carries no label.
 */
export function labeledSampleFromContribRecord(
  record: Record<string, unknown>,
  fallbackRequestId: string,
): LabeledTrainingSample | null {
  const labeled = deriveSuccessLabelFromExportRow(record);
  if (labeled.success === null) {
    return null;
  }

  // SP-285 / #170: prefer the stable per-install row_id (HMAC of request_id) —
  // aggregate position shifts as files are added/removed, which would make
  // index-based ids (and therefore isotonic holdout splits) unstable.
  const rowId = record.row_id;
  const explicitRequestId = record.request_id;
  const requestId =
    typeof rowId === 'string' && rowId.length > 0
      ? rowId
      : typeof explicitRequestId === 'string' && explicitRequestId.length > 0
        ? explicitRequestId
        : fallbackRequestId;

  return {
    request_id: requestId,
    features: extractPSuccessFeatures(record as unknown as RoutingDatasetRecord),
    success: labeled.success,
    outcome_signals: labeled.outcome_signals,
    failure_proxies: labeled.failure_proxies,
  };
}

/** Deterministic fallback id for the row at `index` of an aggregate JSONL file. */
export function aggregateRowRequestId(index: number): string {
  return `aggregate-row-${index}`;
}
