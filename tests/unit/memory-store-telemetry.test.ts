import { describe, expect, it } from 'vitest';

import type { RoutingTelemetry } from '../../src/domain/types/index.js';
import { MemoryStore } from '../../src/infrastructure/persistence/memory-store.js';

function makeTelemetry(overrides: Partial<RoutingTelemetry> = {}): RoutingTelemetry {
  return {
    timestamp: '2026-07-04T12:00:00.000Z',
    session_id: 'sess-1',
    request_id: 'req-1',
    turn_type: 'main_loop',
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    selected_model_id: 'gpt-4o-mini',
    estimated_cost_usd: 0,
    routing_latency_ms: 2,
    pin_reason: null,
    ...overrides,
  };
}

describe('MemoryStore telemetry', () => {
  it('appends and lists telemetry newest first', async () => {
    const store = new MemoryStore();

    store.appendTelemetry(makeTelemetry({ request_id: 'req-1', selected_model_id: 'a' }));
    store.appendTelemetry(makeTelemetry({ request_id: 'req-2', selected_model_id: 'b' }));

    const rows = await store.listTelemetry({ limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.selected_model_id).toBe('b');
    expect(rows[1]?.selected_model_id).toBe('a');
  });

  it('filters telemetry by session id', async () => {
    const store = new MemoryStore();

    store.appendTelemetry(makeTelemetry({ session_id: 'sess-a', request_id: 'req-a' }));
    store.appendTelemetry(makeTelemetry({ session_id: 'sess-b', request_id: 'req-b' }));

    const rows = await store.listTelemetry({ sessionId: 'sess-a' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.request_id).toBe('req-a');
  });
});
