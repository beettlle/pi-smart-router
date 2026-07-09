# Task: SP-139 — Recalibrate projection head after prefix change

**Created:** 2026-07-09
**Size:** S

## Review Level: 2

**Assessment:** #76 part 2 — refresh SP-115 projection/calibration when prefix flags shift embeddings.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#76
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

When SP-138 extends HyDRA metadata prefix, retrain or refresh the learned 384×3 projection head artifact via calibration train path. Update `verify-routing-calibration` benchmarks if requirement vectors shift. Runtime rejects stale bundle versions. Document recalibration requirement in train script README comment.

## Dependencies

- SP-138

## Context to Read First

- `scripts/train-routing-calibration.ts`
- `src/domain/matching/hydra-matcher.ts` — projection consumer
- `spine-tasks/SP-115-hydra-learned-projection/PROMPT.md`
- `scripts/verify-routing-calibration.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/train-routing-calibration.ts` |
| May change | `scripts/verify-routing-calibration.ts`, `config/routing-calibration.json.example`, `tests/unit/train-routing-calibration.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/train-routing-calibration.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Train path accounts for 7-flag prefix; example bundle updated or regen documented; verify script passes; version bump if incompatible. |

## Steps

### Step 1: Train path update

- [ ] Ensure projection training uses extended prefix in feature extraction
- [ ] Bump artifact version when prefix schema changes

### Step 2: Verify and example bundle

- [ ] Update verify benchmarks for new prefix behavior
- [ ] Refresh `routing-calibration.json.example` if needed

### Step 3: Testing and verification

- [ ] Unit tests for version mismatch rejection
- [ ] Run `npm run routing:verify-calibration` and `npm run verify:ci`

## Completion Criteria

- [ ] Projection recalibration path works with 7-flag prefix
- [ ] Verify script passes
- [ ] Stale bundle version rejected at runtime
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-139): description`

## Do NOT

- Change hydra-input prefix format (SP-138)
- Modify pipeline stages

---
