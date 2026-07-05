/**
 * Behavioral outcome label recorder (SP-062).
 *
 * Captures model override, compaction pin break, and user feedback when
 * SMART_ROUTER_DATASET=1. Never stores prompt text.
 */
import type { OutcomeSignalType, RoutingOutcomeRecord } from '../../domain/types/index.js';
export interface OutcomeRecorderOptions {
    readonly clock?: () => string;
    readonly onRecord?: (record: RoutingOutcomeRecord) => void;
}
export interface SessionRoutingSnapshot {
    readonly lastRequestId: string;
    readonly lastSelectedModelId: string;
}
export declare function buildOutcomeRecord(requestId: string, sessionId: string, signalType: OutcomeSignalType, timestamp: string, options?: {
    readonly routedModelId?: string | null;
    readonly overrideModelId?: string | null;
}): RoutingOutcomeRecord;
export declare class OutcomeRecorder {
    private readonly clock;
    private readonly onRecord;
    constructor(options?: OutcomeRecorderOptions);
    private recordIfEnabled;
    recordModelOverride(snapshot: SessionRoutingSnapshot, sessionId: string, overrideModelId: string): RoutingOutcomeRecord | null;
    recordCompactionPinBreak(snapshot: SessionRoutingSnapshot, sessionId: string): RoutingOutcomeRecord | null;
    recordFeedback(snapshot: SessionRoutingSnapshot, sessionId: string, rating: 'good' | 'bad'): RoutingOutcomeRecord | null;
}
//# sourceMappingURL=outcome-recorder.d.ts.map