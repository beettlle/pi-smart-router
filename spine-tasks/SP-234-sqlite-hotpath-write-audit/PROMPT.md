# Task: SP-234 — Audit hot-path StorePort writes + bounded write-queue design

**Created:** 2026-08-27
**Size:** M

## Review Level: 1

**Assessment:** Inventory StorePort write sites on routing/delegation hot path; design bounded in-memory batch queue (or worker) with documented latency tradeoff. No full queue impl yet (SP-235).
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#142
- Bucket: enhancement
- Partial: #142
- Release: v0.18.0
- Manifest: `spine-tasks/_authoring/release-v0.18.0/manifest.md`

## Mission

Partial #142 — Audit all `StorePort` write paths on the routing/delegation hot path (pins, telemetry, dataset, outcomes). Document which calls block the event loop via synchronous `better-sqlite3` under pseudo-async `void … .catch()` patterns. Produce a bounded in-memory batch queue (or Worker) **design** with flush interval, backpressure, and latency tradeoff written into code comments or a short design note in-repo (adjacent to StorePort / sqlite module). Implementation lands in SP-235; fire-and-forget removal + benchmark in SP-236.

## Dependencies

- None

## Context to Read First

- `src/infrastructure/persistence/sqlite-store.ts`
- `src/domain/pinning/session-pinner.ts` (~365 void.catch)
- StorePort interface (domain ports)
- GitHub #142 acceptance / proposed solution list

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/persistence/sqlite-store.ts` (or adjacent design module), `src/domain/pinning/session-pinner.ts` (audit comments / call-site inventory only if needed) |
| May change | StorePort type file under `src/domain/**`, `docs/` design note if preferred over code comments |
| Must NOT change | Full queue implementation wiring (SP-235); remove all void.catch yet (SP-236); Gemini paths (#158/#159) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/sqlite-store.test.ts tests/unit/session-pinner.test.ts` |
| fileScopeMustChange | `src/infrastructure/persistence/sqlite-store.ts` |
| fileScopeMustNotChange | `src/domain/delegation/delegation-context.ts` |
| completionCriteria | Hot-path write inventory documented; bounded queue interface/design with latency tradeoff; ready for SP-235 impl |

## Steps

### Step 1: Audit hot-path StorePort writes

- [ ] List pin/telemetry/dataset/outcome write sites on routing/delegation hot path
- [ ] Flag sync SQLite + void.catch / fire-and-forget patterns

### Step 2: Queue design

- [ ] Define bounded queue API (enqueue, flush interval, backpressure, drop/block policy)
- [ ] Document latency tradeoff in code comments or short in-repo note
- [ ] Stub/interface only — no production swap of all writers yet (SP-235)

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm test`
- [ ] Existing tests still pass (design-only changes)

## Completion Criteria

- [ ] Audit + queue design complete for #142 phase 1
- [ ] SP-235 can implement against the design

## Do NOT

- Replace SQLite with another DB
- Full B1/A8 repository split epic
- Implement production queue swap (SP-235) or benchmark close-out (SP-236)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

## Git Commit Convention

- `feat(SP-234): description`
