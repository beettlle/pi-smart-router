# Task: SP-236 — Remove fire-and-forget SQLite writes + benchmark + StorePort docs

**Created:** 2026-08-27
**Size:** S

## Review Level: 1

**Assessment:** Close #142 — remove void.catch fire-and-forget on sync SQLite methods; document StorePort sync semantics; record event-loop lag / p95 route latency before/after under synthetic write load.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#142
- Bucket: enhancement
- Closes: #142
- Release: v0.18.0
- Manifest: `spine-tasks/_authoring/release-v0.18.0/manifest.md`

## Mission

Closes #142 — After SP-235 queue wiring: remove remaining `void … .catch()` fire-and-forget on sync SQLite methods; use the explicit queue/async boundary. Document sync semantics on the `StorePort` interface. Add a benchmark script or test documenting event-loop block reduction (before/after under synthetic write load). Optional same-task: notes only on splitting `sqlite-store.ts` into repositories (do not execute B1/A8 split).

## Dependencies

- **Task:** SP-235 (queue must be live before removing fire-and-forget)

## Context to Read First

- SP-235 queue wiring
- `src/domain/pinning/session-pinner.ts` (~365 void.catch and remaining sites)
- StorePort interface
- `tests/unit/sqlite-store.test.ts`, `tests/unit/session-pinner.test.ts`
- Parent split: SP-234/SP-235 — earlier #142 phases

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/store-port.ts`, `tests/unit/write-queue-lag.test.ts` (create), residual `void … .catch` cleanup in `src/domain/pinning/session-pinner.ts` |
| May change | `src/infrastructure/persistence/sqlite-store.ts`, `tests/unit/session-pinner.test.ts`, `docs/sqlite-write-queue-design.md` |
| Must NOT change | Gemini paths (#158/#159); full sqlite repository split epic |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/sqlite-store.test.ts tests/unit/session-pinner.test.ts tests/unit/write-queue-lag.test.ts` |
| fileScopeMustChange | `src/domain/types/store-port.ts`, `tests/unit/write-queue-lag.test.ts` |
| fileScopeMustNotChange | `src/domain/delegation/delegation-context.ts` |

## Steps

### Step 1: Remove fire-and-forget + document StorePort

- [ ] Replace remaining void.catch sync write patterns with queue/async boundary
- [ ] Document sync semantics on StorePort

### Step 2: Benchmark evidence

- [ ] Script or test: event-loop lag / p95 route latency under synthetic write load (before/after or relative reduction)
- [ ] Record results in test output or short comment/doc adjacent to benchmark

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Fire-and-forget removed; StorePort documented; benchmark evidence present
- [ ] #142 closable

## Do NOT

- Replace SQLite; execute B1 god-object / full repository split
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

## Git Commit Convention

- `feat(SP-236): description`

## Amendments

### Amendment 1 — 2026-08-27

**Issue:** Preflight `prelanded-file-scope` — SP-235 already changed `src/domain/pinning/session-pinner.ts` on main (queue wiring). Contract `fileScopeMustChange` on that path alone would not prove SP-236 delivery in a new lane.
**Resolution:** Redirect `fileScopeMustChange` to StorePort sync docs (`src/domain/types/store-port.ts`) and new lag evidence test (`tests/unit/write-queue-lag.test.ts`). Residual `void … .catch` cleanup in `session-pinner.ts` remains in File Scope Must change but is not the sole contract proof.
