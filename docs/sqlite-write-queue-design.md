# SQLite Hot-Path Write Audit + Bounded Write-Queue Design

**Task:** SP-234 — phase 1 of [#142](https://github.com/beettlle/pi-smart-router/issues/142) (P0)
**Date:** 2026-08-27
**Status:** Design only. Implementation lands in SP-235; fire-and-forget removal + benchmark in SP-236.

---

## 1. Problem

`better-sqlite3` is **synchronous**: every `prepare().run()` executes on the Node
event loop. Two patterns make this worse on the routing hot path:

1. **Pseudo-async fire-and-forget** — `void this.store.putSessionPin(pin).catch(...)`
   (`session-pinner.ts`). `SqliteStore.putSessionPin` is declared `async`, but its
   body is fully synchronous: the INSERT runs **before** the promise is returned.
   The `.catch()` dresses a blocking call up as async without moving any work off
   the event loop, and ordering between successive pin writes is only implicit.
2. **Sync appenders with per-call eviction** — `appendTelemetry`,
   `appendDatasetRecord`, `appendOutcomeRecord` each run an INSERT plus an
   eviction cycle (`DELETE` by time cutoff + `COUNT(*)` + conditional bulk
   `DELETE`) on **every** routing decision.

Under load (e.g. Gemini retry storms) these writes bottleneck pi's event loop and
inflate p95 route latency, even though individual statements are fast in WAL mode.

## 2. Hot-path write inventory

| # | Write site (`SqliteStore`) | Hot-path caller | Pattern | Statements per call | Blocks event loop? | Queue candidate? |
|---|----------------------------|-----------------|---------|--------------------|--------------------|------------------|
| W1 | `putSessionPin` (upsert) | `SessionPinner.persistPin` ← `recordPin` / `loadPin` ← `lookupPin` (sync, "<1ms" budget) — `session-pinner.ts` ~893 | Pseudo-async `void … .catch()`; body is sync | 1 INSERT … ON CONFLICT | **Yes** | **Yes** (durable class) |
| W2 | `deleteSessionPin` | `SessionPinner.deletePersistedPin` ← `breakPin` ← `lookupPin` break rules — `session-pinner.ts` ~903 | Pseudo-async `void … .catch()`; body is sync | 1 DELETE | **Yes** | **Yes** (durable class) |
| W3 | `appendTelemetry` | `RoutingTelemetryEmitter.emit` → `onRecord` ← `router-pipeline.route()` (`router-pipeline.ts` ~663, ~697); wired in `fleet-bootstrap.ts` ~230 | Fully sync call | 1 INSERT + eviction (DELETE + COUNT + optional DELETE) = 2–4 | **Yes** | **Yes** (lossy class, primary target) |
| W4 | `appendDatasetRecord` | `route-and-delegate.ts` ~393 `datasetRecorder.record()` → `onRecord` (`dataset-export.ts` ~52) | Fully sync call | 1 INSERT + eviction = 2–4 | **Yes** | **Yes** (lossy class) |
| W5 | `appendOutcomeRecord` | `routing-outcomes.ts` `recordModelOverride` / `recordCompactionPinBreak` → `onRecord` (`dataset-export.ts` ~63) | Fully sync call | 1 INSERT + eviction = 2–4 | **Yes**, but low frequency (override/compaction only) | **Yes** (lossy class, shares queue) |
| W6 | `consumeToken` | `gateway-dispatch.dispatchWithRateLimit` ~222 (every request when rate limiting enabled) | Sync `BEGIN IMMEDIATE` read-modify-write tx | SELECT + UPDATE in tx | **Yes, by design** | **No** — atomicity required (TOCTOU); batching would break rate-limit correctness |
| W7 | `putPriceCatalog` | `pricing-lifecycle.ts` ~21 (startup / periodic refresh) | Properly awaited | 1 upsert | Cold path | No |
| W8 | `initBucket` | `createSqliteRateLimiter` lazy bucket create (`utils.ts`) | Sync | 1 INSERT OR IGNORE | Rare | No |

Reads (`getSessionPin`, `listTelemetry`, `listDatasetRecords`,
`listOutcomeRecords`, `getPriceCatalog`, `getModelProfiles`) are unaffected by the
queue and stay synchronous.

## 3. Design: bounded in-memory write queue

Module: `src/infrastructure/persistence/write-queue.ts` (interface + stub in
SP-234; production wiring in SP-235).

### 3.1 API

```ts
type WriteOp =
  | { kind: 'put-pin'; pin: SessionPin }
  | { kind: 'delete-pin'; sessionId: string }
  | { kind: 'append-telemetry'; entry: RoutingTelemetry }
  | { kind: 'append-dataset'; entry: RoutingDatasetRecord }
  | { kind: 'append-outcome'; entry: RoutingOutcomeRecord };

interface WriteQueue {
  /** Enqueue one op. Returns whether it was accepted (false = dropped by backpressure). */
  enqueue(op: WriteOp): boolean;
  /** Drain all pending ops in one transaction. Called by timer, size trigger, and shutdown. */
  flush(): void;
  /** Flush synchronously and stop the timer. Call on session teardown. */
  close(): void;
  readonly stats: { enqueued: number; dropped: number; flushed: number };
}
```

### 3.2 Flush policy

- **Interval flush** — `setInterval(flush, flushIntervalMs)`, `unref()`'d so it
  never keeps the process alive. Default **250 ms**.
- **Size trigger** — flush immediately when pending ops reach `maxBatchSize`
  (default 64) so a burst cannot accumulate a full-interval backlog.
- **Single transaction per flush** — the whole batch is wrapped in one
  `db.transaction(...)`, amortizing WAL commit/fsync cost across the batch
  instead of paying it per statement. Per-call eviction (W3–W5) moves to
  **once per flush** instead of once per INSERT.
- **Shutdown flush** — `close()` is invoked from the extension's session
  teardown so at most one flush interval of writes is ever at risk.

### 3.3 Backpressure: two durability classes

| Class | Ops | Full-queue policy |
|-------|-----|-------------------|
| **Lossy** | telemetry, dataset, outcome appends (W3–W5) | **Drop-oldest**: evict the oldest lossy op, count it in `stats.dropped`. Audit/observability data; bounded loss is acceptable and preferable to blocking routing. |
| **Durable** | pin upsert/delete (W1–W2) | **Never dropped.** If the queue is full of durable ops, `enqueue` triggers a **synchronous flush** (block once, preserve correctness) — this is the degenerate case the queue exists to make rare. |

Queue capacity default: **1024 ops** (≈ worst-case a few hundred KB of heap;
telemetry rows are the largest payloads).

### 3.4 Ordering

FIFO per session. Pin ops for the same session are applied in enqueue order, so
the final upsert/delete wins — matching today's implicit ordering.

### 3.5 Latency tradeoff (documented for operators)

| Dimension | Today (sync writes) | With queue |
|-----------|--------------------|------------|
| Route latency | Every decision pays 1–4 sync SQLite statements + eviction on the event loop | Hot path pays an in-memory `enqueue` (~µs); SQLite work amortized into one tx per flush |
| Write visibility | Immediately readable | Delayed up to `flushIntervalMs` (default 250 ms): `listTelemetry` / `listDatasetRecords` / `listOutcomeRecords` may lag the newest rows by one interval; pin state may lag disk but the pinner's **in-memory Map remains authoritative** for routing |
| Crash durability | All committed writes survive | Up to one flush interval of queued writes is lost on hard crash (bounded by capacity 1024 / interval 250 ms) |
| Rate limiting | — | Unchanged: `consumeToken` stays synchronous (W6) |

This is an explicit trade: **bounded observability/durability lag for a
non-blocking routing hot path.** The pinner already treats its in-memory Map as
the read path (restore-on-start, persist-on-change), so queued pin writes do not
change routing behavior.

### 3.6 Worker-thread alternative (rejected for SP-235)

Running `better-sqlite3` on a `worker_thread` removes even flush-time blocking,
but adds: structured-clone serialization per op, a second DB connection (WAL
allows one writer — the worker must own **all** writes including `consumeToken`,
or coordination complexity returns), and startup/shutdown complexity in the pi
extension host. The single-writer batch queue captures most of the win (writes
leave the per-request path; flush is one tx per 250 ms) with a fraction of the
risk. Revisit only if SP-236 benchmarks show flush-time blocking still matters.

## 4. Follow-ups

- **SP-235** — implement `write-queue.ts` against this design; wire
  `SqliteStore` write methods (or a decorating store) to enqueue; move eviction
  to flush-time; add shutdown flush.
- **SP-236** — remove `void … .catch()` fire-and-forget in `session-pinner.ts`
  (replaced by the explicit queue boundary); benchmark event-loop lag / p95
  route latency before/after under synthetic write load.
