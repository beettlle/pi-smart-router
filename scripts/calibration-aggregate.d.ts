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
import { P_SUCCESS_FAILURE_PROXY_FIELDS, type PSuccessFailureProxyField } from '../src/domain/routing/p-success-classifier.js';
export declare const DEFAULT_CONTRIB_DIR = "data/contrib";
/** Documented minimum labeled rows before each artifact deviates from defaults. */
export declare const MINIMUM_TRAINING_SAMPLES: {
    readonly hydra_projection: 100;
    readonly triage_thresholds: 50;
    readonly p_success_weights: 30;
    readonly isotonic_calibrator: 30;
    readonly routing_centroids: 10;
};
/** Keys whose presence rejects the whole contrib row (prompt content, raw identifiers). */
export declare const CALIBRATION_CONTRIB_REJECT_KEYS: readonly string[];
/** Install-local pepper and correlation fields — stripped after validation, not rejected. */
export declare const CALIBRATION_CONTRIB_STRIP_KEYS: readonly string[];
/** Keys whose names suggest prompt or message content — reject on ingest. */
export declare const CONTRIB_TAINTED_KEY_PATTERN: RegExp;
export declare class CalibrationContribError extends Error {
    readonly name = "CalibrationContribError";
    constructor(message: string, options?: ErrorOptions);
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
/** Raw telemetry keys mapped into privacy-safe failure proxy fields (SP-131). */
export declare const CALIBRATION_CONTRIB_STRIP_AFTER_PROXY_MAP: readonly string[];
export { P_SUCCESS_FAILURE_PROXY_FIELDS };
export type { PSuccessFailureProxyField };
/** Fail closed when a contrib row contains forbidden or tainted keys. */
export declare function assertContribRecordSafe(record: unknown, context?: string): asserts record is Record<string, unknown>;
/** Strip install-local pepper fields from a validated contrib row. */
export declare function sanitizeContribRecord(record: Record<string, unknown>): Record<string, unknown>;
/** Map telemetry scalars to normalized failure proxies and refreshed training labels. */
export declare function enrichContribRecordWithFailureLabels(record: Record<string, unknown>): Record<string, unknown>;
export declare function enrichContribRecords(records: readonly Record<string, unknown>[]): Record<string, unknown>[];
export declare function parseContribJsonl(text: string, source?: string): Record<string, unknown>[];
export declare function parseContribJson(text: string, source?: string): Record<string, unknown>[];
export declare function readContribFile(filePath: string): Record<string, unknown>[];
export declare function collectContribFromDir(contribDir: string): CalibrationAggregateResult;
export declare function readContribFromStdin(): Promise<Record<string, unknown>[]>;
export declare function aggregateContribRecords(batches: ReadonlyArray<readonly Record<string, unknown>[]>): Record<string, unknown>[];
export declare function formatContribJsonl(records: readonly Record<string, unknown>[]): string;
//# sourceMappingURL=calibration-aggregate.d.ts.map