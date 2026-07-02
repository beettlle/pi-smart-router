# Task: SP-006 — Contract Tests

**Created:** 2026-07-02
**Size:** S

## Review Level: 1

**Assessment:** Contract validation tests.
**Score:** 2/8

## Mission

Contract tests for JSON schemas. Maps to T018.

## Dependencies

- SP-005

## Context to Read First

- `specs/001-build-smart-router/contracts/routing-request.schema.json`
- `specs/001-build-smart-router/contracts/routing-decision.schema.json`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `tests/contract/routing-schemas.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `tests/contract/routing-schemas.test.ts` |
| fileScopeMustNotChange | `src/infrastructure/**` |
| completionCriteria | Sample payloads validate against schemas. |

## Steps

### Step 1: Contract tests

- [ ] T018: routing-schemas.test.ts

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-006): description`

## Do NOT

- Modify JSON schema files unless drift found

---

## Amendments (Added During Execution)
