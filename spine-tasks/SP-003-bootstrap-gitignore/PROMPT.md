# Task: SP-003 — Bootstrap Gitignore

**Created:** 2026-07-02
**Size:** S

## Review Level: 0

**Assessment:** Docs and gitignore verification.
**Score:** 1/8

## Mission

Document HyDRA ONNX cache bootstrap and verify .pi-smart-router/ gitignore. Maps to T006b, T008.

## Dependencies

- SP-002

## Context to Read First

- `specs/001-build-smart-router/quickstart.md`
- `.gitignore`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `.gitignore`
- `specs/001-build-smart-router/quickstart.md`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `specs/001-build-smart-router/quickstart.md` |
| fileScopeMustNotChange | `src/**` |
| completionCriteria | .pi-smart-router/ gitignored for state.db and models/. |

## Steps

### Step 1: Bootstrap docs

- [ ] T006b: HyDRA cache bootstrap section in quickstart.md
- [ ] T008: Verify .pi-smart-router/ gitignore

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-003): description`

## Do NOT

- Download ONNX weights into repo

---

## Amendments (Added During Execution)
