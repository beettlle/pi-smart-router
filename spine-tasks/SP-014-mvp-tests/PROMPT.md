# Task: SP-014 — Mvp Tests

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** MVP integration and error-path tests.
**Score:** 3/8

## Mission

MVP integration test and safe-default error-path test. Maps to T023, T024. MVP checkpoint.

## Dependencies

- SP-013

## Context to Read First

- `specs/001-build-smart-router/spec.md (US1, SC-001)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `tests/integration/pipeline-mvp.test.ts`
- `tests/unit/safe-default.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `tests/integration/pipeline-mvp.test.ts` |
| fileScopeMustNotChange | `src/domain/triage/**` |
| completionCriteria | Request → decision → dispatch; routing failure returns safe default (SC-001). |

## Steps

### Step 1: MVP tests

- [ ] T023: pipeline-mvp.test.ts integration
- [ ] T024: safe-default error-path test

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-014): description`

## Do NOT

- Expand scope beyond US1 MVP

---

## Amendments (Added During Execution)
