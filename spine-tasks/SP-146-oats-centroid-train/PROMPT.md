# Task: SP-146 — OATS centroid interpolation in calibration train

**Created:** 2026-07-09
**Size:** M

## Review Level: 1

**Assessment:** #77 part 1 — outcome-aware cluster centroid refinement (OATS) in offline calibration train path.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#77
- Release: v0.5.0
- Bucket: feature

## Mission

Add OATS (outcome-aware cluster centroid refinement) interpolation to the calibration train pipeline. Shift centroids toward cheap-tier success embeddings and away from loop-escalation failures. Positive set: cheap-tier successes; negative set: loop-escalation failures. Implement in `scripts/lib/oats-centroid-refinement.ts` and wire into `scripts/train-routing-calibration.ts`. Versioned centroid artifact in calibration bundle. Document α/β hyperparameters and minimum sample sizes. Offline only — zero serving latency.

## Dependencies

- SP-114 (centroid bootstrap)
- SP-117 (calibration train serialize)

## Context to Read First

- `scripts/train-routing-calibration.ts`
- `scripts/bootstrap-routing-centroids.ts`
- `src/domain/matching/cluster-matcher.ts`
- `docs/routing-roadmap.md` §2 P2 OATS
- GitHub #77 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/lib/oats-centroid-refinement.ts`, `scripts/train-routing-calibration.ts` |
| May change | `specs/001-build-smart-router/contracts/routing-calibration.schema.json`, `tests/unit/train-routing-calibration.test.ts`, `config/routing-calibration.json.example` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/lib/oats-centroid-refinement.ts`, `scripts/train-routing-calibration.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | OATS step in train pipeline; positive/negative embedding sets; versioned centroid artifact; unit test on synthetic centroid shift; α/β documented. |

## Steps

### Step 1: OATS refinement module

- [ ] Implement `oats-centroid-refinement.ts` with interpolation toward success / away from failure embeddings
- [ ] Define positive set (cheap-tier successes) and negative set (loop-escalation failures) from calibration features
- [ ] Document α/β hyperparameters and minimum sample size guards

### Step 2: Train pipeline integration

- [ ] Wire OATS step into `train-routing-calibration.ts` after centroid bootstrap
- [ ] Serialize refined centroids in versioned calibration bundle
- [ ] Extend schema if new artifact fields required

### Step 3: Testing and verification

- [ ] Unit test: synthetic centroid shift with known positive/negative sets
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] OATS interpolation step in calibration train pipeline
- [ ] Versioned centroid artifact in calibration bundle
- [ ] α/β hyperparameters and minimum sample sizes documented
- [ ] Unit test on synthetic centroid shift
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-146): description`

## Do NOT

- Online cluster learning at request time
- Re-open or implement #1, #25, #26 (operator excluded)

---
