# Task: SP-147 — OATS artifact verify and operator docs

**Created:** 2026-07-09
**Size:** S

## Review Level: 1

**Assessment:** #77 part 2 — verify OATS centroids in calibration bundle and document operator workflow.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#77
- Release: v0.5.0
- Bucket: feature

## Mission

Extend `scripts/verify-routing-calibration.ts` to assert OATS-refined centroid artifacts load and produce expected cluster matches on benchmark prompts. Update README operator section with OATS regeneration workflow, hyperparameter tuning, and minimum sample guidance. Ensure cluster matcher consumes OATS-refined centroids from bundle at runtime.

## Dependencies

- SP-146

## Context to Read First

- `scripts/verify-routing-calibration.ts`
- `scripts/lib/oats-centroid-refinement.ts`
- `src/domain/matching/cluster-matcher.ts`
- `README.md` operator section

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/verify-routing-calibration.ts` |
| May change | `README.md`, `tests/unit/verify-routing-calibration.test.ts`, `src/domain/matching/cluster-matcher.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/verify-routing-calibration.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Verify script checks OATS centroids; calibration pipeline integration test; README documents OATS workflow. |

## Steps

### Step 1: Verify script extension

- [ ] Add OATS centroid sanity checks to verify script
- [ ] Benchmark prompt assertions for refined centroid cluster assignment

### Step 2: Runtime and docs

- [ ] Confirm cluster matcher loads OATS-refined centroids from bundle
- [ ] Document OATS regeneration in README operator section

### Step 3: Testing and verification

- [ ] Calibration pipeline integration test
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Verify script asserts OATS centroid artifacts
- [ ] Calibration pipeline integration test passes
- [ ] README operator section documents OATS workflow
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-147): description`

## Do NOT

- Re-implement OATS interpolation (SP-146)
- Re-open or implement #1, #25, #26 (operator excluded)

---
