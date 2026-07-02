# Task: SP-023 — Sub Route Policy

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Same-provider sub-routing policy and tests.
**Score:** 3/8

## Mission

Same-provider economical sub-routing and unit tests. Maps to T031, T032 (FR-024).

## Dependencies

- SP-022
- SP-018

## Context to Read First

- `specs/001-build-smart-router/spec.md (FR-024)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pinning/sub-route-policy.ts`
- `tests/unit/turn-envelope.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pinning/sub-route-policy.ts` |
| fileScopeMustNotChange | `src/domain/matching/**` |
| completionCriteria | Sub-routing respects size threshold and provider match. |

## Steps

### Step 1: Sub-route and tests

- [ ] T031: sub-route-policy.ts
- [ ] T032: turn-envelope.test.ts

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-023): description`

## Do NOT

- Modify session-pinner break rules

---

## Amendments (Added During Execution)
