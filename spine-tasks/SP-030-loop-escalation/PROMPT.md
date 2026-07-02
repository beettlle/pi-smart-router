# Task: SP-030 — Loop Escalation

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** Loop escalation and Step 3b integration.
**Score:** 4/8

## Mission

Loop escalation for identical tool failures and Step 3b pipeline hook. Maps to T051, T052 (FR-014).

## Dependencies

- SP-029
- SP-017

## Context to Read First

- `specs/001-build-smart-router/spec.md (FR-014, FR-008)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pinning/loop-escalation.ts`
- `src/domain/pipeline/router-pipeline.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pinning/loop-escalation.ts` |
| fileScopeMustNotChange | `src/infrastructure/pricing/**` |
| completionCriteria | Escalation fires once per session; Step 3b after Step 3. |

## Steps

### Step 1: Loop escalation

- [ ] T051: loop-escalation.ts
- [ ] T052: Step 3b integration in pipeline

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-030): description`

## Do NOT

- Implement pricing (SP-031)

---

## Amendments (Added During Execution)
