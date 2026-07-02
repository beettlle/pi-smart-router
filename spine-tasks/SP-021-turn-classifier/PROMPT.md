# Task: SP-021 — Turn Classifier

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Turn envelope classifier module.
**Score:** 3/8

## Mission

Turn envelope classifier (<2ms budget). Maps to T029.

## Dependencies

- SP-014

## Context to Read First

- `specs/001-build-smart-router/contracts/pi-middleware.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/triage/turn-envelope.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/triage/turn-envelope.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | turn_type enum derived from message envelope. |

## Steps

### Step 1: Classifier

- [ ] T029: turn-envelope.ts classifier

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-021): description`

## Do NOT

- Integrate pipeline (SP-022)

---

## Amendments (Added During Execution)
