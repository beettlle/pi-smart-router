# Task: SP-016 — Triage Pipeline

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Step 2 pipeline integration and triage tests.
**Score:** 3/8

## Mission

Integrate Step 2 triage into pipeline with <5ms budget and unit tests. Maps to T027, T028.

## Dependencies

- SP-015
- SP-020

## Context to Read First

- `src/domain/triage/triage-engine.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pipeline/router-pipeline.ts`
- `tests/unit/triage-engine.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `src/domain/pinning/**` |
| completionCriteria | Step 2 early exit within SC-004 budget. |

## Steps

### Step 1: Integration and tests

- [ ] T027: Step 2 integration with <5ms budget
- [ ] T028: triage-engine.test.ts

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-016): description`

## Do NOT

- Modify triage-engine.ts except import wiring

---

## Amendments (Added During Execution)
