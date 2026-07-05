/**
 * Privacy-safe routing dataset recorder (SP-058).
 *
 * Maps routing decisions and feature sidecars to RoutingDatasetRecord when
 * SMART_ROUTER_DATASET=1. Never stores prompt text, messages, or tool arguments.
 */
import type { RoutingDatasetRecord, RoutingDecision, RoutingRequest } from '../../domain/types/index.js';
export declare const DATASET_ENABLED_NOTIFY_MESSAGE = "Smart Router dataset mode is enabled. Recording routing metadata and feature fields only \u2014 prompt text, messages, and tool arguments are never stored.";
export declare function isDatasetRecordingEnabled(): boolean;
export interface DatasetRecorderOptions {
    readonly clock?: () => string;
    readonly onRecord?: (record: RoutingDatasetRecord) => void;
    readonly onFirstEnable?: () => void;
}
/** Map a completed routing decision to a privacy-safe dataset row. */
export declare function buildDatasetRecord(request: RoutingRequest, decision: RoutingDecision, timestamp: string): RoutingDatasetRecord;
export declare class DatasetRecorder {
    private readonly clock;
    private readonly onRecord;
    private readonly onFirstEnable;
    private enabledNotified;
    constructor(options?: DatasetRecorderOptions);
    /** Record a routing decision when dataset mode is enabled; no-op when off. */
    record(request: RoutingRequest, decision: RoutingDecision): RoutingDatasetRecord | null;
}
//# sourceMappingURL=dataset-recorder.d.ts.map