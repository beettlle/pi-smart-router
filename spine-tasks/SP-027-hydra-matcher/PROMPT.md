# Task: SP-027 — Hydra Matcher

**Created:** 2026-07-02
**Size:** M

## Review Level: 3

**Assessment:** HyDRA embedding matcher with ONNX.
**Score:** 6/8

## Mission

HyDRA embedding matcher with shortfall scoring and mocked unit tests. Maps to T048.

## Dependencies

- SP-026

## Context to Read First

- `specs/001-build-smart-router/research.md`
- `specs/001-build-smart-router/quickstart.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/matching/hydra-matcher.ts`
- `tests/unit/hydra-matcher.test.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/matching/hydra-matcher.ts` |
| fileScopeMustNotChange | `src/infrastructure/gateway/circuit-breaker.ts` |
| completionCriteria | ONNX from artifact path; 80–120ms budget; shortfall gate. |

## Steps

### Step 1: Matcher

- [ ] T048: hydra-matcher.ts with shortfall scoring
- [ ] Mocked unit tests; no weights in git

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-027): description`

## Do NOT

- Implement multi-objective scoring (SP-028)

---

## Amendments (Added During Execution)
