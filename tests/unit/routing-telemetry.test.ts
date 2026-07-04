import { describe, expect, it, vi } from 'vitest';

import type { RoutingDecision, RoutingRequest } from '../../src/domain/types/index.js';
import { RoutingTelemetryEmitter } from '../../src/infrastructure/telemetry/routing-telemetry.js';
import { TELEMETRY_MAX_ENTRIES } from '../../src/infrastructure/telemetry/telemetry-limits.js';

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    request_id: 'req-1',
    session_id: 'sess-1',
    prompt_text: 'hello',
    turn_type: 'main_loop',
    ...overrides,
  };
}

function makeDecision(overrides?: Partial<RoutingDecision>): RoutingDecision {
  return {
    request_id: 'req-1',
    selected_model_id: 'gpt-4o-mini',
    tier: 'economical-cloud',
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    routing_latency_ms: 3,
    pin_reason: null,
    ...overrides,
  };
}

describe('RoutingTelemetryEmitter', () => {
  it('calls onRecord with the emitted telemetry row', () => {
    const onRecord = vi.fn();
    const emitter = new RoutingTelemetryEmitter({
      clock: () => '2026-07-04T12:00:00.000Z',
      onRecord,
    });

    const record = emitter.emit(makeRequest(), makeDecision());

    expect(onRecord).toHaveBeenCalledOnce();
    expect(onRecord).toHaveBeenCalledWith(record);
    expect(record).toMatchObject({
      timestamp: '2026-07-04T12:00:00.000Z',
      session_id: 'sess-1',
      selected_model_id: 'gpt-4o-mini',
      stage: 'fallback',
      turn_type: 'main_loop',
    });
  });

  it('evicts oldest entries beyond maxEntries', () => {
    const baseTime = Date.now();
    const emitter = new RoutingTelemetryEmitter({
      maxEntries: 2,
      windowMs: 60_000,
      clock: () => new Date(baseTime).toISOString(),
    });

    emitter.emit(makeRequest({ request_id: 'req-1' }), makeDecision({ request_id: 'req-1' }));
    emitter.emit(makeRequest({ request_id: 'req-2' }), makeDecision({ request_id: 'req-2' }));
    emitter.emit(makeRequest({ request_id: 'req-3' }), makeDecision({ request_id: 'req-3' }));

    const snapshot = emitter.snapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((entry) => entry.request_id)).toEqual(['req-2', 'req-3']);
  });

  it('uses default max entries constant', () => {
    expect(TELEMETRY_MAX_ENTRIES).toBe(1111);
  });
});
