# Task: SP-132 — Isotonic calibrator offline fit and bundle schema

**Created:** 2026-07-09
**Size:** M

## Review Level: 2

**Assessment:** #74 part 2 — offline isotonic regression on held-out validation; versioned artifact in calibration bundle.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#74
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

Add offline isotonic regression calibrator (UCCI-style) on top of SP-105 logistic baseline scores. Extend `routing-calibration` bundle schema with `isotonic_calibrator` artifact. Implement fit in `scripts/train-routing-calibration.ts`; report holdout ECE in train output. No heavy ML deps — implement pool-adjacent-violators or lightweight isotonic fit in-repo.

## Dependencies

- SP-131

## Context to Read First

- `scripts/train-routing-calibration.ts`
- `scripts/verify-routing-calibration.ts`
- `specs/001-build-smart-router/contracts/routing-calibration.schema.json`
- `src/domain/routing/p-success-classifier.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/train-routing-calibration.ts`, `specs/001-build-smart-router/contracts/routing-calibration.schema.json` |
| May change | `scripts/verify-routing-calibration.ts`, `config/routing-calibration.json.example`, `tests/unit/train-routing-calibration.test.ts`, `package.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/train-routing-calibration.ts`, `specs/001-build-smart-router/contracts/routing-calibration.schema.json` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Train emits isotonic artifact; schema version bumped; verify script checks artifact; holdout ECE logged; runtime version check unchanged or extended. |

## Steps

### Step 1: Isotonic fit module

- [ ] Implement isotonic regression fit (PAV algorithm) on validation split
- [ ] Compute and log holdout ECE vs raw logistic scores

### Step 2: Bundle schema and train integration

- [ ] Extend `routing-calibration.schema.json` with `isotonic_calibrator`
- [ ] Serialize piecewise lookup table in train output
- [ ] Bump bundle version field

### Step 3: Testing and verification

- [ ] `verify-routing-calibration.ts` loads and sanity-checks calibrator
- [ ] Unit tests for monotonicity and edge cases
- [ ] Run `npm run verify:ci`

## Testing

- `npm run verify:ci`
- `npm run routing:verify-calibration` after train artifact update

## Completion Criteria

- [ ] Isotonic artifact in versioned bundle
- [ ] Holdout ECE reported in train logs
- [ ] Verify script passes with new artifact
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-132): description`

## Do NOT

- Wire online lookup in pipeline (SP-133)

---
