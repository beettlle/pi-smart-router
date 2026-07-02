# Task: SP-024 — Telemetry

**Created:** 2026-07-02
**Size:** S

## Review Level: 1

**Assessment:** Routing telemetry emitter.
**Score:** 2/8

## Mission

Routing telemetry with 168h/1111 rolling window and Step 7 emit. Maps to T039, T040.

## Dependencies

- SP-023

## Context to Read First

- `specs/001-build-smart-router/data-model.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/infrastructure/telemetry/routing-telemetry.ts`
- `src/domain/pipeline/router-pipeline.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/telemetry/routing-telemetry.ts` |
| fileScopeMustNotChange | `src/api/explain/**` |
| completionCriteria | Rolling window enforced; Step 7 emits telemetry. |

## Steps

### Step 1: Telemetry

- [ ] T039: routing-telemetry.ts
- [ ] T040: Step 7 wire in pipeline

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-024): description`

## Do NOT

- Implement explain handler (SP-025)

---

## Amendments (Added During Execution)
