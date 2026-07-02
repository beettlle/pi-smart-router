# Task: SP-022 — Turn Pipeline

**Created:** 2026-07-02
**Size:** S

## Review Level: 1

**Assessment:** Step 2b pipeline hook only.
**Score:** 2/8

## Mission

Integrate Step 2b turn envelope into pipeline. Maps to T030.

## Dependencies

- SP-021

## Context to Read First

- `src/domain/triage/turn-envelope.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pipeline/router-pipeline.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts (Step 2b only)` |
| fileScopeMustNotChange | `src/domain/pinning/sub-route-policy.ts` |
| completionCriteria | Step 2b runs after Step 2 within budget. |

## Steps

### Step 1: Pipeline hook

- [ ] T030: Step 2b integration

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-022): description`

## Do NOT

- Implement sub-route policy (SP-023)

---

## Amendments (Added During Execution)
