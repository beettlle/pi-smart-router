/**
 * Behavioral outcome label recorder (SP-062).
 *
 * Captures model override, compaction pin break, and user feedback when
 * SMART_ROUTER_DATASET=1. Never stores prompt text.
 */
import { isDatasetRecordingEnabled } from './dataset-recorder.js';
export function buildOutcomeRecord(requestId, sessionId, signalType, timestamp, options) {
    return {
        request_id: requestId,
        session_id: sessionId,
        timestamp,
        signal_type: signalType,
        routed_model_id: options?.routedModelId ?? null,
        override_model_id: options?.overrideModelId ?? null,
    };
}
export class OutcomeRecorder {
    clock;
    onRecord;
    constructor(options) {
        this.clock = options?.clock ?? (() => new Date().toISOString());
        this.onRecord = options?.onRecord;
    }
    recordIfEnabled(record) {
        if (!isDatasetRecordingEnabled()) {
            return null;
        }
        this.onRecord?.(record);
        return record;
    }
    recordModelOverride(snapshot, sessionId, overrideModelId) {
        if (overrideModelId === snapshot.lastSelectedModelId) {
            return null;
        }
        return this.recordIfEnabled(buildOutcomeRecord(snapshot.lastRequestId, sessionId, 'model_override', this.clock(), {
            routedModelId: snapshot.lastSelectedModelId,
            overrideModelId,
        }));
    }
    recordCompactionPinBreak(snapshot, sessionId) {
        return this.recordIfEnabled(buildOutcomeRecord(snapshot.lastRequestId, sessionId, 'compaction_pin_break', this.clock(), { routedModelId: snapshot.lastSelectedModelId }));
    }
    recordFeedback(snapshot, sessionId, rating) {
        const signalType = rating === 'good' ? 'feedback_good' : 'feedback_bad';
        return this.recordIfEnabled(buildOutcomeRecord(snapshot.lastRequestId, sessionId, signalType, this.clock(), { routedModelId: snapshot.lastSelectedModelId }));
    }
}
//# sourceMappingURL=outcome-recorder.js.map