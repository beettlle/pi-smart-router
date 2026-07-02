# Task: SP-008 — Sqlite Core

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** SQLite schema and token bucket.
**Score:** 4/8

## Mission

SQLite schema, migrations, WAL mode, token bucket. Maps to T013.

## Dependencies

- SP-007

## Context to Read First

- `specs/001-build-smart-router/data-model.md`
- `src/domain/types/store-port.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/infrastructure/persistence/sqlite-store.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/persistence/sqlite-store.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Migrations run; WAL enabled; token bucket uses BEGIN IMMEDIATE. |

## Steps

### Step 1: SQLite store

- [ ] T013: Schema + migrations (pins, rate_limits, price_cache, telemetry)
- [ ] WAL + BEGIN IMMEDIATE token bucket

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-008): description`

## Do NOT

- Implement health check fallback (SP-009)

---

## Amendments (Added During Execution)
