# Task: SP-018 — Pinning Cache Tests

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** Cache economics, FR-023 markers, pinning tests.
**Score:** 4/8

## Mission

Cache-warmup economics, provider cache markers, FR-007 negative tests. Maps to T035, T036, T037, T038.

## Dependencies

- SP-017

## Context to Read First

- `specs/001-build-smart-router/spec.md (FR-023, SC-006)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pinning/cache-economics.ts`
- `src/infrastructure/gateway/gateway-dispatch.ts`
- `tests/unit/session-pinner.test.ts`
- `tests/integration/session-pinning.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pinning/cache-economics.ts` |
| fileScopeMustNotChange | `src/domain/triage/**` |
| completionCriteria | Multi-turn pin stability; FR-007 skip re-match on pin hits. |

## Steps

### Step 1: Cache and tests

- [ ] T035: cache-economics.ts
- [ ] T036: Preserve cache markers (FR-023)
- [ ] T037: Unit tests incl. FR-007 negative
- [ ] T038: session-pinning integration test

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-018): description`

## Do NOT

- Implement turn envelope (SP-021)

---

## Amendments (Added During Execution)
