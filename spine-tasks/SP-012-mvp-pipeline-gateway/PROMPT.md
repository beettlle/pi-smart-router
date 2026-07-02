# Task: SP-012 — Mvp Pipeline Gateway

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** MVP pipeline stubs and gateway dispatch.
**Score:** 4/8

## Mission

Wire pipeline with no-op stage stubs and minimal gateway dispatch. Maps to T019, T020.

## Dependencies

- SP-011

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pipeline/router-pipeline.ts`
- `src/infrastructure/gateway/gateway-dispatch.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/gateway/gateway-dispatch.ts` |
| fileScopeMustNotChange | `src/api/middleware/**` |
| completionCriteria | Pipeline stubs wired; single healthy model selected. |

## Steps

### Step 1: Pipeline and gateway

- [ ] T019: No-op stage stubs Steps 1–7 with early-exit
- [ ] T020: Minimal gateway dispatch

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-012): description`

## Do NOT

- Implement pi extension (SP-013)

---

## Amendments (Added During Execution)
