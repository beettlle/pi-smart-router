# Task: SP-035 — Benchmarks E2e

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** E2E and performance benchmarks.
**Score:** 4/8

## Mission

Full pipeline E2E, SC-005 latency benchmark, SC-009 cost baseline. Maps to T060, T061, T062.

## Dependencies

- SP-034

## Context to Read First

- `specs/001-build-smart-router/spec.md (SC-005, SC-009)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `tests/integration/full-pipeline.test.ts`
- `tests/integration/routing-latency.test.ts`
- `tests/integration/cost-baseline.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `tests/integration/full-pipeline.test.ts` |
| fileScopeMustNotChange | `src/domain/**` |
| completionCriteria | SC-005 median <200ms; SC-009 cost baseline test exists. |

## Steps

### Step 1: E2E and benchmarks

- [ ] T060: full-pipeline.test.ts
- [ ] T061: routing-latency.test.ts (<200ms)
- [ ] T062: cost-baseline.test.ts

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-035): description`

## Do NOT

- Change production code except bugfixes for failing tests

---

## Amendments (Added During Execution)
