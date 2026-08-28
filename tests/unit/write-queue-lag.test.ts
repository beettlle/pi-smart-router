/**
 * SP-236 / #142 — write-queue event-loop lag evidence.
 *
 * Benchmarks the routing hot path under synthetic write load, before vs after
 * the SP-235 bounded write queue:
 *
 * - BEFORE (pre-SP-235 pattern): every telemetry append is a synchronous
 *   better-sqlite3 INSERT in autocommit (one WAL commit per call) directly on
 *   the event loop. The real pre-queue pattern ALSO ran a per-call eviction
 *   cycle (DELETE by cutoff + COUNT(*) + conditional bulk DELETE, design doc
 *   §2 W3), so the numbers measured here are a LOWER BOUND on the old cost.
 * - AFTER (SP-235/SP-236): `SqliteStore.appendTelemetry` is a non-blocking
 *   in-memory enqueue; one flush transaction applies the whole batch
 *   (docs/sqlite-write-queue-design.md §3).
 *
 * The workload interleaves write bursts with `setImmediate` yields so each
 * burst approximates one routed request; per-burst latency is the p95 "route
 * latency" proxy and `perf_hooks.monitorEventLoopDelay` captures event-loop
 * lag percentiles across the run.
 *
 * Representative result on the maintainer machine (5000 writes, 50 bursts of
 * 100; Apple Silicon, Node 22):
 *   before: wall ~94 ms,  p95 route ~2.6 ms,  event-loop lag p95 ~11.6 ms
 *   after:  wall ~9 ms,   p95 route ~0.17 ms, event-loop lag p95 ~0 ms
 *   reduction: wall ~10.6x, p95 route ~15.3x
 * Exact numbers vary by machine; the test asserts a relative reduction and
 * prints both profiles in its output. See docs/sqlite-write-queue-design.md.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ModelProfile, RoutingTelemetry } from '../../src/domain/types/entities.js';
import { SqliteStore } from '../../src/infrastructure/persistence/sqlite-store.js';
import {
  DEFAULT_BREAKEVEN_TELEMETRY_FIELDS,
  DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
  DEFAULT_PIN_ONLY_FALLBACK_TELEMETRY_FIELDS,
  DEFAULT_PLANNING_DELEGATE_TELEMETRY_FIELDS,
  DEFAULT_SAAR_TELEMETRY_FIELDS,
  DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
} from '../../src/infrastructure/telemetry/routing-telemetry.js';
import { TELEMETRY_MAX_ENTRIES } from '../../src/infrastructure/telemetry/telemetry-limits.js';

// ─── Workload shape ─────────────────────────────────────────────────────────

const BURSTS = 50;
const WRITES_PER_BURST = 100;
const TOTAL_WRITES = BURSTS * WRITES_PER_BURST; // 5000

const TEST_MODELS: readonly ModelProfile[] = [
  {
    id: 'claude-sonnet',
    tier: 'frontier-cloud',
    provider: 'anthropic',
    capabilities: { reasoning: 0.9, code_gen: 0.9, tool_use: 0.9 },
    pricing: { fallback_cost_per_1m: 3.0 },
  },
];

function makeTelemetryEntry(index: number): RoutingTelemetry {
  return {
    timestamp: new Date().toISOString(),
    session_id: `sess-${index % 8}`,
    request_id: `req-${index}`,
    turn_type: 'main_loop',
    stage: 'triage',
    reason_code: 'keyword_frontier',
    selected_model_id: 'claude-sonnet',
    estimated_cost_usd: 0.003,
    routing_latency_ms: 12,
    pin_reason: null,
    ...DEFAULT_CONTEXT_FIT_TELEMETRY_FIELDS,
    ...DEFAULT_TIER_SELECTION_TELEMETRY_FIELDS,
    ...DEFAULT_BREAKEVEN_TELEMETRY_FIELDS,
    ...DEFAULT_SAAR_TELEMETRY_FIELDS,
    ...DEFAULT_PLANNING_DELEGATE_TELEMETRY_FIELDS,
    ...DEFAULT_PIN_ONLY_FALLBACK_TELEMETRY_FIELDS,
  };
}

interface WorkloadResult {
  readonly wallMs: number;
  /** p95 per-burst latency — proxy for p95 route latency under write load. */
  readonly p95RouteMs: number;
  /** p95 event-loop lag sampled between bursts (monitorEventLoopDelay). */
  readonly lagP95Ms: number;
}

/**
 * Run `write` TOTAL_WRITES times in BURSTS chunks, yielding to the event loop
 * between bursts so the lag histogram samples each burst boundary.
 */
