/**
 * Privacy-safe routing dataset recorder (SP-058).
 *
 * Maps routing decisions and feature sidecars to RoutingDatasetRecord when
 * SMART_ROUTER_DATASET=1. Never stores prompt text, messages, or tool arguments.
 *
 * Optional install-local prompt fingerprints (SP-061) when
 * SMART_ROUTER_DATASET_FINGERPRINT=1.
 */
import type { RoutingDatasetRecord, RoutingDecision, RoutingRequest } from '../../domain/types/index.js';
export declare const DATASET_ENABLED_NOTIFY_MESSAGE = "Smart Router dataset mode is enabled. Recording routing metadata and feature fields only \u2014 prompt text, messages, and tool arguments are never stored.";
export declare const DATASET_STATE_DIR = ".pi-smart-router";
export declare const DATASET_PEPPER_FILENAME = ".dataset-key";
export declare function isDatasetRecordingEnabled(): boolean;
export declare function isDatasetFingerprintEnabled(): boolean;
export declare function getDatasetPepperPath(cwd?: string): string;
/** Load or create the install-local dataset pepper (never exported). */
export declare function loadOrCreateDatasetPepper(cwd?: string): Buffer;
/** Collapse whitespace and trim for stable duplicate detection. */
export declare function normalizePromptForFingerprint(prompt: string): string;
export declare function computePromptFingerprint(pepper: Buffer, prompt: string): string;
export interface DatasetRecorderOptions {
    readonly clock?: () => string;
    readonly onRecord?: (record: RoutingDatasetRecord) => void;
    readonly onFirstEnable?: () => void;
    readonly cwd?: string;
    readonly loadPepper?: (cwd: string) => Buffer;
}
/** Map a completed routing decision to a privacy-safe dataset row. */
export declare function buildDatasetRecord(request: RoutingRequest, decision: RoutingDecision, timestamp: string, promptFingerprint?: string | null): RoutingDatasetRecord;
export declare class DatasetRecorder {
    private readonly clock;
    private readonly onRecord;
    private readonly onFirstEnable;
    private readonly cwd;
    private readonly loadPepper;
    private enabledNotified;
    private pepper;
    constructor(options?: DatasetRecorderOptions);
    private getPepper;
    /** Record a routing decision when dataset mode is enabled; no-op when off. */
    record(request: RoutingRequest, decision: RoutingDecision): RoutingDatasetRecord | null;
}
//# sourceMappingURL=dataset-recorder.d.ts.map
