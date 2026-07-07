# Task: SP-117 — Calibration train serialize and verify pipeline

**Created:** 2026-07-07
**Size:** M

## Review Level: 2

**Assessment:** #66 part 2 — train routing artifacts from aggregated data, serialize versioned bundle, verify with benchmark prompts.
**Score:** 6/8 — Blast radius: 2, Pattern novelty: 1, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#66
- Bucket: feature
- Epic: beettlle/pi-smart-router#63

## Mission

Implement calibration pipeline stages 3–5: train lightweight models (logistic regression / linear projection) from validated feature vectors, serialize versioned artifacts under `config/` or `src/assets/`, add `npm run routing:verify-calibration` benchmark script. Runtime rejects incompatible artifact versions gracefully. Optional manual-dispatch CI workflow when artifacts change. Fallback to baked-in defaults when bundle missing.

## Dependencies

- SP-116

## Context to Read First

- `scripts/calibration-aggregate.ts` (SP-116)
- `src/domain/matching/hydra-matcher.ts` — projection consumer
- `src/domain/routing/p-success-classifier.ts` — classifier consumer
- `src/domain/matching/cluster-matcher.ts` — centroid consumer

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/train-routing-calibration.ts` |
| May change | `scripts/verify-routing-calibration.ts`, `config/routing-calibration.json.example`, `.github/workflows/calibration-verify.yml`, `package.json`, `tests/unit/train-routing-calibration.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/train-routing-calibration.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Train script produces versioned bundle; verify script asserts routing decisions; runtime version check; CI optional workflow; fallback to defaults. |

## Steps

### Step 1: Training script

- [ ] Implement `scripts/train-routing-calibration.ts` — logistic regression / linear projection
- [ ] Output versioned `routing-calibration.json` bundle with all four artifact types
- [ ] Add `npm run routing:train-calibration` script entry

### Step 2: Verify and runtime version check

- [ ] Implement `scripts/verify-routing-calibration.ts` with benchmark prompts
- [ ] Add `npm run routing:verify-calibration` script entry
- [ ] Runtime consumers reject incompatible versions gracefully; fallback to defaults

### Step 3: Testing and verification

- [ ] Unit tests for train output shape and verify assertions
- [ ] Optional: `.github/workflows/calibration-verify.yml` manual dispatch
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Training script documented with minimum sample size requirements
- [ ] Artifact version field; runtime rejects incompatible versions gracefully
- [ ] CI job (optional/manual dispatch) runs verify step on PR when artifacts change
- [ ] No prompt text in training pipeline — feature vectors only
- [ ] Fallback to baked-in defaults when bundle missing
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-117): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
