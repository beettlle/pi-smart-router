# Task: SP-073 — Multi-Objective Wiring

**Created:** 2026-07-05
**Size:** M

## Review Level: 1

**Assessment:** Wire `scoreMultiObjective()` into HyDRA matcher production path (FR-021).
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#30
- Bucket: feature

## Mission

`scoreMultiObjective()` is fully implemented and unit-tested in `src/domain/scoring/multi-objective.ts`, but **never called** from the production routing path. `HydraMatcher.match()` selects the candidate with highest cosine similarity only, ignoring cost/latency/verbosity weights from `DEFAULT_OPERATOR_CONFIG.frugality`.

PRD Phase 3.1 / FR-021 require multi-objective scoring at quality parity. Wire the scorer after shortfall filtering in `HydraMatcher.match()`, using operator frugality weights (`lambda_cost`, `lambda_latency`, `lambda_verbosity`).

## Dependencies

- SP-071

## Context to Read First

- `src/domain/scoring/multi-objective.ts` — implemented scorer + unit tests
- `src/domain/matching/hydra-matcher.ts` — current max-cosine selection
- `src/domain/config/defaults.ts` — frugality weights
- `tests/unit/multi-objective.test.ts`
- `tests/unit/hydra-matcher.test.ts` if present

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/hydra-matcher.ts` |
| May change | `tests/unit/hydra-matcher.test.ts`, `tests/unit/multi-objective.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/matching/hydra-matcher.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | scoreMultiObjective() called after shortfall filtering; integration test proves cost/latency/verbosity changes model selection at quality parity. |

## Steps

### Step 1: Wire scorer into matcher

- [ ] Call `scoreMultiObjective()` after shortfall filtering in `HydraMatcher.match()`
- [ ] Pass operator frugality weights from config

### Step 2: Integration test

- [ ] Add test proving cost/latency/verbosity weights change selected model at quality parity (same cosine tier)

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Confirm existing multi-objective unit tests remain green

## Completion Criteria

- [ ] Production routing path uses multi-objective scoring
- [ ] Integration test demonstrates weight-driven selection
- [ ] No regression in HyDRA shortlist behavior at default weights

## Git Commit Convention

- `feat(SP-073): description`

## Do NOT

- Change pipeline stage order
- Modify extension bootstrap in this task

---

## Amendments (Added During Execution)
