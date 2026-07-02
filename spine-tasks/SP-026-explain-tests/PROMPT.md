# Task: SP-026 — Explain Tests

**Created:** 2026-07-02
**Size:** S

## Review Level: 1

**Assessment:** Explain contract and parity tests.
**Score:** 2/8

## Mission

Explain contract test and explain vs live parity test. Maps to T042, T043 (SC-010).

## Dependencies

- SP-025

## Context to Read First

- `specs/001-build-smart-router/contracts/explain-endpoint.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `tests/contract/explain-endpoint.test.ts`
- `tests/integration/explain-parity.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `tests/contract/explain-endpoint.test.ts` |
| fileScopeMustNotChange | `src/domain/matching/**` |
| completionCriteria | Explain vs live path produce identical decisions (SC-010). |

## Steps

### Step 1: Tests

- [ ] T042: explain-endpoint contract test
- [ ] T043: explain-parity integration test

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-026): description`

## Do NOT

- Modify explain handler unless tests require

---

## Amendments (Added During Execution)
