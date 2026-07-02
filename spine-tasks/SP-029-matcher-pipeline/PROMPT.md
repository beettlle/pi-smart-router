# Task: SP-029 — Matcher Pipeline

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Step 5 pipeline hook only.
**Score:** 3/8

## Mission

Integrate Step 5 HyDRA matcher for ambiguous prompts. Maps to T050.

## Dependencies

- SP-028
- SP-024

## Context to Read First

- `src/domain/matching/hydra-matcher.ts`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/pipeline/router-pipeline.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts (Step 5 only)` |
| fileScopeMustNotChange | `src/domain/matching/hydra-matcher.ts` |
| completionCriteria | Ambiguous prompts route through Step 5 matcher. |

## Steps

### Step 1: Pipeline hook

- [ ] T050: Step 5 integration

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-029): description`

## Do NOT

- Implement loop escalation (SP-030)

---

## Amendments (Added During Execution)
