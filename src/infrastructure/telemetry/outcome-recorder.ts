/**
 * Behavioral outcome label recorder (SP-062).
 *
 * Captures model override, compaction pin break, and user feedback when
 * SMART_ROUTER_DATASET=1. Never stores prompt text.
 */

import type {
  OutcomeSignalType,
  RoutingOutcomeRecord,
} from '../../domain/types/index.js';
import { isDatasetRecordingEnabled } from './dataset-recorder.js';

export interface OutcomeRecorderOptions {
  readonly clock?: () => string;
  readonly onRecord?: (record: RoutingOutcomeRecord) => void;
}

export interface SessionRoutingSnapshot {
  readonly lastRequestId: string;
  readonly lastSelectedModelId: string;
}

export function buildOutcomeRecord(
  requestId: string,
  sessionId: string,
  signalType: OutcomeSignalType,
  timestamp: string,
  options?: {
    readonly routedModelId?: string | null;
    readonly overrideModelId?: string | null;
  },
): RoutingOutcomeRecord {
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
  private readonly clock: () => string;
  private readonly onRecord: ((record: RoutingOutcomeRecord) => void) | undefined;

  constructor(options?: OutcomeRecorderOptions) {
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.onRecord = options?.onRecord;
  }

  private recordIfEnabled(record: RoutingOutcomeRecord): RoutingOutcomeRecord | null {
    if (!isDatasetRecordingEnabled()) {
      return null;
    }

    this.onRecord?.(record);
    return record;
  }

  recordModelOverride(
    snapshot: SessionRoutingSnapshot,
    sessionId: string,
    overrideModelId: string,
  ): RoutingOutcomeRecord | null {
    if (overrideModelId === snapshot.lastSelectedModelId) {
      return null;
    }

    return this.recordIfEnabled(
      buildOutcomeRecord(
        snapshot.lastRequestId,
        sessionId,
        'model_override',
        this.clock(),
        {
          routedModelId: snapshot.lastSelectedModelId,
          overrideModelId,
        },
      ),
    );
  }

  recordCompactionPinBreak(
    snapshot: SessionRoutingSnapshot,
    sessionId: string,
  ): RoutingOutcomeRecord | null {
    return this.recordIfEnabled(
      buildOutcomeRecord(
        snapshot.lastRequestId,
        sessionId,
        'compaction_pin_break',
        this.clock(),
        { routedModelId: snapshot.lastSelectedModelId },
      ),
    );
  }

  recordFeedback(
    snapshot: SessionRoutingSnapshot,
    sessionId: string,
    rating: 'good' | 'bad',
  ): RoutingOutcomeRecord | null {
    const signalType: OutcomeSignalType =
      rating === 'good' ? 'feedback_good' : 'feedback_bad';

    return this.recordIfEnabled(
      buildOutcomeRecord(
        snapshot.lastRequestId,
        sessionId,
        signalType,
        this.clock(),
        { routedModelId: snapshot.lastSelectedModelId },
      ),
    );
  }
}
