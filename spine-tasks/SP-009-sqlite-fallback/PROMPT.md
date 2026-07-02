# Task: SP-009 — Sqlite Fallback

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** Corrupt DB recovery and memory store.
**Score:** 5/8

## Mission

SQLite health check, recreate-then-fallback, in-memory store, error-path tests. Maps to T013b, T014, T013c.

## Dependencies

- SP-008

## Context to Read First

- `specs/001-build-smart-router/spec.md (FR-025)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/infrastructure/persistence/sqlite-store.ts`
- `src/infrastructure/persistence/memory-store.ts`
- `tests/unit/sqlite-store-fallback.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/persistence/memory-store.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Corrupt DB recreates or falls back; no host crash. |

## Steps

### Step 1: Fallback paths

- [ ] T013b: Corrupt DB rename → migrations → reopen; memory fallback on failure
- [ ] T014: memory-store.ts for unit tests

### Step 2: Error-path tests

- [ ] T013c: Recreate succeeds; recreate failure → memory fallback

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-009): description`

## Do NOT

- Implement safeCloudDefault (SP-010)

---

## Amendments (Added During Execution)
