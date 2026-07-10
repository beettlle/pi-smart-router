# Task: SP-160 — K=4 offline eval and head shape regression

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** #81 part 3 — offline quality retention on eval harness for K=4 heads.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#81
- Release: v0.6.0
- Bucket: feature

## Mission

Add offline quality retention (QR) check for ModernBERT K=4 heads using eval harness fixtures from SP-151+. Head output shape regression tests. Document when to enable K=4 based on calibration Top-1 error threshold.

## Dependencies

- SP-159
- SP-152 (eval harness three-track — landed)

## Context to Read First

- `scripts/eval-harness/`
- `tests/unit/hydra-matcher.test.ts`
- `tests/unit/modernbert-heads.test.ts`
- GitHub #81 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/unit/modernbert-heads.test.ts` |
| May change | `scripts/eval-harness/counterfactual-replay.ts`, `tests/unit/eval-harness.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `tests/unit/modernbert-heads.test.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Head output shape tests; offline QR smoke on eval fixtures; K=4 enablement threshold documented. |

## Steps

### Step 1: Shape regression tests

- [ ] Extend head shape tests for all K=4 dimensions
- [ ] Test debugging dimension shortfall exclusion behavior

### Step 2: Offline eval smoke

- [ ] Add eval harness smoke path for K=4 heads mode
- [ ] Compare QR vs learned projection baseline on fixture subset

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Head output shape tests comprehensive
- [ ] Offline QR on eval harness fixtures
- [ ] K=4 enablement threshold documented
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-160): description`

## Do NOT

- Change hydra matcher wiring (SP-159 scope)

---
