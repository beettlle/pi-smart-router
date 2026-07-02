# Task: SP-007 — Models Loader

**Created:** 2026-07-02
**Size:** S

## Review Level: 1

**Assessment:** Single-module fleet catalog loader.
**Score:** 2/8

## Mission

Implement models.yaml loader with zod validation. Maps to T011.

## Dependencies

- SP-006

## Context to Read First

- `config/models.yaml.example`
- `src/domain/types/schemas.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/config/models-loader.ts`
- `tests/unit/models-loader.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/config/models-loader.ts` |
| fileScopeMustNotChange | `src/infrastructure/persistence/**` |
| completionCriteria | Valid catalog loads; invalid YAML fails clearly. |

## Steps

### Step 1: Loader

- [ ] T011: models-loader.ts with zod validation

### Step 2: Tests

- [ ] Unit tests: valid catalog, missing tier, invalid schema

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-007): description`

## Do NOT

- Implement persistence (SP-008)

---

## Amendments (Added During Execution)
