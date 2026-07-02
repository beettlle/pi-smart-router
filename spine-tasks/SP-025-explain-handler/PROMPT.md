# Task: SP-025 — Explain Handler

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Explain endpoint without upstream dispatch.
**Score:** 3/8

## Mission

Explain handler per explain-endpoint.md — no inference, no upstream-cost telemetry. Maps to T041.

## Dependencies

- SP-014

## Context to Read First

- `specs/001-build-smart-router/contracts/explain-endpoint.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/api/explain/router-explain.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/api/explain/router-explain.ts` |
| fileScopeMustNotChange | `src/domain/matching/**` |
| completionCriteria | Returns tier/stage/reason/alternatives without dispatch. |

## Steps

### Step 1: Explain handler

- [ ] T041: router-explain.ts per contract

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-025): description`

## Do NOT

- Dispatch upstream inference on explain path

---

## Amendments (Added During Execution)
