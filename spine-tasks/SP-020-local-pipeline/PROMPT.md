# Task: SP-020 — Local Pipeline

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Local tier pipeline integration and tests.
**Score:** 3/8

## Mission

Integrate Steps 1+4 and local tier unit tests. Maps to T046, T047.

## Dependencies

- SP-019

## Context to Read First

- `src/infrastructure/hardware/hardware-probe.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pipeline/router-pipeline.ts`
- `tests/unit/local-zero-tier.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts (Steps 1 and 4 only)` |
| fileScopeMustNotChange | `src/domain/matching/**` |
| completionCriteria | Classification-only MUST NOT dispatch full local; SC-007. |

## Steps

### Step 1: Integration and tests

- [ ] T046: Steps 1+4 integration
- [ ] T047: 8GB/16GB/battery/unreachable tests

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-020): description`

## Do NOT

- Modify hardware-probe.ts except wiring

---

## Amendments (Added During Execution)
