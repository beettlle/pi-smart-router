# Task: SP-034 — Stet Guardrails

**Created:** 2026-07-02
**Size:** S

## Review Level: 1

**Assessment:** Finalize stet guardrails.
**Score:** 2/8

## Mission

Finalize .stet.yaml rules extending T006 skeleton. Maps to T059.

## Dependencies

- SP-016
- SP-020
- SP-023
- SP-026
- SP-033

## Context to Read First

- `.stet.yaml`
- `specs/001-build-smart-router/plan.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `.stet.yaml`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `spine-tasks/SP-034-stet-guardrails/STATUS.md` |
| fileScopeMustNotChange | `src/domain/**` |
| completionCriteria | Zero-crash, no any, triage bounds, no I/O in loops rules finalized. |

## Steps

### Step 1: Stet rules

- [ ] T059: Finalize .stet.yaml guardrails

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-034): description`

## Do NOT

- Duplicate guardrails from T006 skeleton

---

## Amendments (Added During Execution)

- **2026-07-03:** `.stet.yaml` skeleton is pre-landed on `main` from SP-002. Worker finalizes rules and updates STATUS.md; `fileScopeMustChange` points at delivery artifact.
