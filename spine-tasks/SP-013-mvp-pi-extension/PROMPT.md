# Task: SP-013 — Mvp Pi Extension

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** Pi extension integration and factory export.
**Score:** 5/8

## Mission

Pi extension integration per pi-middleware.md v1.0.0 and router factory export. Maps to T021, T021b, T022.

## Dependencies

- SP-012

## Context to Read First

- `specs/001-build-smart-router/contracts/pi-middleware.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/api/middleware/pi-router-middleware.ts`
- `src/index.ts`
- `specs/001-build-smart-router/contracts/routing-request.schema.json`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `spine-tasks/SP-013-mvp-pi-extension/STATUS.md` |
| fileScopeMustNotChange | `src/domain/triage/**` |
| completionCriteria | Extension hooks registered; factory exports router. |

## Steps

### Step 1: Pi integration

- [ ] T021: before_provider_request, context, session_compact, model_select
- [ ] T021b: Confirm contract v1.0.0; update schema if needed
- [ ] T022: Export router factory from src/index.ts

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-013): description`

## Do NOT

- Implement triage or pinning stages

---

## Amendments (Added During Execution)

- **2026-07-02:** `src/index.ts` stub exists from SP-001. Worker creates middleware and updates exports; `fileScopeMustChange` points at STATUS.md delivery artifact.
