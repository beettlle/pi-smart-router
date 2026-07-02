# Task: SP-033 — Resilience Tests

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Resilience unit tests.
**Score:** 3/8

## Mission

Unit tests for loop escalation, circuit breaker, rate limit races. Maps to T058.

## Dependencies

- SP-032

## Context to Read First

- `tests/unit/resilience.test.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `tests/unit/resilience.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `tests/unit/resilience.test.ts` |
| fileScopeMustNotChange | `src/domain/matching/hydra-matcher.ts` |
| completionCriteria | 429 + retry guidance fields asserted; seeded RNG for matcher tests. |

## Steps

### Step 1: Resilience tests

- [ ] T058: resilience.test.ts

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-033): description`

## Do NOT

- Refactor production modules unless test failures require

---

## Amendments (Added During Execution)
