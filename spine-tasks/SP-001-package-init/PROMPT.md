# Task: SP-001 — Package Init

**Created:** 2026-07-02
**Size:** M

## Review Level: 1

**Assessment:** Greenfield npm/TS/vitest bootstrap.
**Score:** 2/8

## Mission

Create directory layout, npm package with TypeScript 5 strict + Node 20 ESM, Vitest scripts, and public entry stub. Maps to T001, T002, T003, T007.

## Dependencies

- **None**

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `specs/001-build-smart-router/plan.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `src/index.ts`
- `src/domain/`
- `src/infrastructure/`
- `src/api/`
- `src/config/`
- `tests/unit/`
- `tests/integration/`
- `tests/contract/`
- `config/`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `package.json`, `tsconfig.json`, `src/index.ts` |
| fileScopeMustNotChange | `specs/001-build-smart-router/spec.md` |
| completionCriteria | Directory layout exists; npm scripts typecheck/test/lint run. |

## Steps

### Step 1: Structure and package init

- [ ] T001: Create directory layout per plan.md
- [ ] T002: Initialize npm + TypeScript strict ESM
- [ ] T007: Public entry stub in src/index.ts

### Step 2: Vitest and scripts

- [ ] T003: vitest.config.ts + typecheck/test/lint scripts

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-001): description`

## Do NOT

- Implement routing logic
- Commit model weights

---

## Amendments (Added During Execution)
