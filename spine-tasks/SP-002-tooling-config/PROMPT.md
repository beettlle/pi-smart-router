# Task: SP-002 — Tooling Config

**Created:** 2026-07-02
**Size:** S

## Review Level: 1

**Assessment:** Linting and example config only.
**Score:** 1/8

## Mission

Configure ESLint, example fleet catalog, and stet guardrails skeleton. Maps to T004, T005, T006.

## Dependencies

- SP-001

## Context to Read First

- `config/models.yaml.example`
- `.cursor/rules/`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `.eslintrc.cjs`
- `config/models.yaml.example`
- `.stet.yaml`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.eslintrc.cjs`, `config/models.yaml.example` |
| fileScopeMustNotChange | `src/domain/**` |
| completionCriteria | ESLint runs; example catalog validates. |

## Steps

### Step 1: Tooling

- [ ] T004: ESLint + @typescript-eslint
- [ ] T005: config/models.yaml.example
- [ ] T006: .stet.yaml skeleton

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-002): description`

## Do NOT

- Extend stet rules beyond skeleton (SP-034)

---

## Amendments (Added During Execution)
