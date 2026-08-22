## Summary

Mitigate `better-sqlite3` synchronous blocking on the routing hot path: move high-frequency writes off the main thread or batch them; remove pseudo-async fire-and-forget patterns.

## Priority

P0

## Pipeline stages

`src/infrastructure/persistence/sqlite-store.ts`, `src/domain/pinning/session-pinner.ts`, telemetry/dataset writers

## Problem / motivation

`better-sqlite3` is synchronous. Patterns like `void this.store.putSessionPin(pin).catch(...)` (`session-pinner.ts` ~365) block the Node event loop while appearing async. Telemetry/dataset ingestion on hot paths can bottleneck pi under load (Gemini retry P0).

## Proposed solution

- [ ] Audit all `StorePort` write paths on routing/delegation hot path (pins, telemetry, dataset, outcomes).
- [ ] Move high-frequency writes to Worker thread **or** bounded in-memory batch queue with flush interval (document latency tradeoff).
- [ ] Remove `void … .catch()` fire-and-forget on sync SQLite methods; use explicit queue/async boundary.
- [ ] Document sync semantics on `StorePort` interface.
- [ ] Benchmark event-loop lag / p95 route latency before and after under synthetic write load.
- [ ] Sub-task (optional same PR): split `sqlite-store.ts` into repositories — see B1/A8 optional follow-ups.

## Evidence

- `src/infrastructure/persistence/sqlite-store.ts`
- `src/domain/pinning/session-pinner.ts` ~365
- Gemini retry: synchronous event-loop blocking

## Dependencies

| Issue | Role |
|-------|------|
| B3 | Session teardown reduces in-memory pressure; does not fix SQLite blocking |

## Out of scope

- Replacing SQLite with another DB
- #130 missing-dir recovery (closed)

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/sqlite-store.test.ts tests/unit/session-pinner.test.ts
# Benchmark script or test documenting event-loop block reduction
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Design + implement + benchmark | Autonomous |
