# Task: SP-036 — Quickstart Gate

**Created:** 2026-07-02
**Size:** S

## Review Level: 0

**Assessment:** Docs sync and gate evidence.
**Score:** 1/8

## Mission

Update quickstart with install/run commands and document gate evidence. Maps to T063, T064.

## Dependencies

- SP-035

## Context to Read First

- `specs/001-build-smart-router/quickstart.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `specs/001-build-smart-router/quickstart.md`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `spine-tasks/SP-036-quickstart-gate/STATUS.md` |
| fileScopeMustNotChange | `src/**` |
| completionCriteria | Quickstart reflects actual commands; typecheck+test evidence documented. |

## Steps

### Step 1: Docs and evidence

- [ ] T063: Update quickstart.md
- [ ] T064: Run npm run typecheck && npm test; document results

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-036): description`

## Do NOT

- Add new features beyond T063/T064

---

## Amendments (Added During Execution)

- **2026-07-02:** `quickstart.md` content is pre-landed on `main`. Worker documents gate evidence in STATUS.md; `fileScopeMustChange` points at delivery artifact.
