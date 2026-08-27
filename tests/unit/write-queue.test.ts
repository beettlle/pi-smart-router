import { describe, expect, it, vi } from 'vitest';

import type { RoutingTelemetry, SessionPin } from '../../src/domain/types/entities.js';
import {
  createWriteQueue,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_BATCH_SIZE,
  DEFAULT_QUEUE_CAPACITY,
  DURABLE_OP_KINDS,
  type WriteOp,
} from '../../src/infrastructure/persistence/write-queue.js';

function makePin(sessionId = 'sess-1'): SessionPin {
  return {
    session_id: sessionId,
    pinned_model_id: 'claude-sonnet',
    pin_reason: 'initial',
    has_ever_switched: false,
    consecutive_upstream_errors: 0,
    consecutive_tool_failures: 0,
    last_tool_failure_signature: null,
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T00:00:00.000Z',
  };
}

function makeTelemetry(requestId: string): WriteOp {
  return {
    kind: 'append-telemetry',
    entry: { request_id: requestId } as unknown as RoutingTelemetry,
  };
}

describe('write-queue', () => {
  describe('enqueue + flush', () => {
    it('batches enqueued ops into a single FIFO sink call on flush', () => {
      const batches: WriteOp[][] = [];
      const queue = createWriteQueue((batch) => {
        batches.push([...batch]);
      });

      expect(queue.enqueue({ kind: 'put-pin', pin: makePin() })).toBe(true);
      expect(queue.enqueue(makeTelemetry('req-1'))).toBe(true);
      expect(queue.enqueue({ kind: 'delete-pin', sessionId: 'sess-9' })).toBe(true);

      // Nothing applied before flush.
      expect(batches).toHaveLength(0);
      expect(queue.stats.enqueued).toBe(3);
      expect(queue.stats.flushed).toBe(0);

      queue.flush();

      expect(batches).toHaveLength(1);
      expect(batches[0]?.map((op) => op.kind)).toEqual([
        'put-pin',
        'append-telemetry',
        'delete-pin',
      ]);
      expect(queue.stats.flushed).toBe(3);
      expect(queue.stats.flushCount).toBe(1);

      queue.close();
    });

    it('flush on an empty queue is a no-op', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink);

      queue.flush();

      expect(sink).not.toHaveBeenCalled();
      expect(queue.stats.flushCount).toBe(0);
      queue.close();
    });

    it('flushes on the interval timer', () => {
      vi.useFakeTimers();
      try {
        const sink = vi.fn();
        const queue = createWriteQueue(sink, { flushIntervalMs: 100 });

        queue.enqueue(makeTelemetry('req-timer'));
        expect(sink).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);

        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink.mock.calls[0]?.[0]).toHaveLength(1);

        queue.close();
      } finally {
        vi.useRealTimers();
      }
    });

    it('flushes immediately when pending ops reach maxBatchSize', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink, {
        maxBatchSize: 4,
        flushIntervalMs: 60_000,
      });

      for (let i = 0; i < 3; i++) {
        queue.enqueue(makeTelemetry(`req-${i}`));
      }
      expect(sink).not.toHaveBeenCalled();

      queue.enqueue(makeTelemetry('req-3'));
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink.mock.calls[0]?.[0]).toHaveLength(4);

      queue.close();
    });

    it('propagates sink errors to explicit flush callers (fail loud)', () => {
      const queue = createWriteQueue(() => {
        throw new Error('disk on fire');
      });
      queue.enqueue(makeTelemetry('req-boom'));

      expect(() => queue.flush()).toThrow('disk on fire');
    });

    it('interval flush catches sink errors instead of crashing the host', () => {
      vi.useFakeTimers();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const queue = createWriteQueue(() => {
          throw new Error('transient');
        });
        queue.enqueue(makeTelemetry('req-warn'));

        expect(() => vi.advanceTimersByTime(DEFAULT_FLUSH_INTERVAL_MS)).not.toThrow();
        expect(warn).toHaveBeenCalled();

        warn.mockClear();
        queue.close();
      } finally {
        warn.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  describe('backpressure', () => {
    it('drops the oldest lossy op when the queue is full', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink, {
        capacity: 3,
        // Size trigger above capacity so backpressure (not the trigger) fires.
        maxBatchSize: 100,
        flushIntervalMs: 60_000,
      });

      queue.enqueue(makeTelemetry('req-0'));
      queue.enqueue(makeTelemetry('req-1'));
      queue.enqueue(makeTelemetry('req-2'));

      // Queue full — oldest lossy op (req-0) is dropped, new op accepted.
      expect(queue.enqueue(makeTelemetry('req-3'))).toBe(true);
      expect(queue.stats.dropped).toBe(1);
      expect(queue.stats.enqueued).toBe(4);

      queue.flush();
      const flushed = sink.mock.calls[0]?.[0] as WriteOp[];
      const requestIds = flushed
        .filter((op) => op.kind === 'append-telemetry')
        .map((op) => (op.entry as { request_id: string }).request_id);
      expect(requestIds).toEqual(['req-1', 'req-2', 'req-3']);

      queue.close();
    });

    it('drop-oldest skips durable ops and evicts the oldest lossy one', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink, {
        capacity: 3,
        maxBatchSize: 100,
        flushIntervalMs: 60_000,
      });

      // Durable op is oldest — it must survive; the oldest lossy op drops.
      queue.enqueue({ kind: 'put-pin', pin: makePin() });
      queue.enqueue(makeTelemetry('req-0'));
      queue.enqueue(makeTelemetry('req-1'));

      queue.enqueue(makeTelemetry('req-2'));
      expect(queue.stats.dropped).toBe(1);

      queue.flush();
      const flushed = sink.mock.calls[0]?.[0] as WriteOp[];
      expect(flushed.map((op) => op.kind)).toEqual([
        'put-pin',
        'append-telemetry',
        'append-telemetry',
      ]);

      queue.close();
    });

    it('never drops durable ops — a full queue forces a synchronous flush', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink, {
        capacity: 2,
        maxBatchSize: 100,
        flushIntervalMs: 60_000,
      });

      queue.enqueue({ kind: 'put-pin', pin: makePin('sess-a') });
      queue.enqueue({ kind: 'put-pin', pin: makePin('sess-b') });
      expect(sink).not.toHaveBeenCalled();

      // Third durable op on a full queue: sync flush, then enqueue.
      expect(queue.enqueue({ kind: 'delete-pin', sessionId: 'sess-a' })).toBe(true);
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink.mock.calls[0]?.[0]).toHaveLength(2);
      expect(queue.stats.dropped).toBe(0);

      queue.close();
    });

    it('forces a synchronous flush when a lossy op arrives at an all-durable full queue', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink, {
        capacity: 2,
        maxBatchSize: 100,
        flushIntervalMs: 60_000,
      });

      queue.enqueue({ kind: 'put-pin', pin: makePin('sess-a') });
      queue.enqueue({ kind: 'delete-pin', sessionId: 'sess-b' });

      expect(queue.enqueue(makeTelemetry('req-lossy'))).toBe(true);
      expect(queue.stats.dropped).toBe(0);
      expect(sink).toHaveBeenCalledTimes(1);

      queue.close();
    });

    it('exposes the documented defaults', () => {
      expect(DEFAULT_FLUSH_INTERVAL_MS).toBe(250);
      expect(DEFAULT_MAX_BATCH_SIZE).toBe(64);
      expect(DEFAULT_QUEUE_CAPACITY).toBe(1024);
      expect(DURABLE_OP_KINDS.has('put-pin')).toBe(true);
      expect(DURABLE_OP_KINDS.has('delete-pin')).toBe(true);
      expect(DURABLE_OP_KINDS.has('append-telemetry')).toBe(false);
    });
  });

  describe('close', () => {
    it('flushes pending ops and stops the timer', () => {
      vi.useFakeTimers();
      try {
        const sink = vi.fn();
        const queue = createWriteQueue(sink, { flushIntervalMs: 100 });

        queue.enqueue(makeTelemetry('req-pending'));
        queue.close();

        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink.mock.calls[0]?.[0]).toHaveLength(1);

        // Timer stopped — no further flushes.
        vi.advanceTimersByTime(1000);
        expect(sink).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('is idempotent', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink);
      queue.enqueue(makeTelemetry('req-once'));

      queue.close();
      queue.close();

      expect(sink).toHaveBeenCalledTimes(1);
    });

    it('drops lossy ops enqueued after close', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink);
      queue.close();

      expect(queue.enqueue(makeTelemetry('req-late'))).toBe(false);
      expect(queue.stats.dropped).toBe(1);
      expect(sink).not.toHaveBeenCalled();
    });

    it('applies durable ops enqueued after close immediately (best effort)', () => {
      const sink = vi.fn();
      const queue = createWriteQueue(sink);
      queue.close();

      expect(queue.enqueue({ kind: 'put-pin', pin: makePin() })).toBe(true);
      expect(sink).toHaveBeenCalledTimes(1);
      expect(queue.stats.flushed).toBe(1);
    });
  });
});
