# Task: SP-235 — Implement bounded async write queue for pins/telemetry

**Created:** 2026-08-27
**Size:** M

## Review Level: 1

**Assessment:** Implement SP-234 queue design; move high-frequency pin/telemetry (and related hot-path) writes onto bounded batch flush. Leave residual void.catch cleanup + benchmark to SP-236.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#142
- Bucket: enhancement
- Partial: #142
- Release: v0.18.0
- Manifest: `spine-tasks/_authoring/release-v0.18.0/manifest.md`

## Mission

Partial #142 — Implement the bounded in-memory batch queue (or Worker) designed in SP-234. Wire high-frequency hot-path writes (pins, telemetry, and other audited sites) through the queue so synchronous `better-sqlite3` work is batched off the immediate route/delegation turn. Respect backpressure and flush interval from the design. Do not claim #142 closed until SP-236 removes remaining fire-and-forget patterns, documents StorePort sync semantics, and records before/after lag evidence.

## Dependencies

- **Task:** SP-234 (queue design + audit must exist)

## Context to Read First

- SP-234 deliverables (queue interface / design note)
- `src/infrastructure/persistence/sqlite-store.ts`
- `src/domain/pinning/session-pinner.ts`
- `tests/unit/sqlite-store.test.ts`, `tests/unit/session-pinner.test.ts`
- Parent split: SP-234 — design half of #142

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/persistence/sqlite-store.ts`, `src/domain/pinning/session-pinner.ts` |
| May change | StorePort impl helpers, `tests/unit/sqlite-store.test.ts`, `tests/unit/session-pinner.test.ts`, new queue module under `src/infrastructure/persistence/` |
| Must NOT change | Gemini repair/guard/failover (#158/#159); full repository split epic |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/sqlite-store.test.ts tests/unit/session-pinner.test.ts` |
| fileScopeMustChange | `src/infrastructure/persistence/sqlite-store.ts`, `src/domain/pinning/session-pinner.ts` |
| fileScopeMustNotChange | `src/domain/delegation/delegation-context.ts` |
| completionCriteria | Hot-path high-frequency writes go through bounded queue; unit tests cover enqueue/flush/backpressure; ready for SP-236 cleanup |

## Steps

### Step 1: Implement bounded write queue

- [ ] Implement queue per SP-234 design (flush interval, bound, backpressure)
- [ ] Unit tests for enqueue/flush/overflow policy

### Step 2: Wire hot-path writers

- [ ] Route pin/telemetry (and audited hot sites) through the queue
- [ ] Keep correctness: pins/telemetry eventually durable within flush policy

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Bounded queue live on hot-path writes
- [ ] Phase 2 of #142 done; SP-236 closes issue

## Do NOT

- Leave new unbounded queues
- Replace SQLite engine
- Skip StorePort sync docs / benchmark (SP-236)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

## Git Commit Convention

- `feat(SP-235): description`