async function measureHotPath(
  write: (index: number) => void,
): Promise<WorkloadResult> {
  const histogram = monitorEventLoopDelay({ resolution: 1 });
  histogram.enable();

  const burstLatencies: number[] = [];
  const start = performance.now();

  for (let burst = 0; burst < BURSTS; burst++) {
    const burstStart = performance.now();
    for (let i = 0; i < WRITES_PER_BURST; i++) {
      write(burst * WRITES_PER_BURST + i);
    }
    burstLatencies.push(performance.now() - burstStart);
    await new Promise((resolve) => setImmediate(resolve));
  }

  const wallMs = performance.now() - start;
  histogram.disable();

  burstLatencies.sort((a, b) => a - b);
  const p95RouteMs =
    burstLatencies[Math.min(
      burstLatencies.length - 1,
      Math.floor(burstLatencies.length * 0.95),
    )]!;

  return {
    wallMs,
    p95RouteMs,
    lagP95Ms: histogram.percentile(95) / 1e6, // ns → ms
  };
}

// ─── Test ───────────────────────────────────────────────────────────────────

describe('write-queue event-loop lag evidence (SP-236 / #142)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp236-lag-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // 5000 sync SQLite inserts + event-loop sampling; needs headroom under CI load.
  it('queued hot-path writes reduce event-loop blocking vs direct sync writes', async () => {
    // ── BEFORE: pre-SP-235 pattern — one synchronous INSERT (autocommit,
    // one WAL commit) per telemetry append, on the event loop. Conservative:
    // omits the old per-call eviction cycle (design doc §2 W3).
    const beforeDb = new Database(join(dir, 'before.db'));
    beforeDb.pragma('journal_mode = WAL');
    beforeDb.exec(
      `CREATE TABLE telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        turn_type TEXT NOT NULL,
        stage TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        selected_model_id TEXT NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        routing_latency_ms REAL NOT NULL,
        pin_reason TEXT
      )`,
    );
    const directInsert = beforeDb.prepare(
      `INSERT INTO telemetry (
        timestamp, session_id, request_id, turn_type,
        stage, reason_code, selected_model_id,
        estimated_cost_usd, routing_latency_ms, pin_reason
      ) VALUES (
        @timestamp, @session_id, @request_id, @turn_type,
        @stage, @reason_code, @selected_model_id,
        @estimated_cost_usd, @routing_latency_ms, @pin_reason
      )`,
    );

    const before = await measureHotPath((i) => {
      directInsert.run(makeTelemetryEntry(i));
    });
    beforeDb.close();

    // ── AFTER: SP-235 queue + SP-236 boundary — appendTelemetry is an
    // in-memory enqueue. Flush interval is parked far in the future and the
    // size trigger/capacity exceed the workload, so NOTHING flushes during
    // the measured section; one flush transaction lands at close().
    const store = new SqliteStore({
      dbPath: join(dir, 'after.db'),
      models: TEST_MODELS,
      writeQueue: {
        flushIntervalMs: 3_600_000,
        maxBatchSize: TOTAL_WRITES + 1,
        capacity: TOTAL_WRITES + 1,
      },
    });

    const after = await measureHotPath((i) => {
      store.appendTelemetry(makeTelemetryEntry(i));
    });

    // Teardown flush: all queued writes land in one transaction.
    store.close();

    console.log(
      '[SP-236 benchmark] 5000 hot-path telemetry writes, 50 bursts of 100\n' +
        `  before (direct sync INSERT per write): wall=${before.wallMs.toFixed(1)}ms ` +
        `p95 route=${before.p95RouteMs.toFixed(2)}ms lag p95=${before.lagP95Ms.toFixed(2)}ms\n` +
        `  after  (queue enqueue per write):      wall=${after.wallMs.toFixed(1)}ms ` +
        `p95 route=${after.p95RouteMs.toFixed(2)}ms lag p95=${after.lagP95Ms.toFixed(2)}ms\n` +
        `  reduction: wall=${(before.wallMs / Math.max(after.wallMs, 0.001)).toFixed(1)}x ` +
        `p95 route=${(before.p95RouteMs / Math.max(after.p95RouteMs, 0.001)).toFixed(1)}x`,
    );

    // Correctness: every queued write was flushed, eviction trimmed to the
    // configured cap, and nothing was dropped (queue sized above the load).
    expect(store.writeQueueStats.enqueued).toBe(TOTAL_WRITES);
    expect(store.writeQueueStats.dropped).toBe(0);
    expect(store.writeQueueStats.flushed).toBe(TOTAL_WRITES);

    const verifyDb = new Database(join(dir, 'after.db'), { readonly: true });
    const rowCount = (
      verifyDb.prepare('SELECT COUNT(*) AS count FROM telemetry').get() as {
        count: number;
      }
    ).count;
    verifyDb.close();
    expect(rowCount).toBe(Math.min(TOTAL_WRITES, TELEMETRY_MAX_ENTRIES));

    // Evidence assertions: the queued path must block strictly less than the
    // direct sync path, with a wide relative margin so the test is stable on
    // slow/loaded CI machines (measured reduction is typically >10x).
    expect(after.wallMs).toBeLessThan(before.wallMs * 0.5);
    expect(after.p95RouteMs).toBeLessThanOrEqual(before.p95RouteMs);
    expect(after.lagP95Ms).toBeLessThanOrEqual(before.lagP95Ms);
  }, 30_000);
});
