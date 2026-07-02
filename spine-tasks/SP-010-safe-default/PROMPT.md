# Task: SP-010 — Safe Default

**Created:** 2026-07-02
**Size:** S

## Review Level: 1

**Assessment:** Economical-first safe cloud default.
**Score:** 2/8

## Mission

Implement safeCloudDefault() economical first, frontier fallback. Maps to T016 (FR-022).

## Dependencies

- SP-009

## Context to Read First

- `specs/001-build-smart-router/spec.md (FR-022)`
- `src/config/models-loader.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pipeline/safe-default.ts`
- `tests/unit/safe-default.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/safe-default.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Never throws; picks economical then frontier. |

## Steps

### Step 1: Safe default

- [ ] T016: safeCloudDefault() in safe-default.ts
- [ ] Basic unit test for tier ordering

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-010): description`

## Do NOT

- Wire pipeline orchestrator (SP-011)

---

## Amendments (Added During Execution)
