# Task: SP-005 — Schemas Defaults

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Zod schemas and operator defaults.
**Score:** 3/8

## Mission

Implement zod schemas mirroring contracts and defaults.ts. Maps to T010, T012.

## Dependencies

- SP-004

## Context to Read First

- `specs/001-build-smart-router/contracts/`
- `specs/001-build-smart-router/data-model.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/types/schemas.ts`
- `src/config/defaults.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/types/schemas.ts`, `src/config/defaults.ts` |
| fileScopeMustNotChange | `src/infrastructure/**` |
| completionCriteria | Defaults include memory thresholds, frugality lambdas, artifact path. |

## Steps

### Step 1: Schemas and defaults

- [ ] T010: Zod schemas mirroring contracts + PriceCatalog
- [ ] T012: defaults.ts per data-model.md (FR-021)

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-005): description`

## Do NOT

- Implement SQLite (SP-008)

---

## Amendments (Added During Execution)
