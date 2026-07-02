# Task: SP-028 — Multi Objective

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Multi-objective cost/latency/verbosity scoring.
**Score:** 3/8

## Mission

Multi-objective score consuming frugality.lambda_* config. Maps to T049 (FR-021).

## Dependencies

- SP-027

## Context to Read First

- `src/config/defaults.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/scoring/multi-objective.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/scoring/multi-objective.ts` |
| fileScopeMustNotChange | `src/domain/matching/hydra-matcher.ts` |
| completionCriteria | Score uses lambda_cost, lambda_latency, lambda_verbosity. |

## Steps

### Step 1: Scoring

- [ ] T049: multi-objective.ts

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-028): description`

## Do NOT

- Integrate pipeline Step 5 (SP-029)

---

## Amendments (Added During Execution)
