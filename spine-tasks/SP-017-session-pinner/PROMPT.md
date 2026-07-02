# Task: SP-017 — Session Pinner

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** Session pinner core and Step 3 lookup.
**Score:** 4/8

## Mission

Session pinner with break rules and Step 3 pin lookup. Maps to T033, T034 (FR-006, FR-007, FR-008).

## Dependencies

- SP-016

## Context to Read First

- `specs/001-build-smart-router/spec.md (US4)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pinning/session-pinner.ts`
- `src/domain/pipeline/router-pipeline.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pinning/session-pinner.ts` |
| fileScopeMustNotChange | `src/domain/triage/turn-envelope.ts` |
| completionCriteria | Pin lookup <1ms; break rules exhaustive. |

## Steps

### Step 1: Session pinner

- [ ] T033: session-pinner.ts (FR-006, FR-007, FR-008)
- [ ] T034: Step 3 pin lookup + persistence; Step 3b stub until SP-030

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-017): description`

## Do NOT

- Implement cache economics (SP-018)

---

## Amendments (Added During Execution)
