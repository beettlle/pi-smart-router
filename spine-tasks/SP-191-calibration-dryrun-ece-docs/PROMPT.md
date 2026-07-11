# Task: SP-191 — Calibration Dry-Run ECE + OATS Docs

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Wire label packs into calibration dry-run with holdout ECE, document OATS min sample sizes, close #102.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#102
- Bucket: feature
- Closes: #102
- Release: v0.9.2

## Mission

Closes #102 — Wire SP-189/SP-190 privacy-safe label packs into the existing calibration train/verify path as an offline **dry-run**: fit/evaluate isotonic (or logistic) calibration on pack rows, report **ECE on a holdout split**, and document **minimum sample sizes** for OATS positive/negative sets (align with `scripts/lib/oats-centroid-refinement.ts` + `MINIMUM_TRAINING_SAMPLES`). Update README (or calibration docs) so operators can regenerate packs and run the dry-run without network. Do **not** change `config/release-gates.json` absolute thresholds; do **not** flip `modernbert_k4` defaults (#96).

## Dependencies

- **Task:** SP-190 (FC-RewardBench + weak-label packs available)

## Context to Read First

- `Parent split: SP-190 — FC-RewardBench + TwinRouterBench weak labels`
- `scripts/train-routing-calibration.ts`
- `scripts/verify-routing-calibration.ts`
- `scripts/lib/isotonic-calibrator.ts`
- `scripts/lib/oats-centroid-refinement.ts` — `DEFAULT_OATS_MIN_POSITIVE_SAMPLES` / `DEFAULT_OATS_MIN_NEGATIVE_SAMPLES`
- `scripts/calibration-aggregate.ts` — `MINIMUM_TRAINING_SAMPLES`
- `tests/eval/corpus/label-packs/PROVENANCE.md`
- `config/routing-calibration.json.example`
- GitHub #102 verification checklist; soft feed for #96 holdout

## Environment

- **Workspace:** `scripts/`, `tests/unit/`, `README.md`, `package.json`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/verify-routing-calibration.ts`, `README.md` |
| May change | `scripts/train-routing-calibration.ts`, `scripts/lib/isotonic-calibrator.ts`, `package.json`, `tests/unit/verify-routing-calibration.test.ts`, `tests/unit/train-routing-calibration.test.ts`, `config/routing-calibration.json.example`, `tests/eval/corpus/label-packs/PROVENANCE.md`, `docs/routing-roadmap.md` |
| Must NOT change | `config/release-gates.json` absolute gate numbers, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/verify-routing-calibration.test.ts tests/unit/label-pack-schema.test.ts` |
| fileScopeMustChange | `scripts/verify-routing-calibration.ts`, `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Dry-run reports ECE on holdout from label packs; OATS min sample sizes documented; README covers regenerate + dry-run; #102 closable; `npm run verify:ci` green. |

## Steps

### Step 1: Pack-fed calibration dry-run + ECE

- [ ] Extend verify (or add npm script) to load label-pack JSONL fixtures, holdout-split, report ECE (and pass/fail vs documented soft threshold or report-only if sample-starved)
- [ ] Ensure dry-run rejects tainted rows via label-pack schema; never write prompt text into artifacts
- [ ] Unit tests covering ECE reporting path on tiny fixtures (deterministic)

### Step 2: OATS min-sample docs + operator README

- [ ] Document OATS `min_positive_samples` / `min_negative_samples` and global `MINIMUM_TRAINING_SAMPLES.routing_centroids` in README and/or PROVENANCE / routing-calibration example
- [ ] Document how #96 should use pack holdout (not fixture-only QR) when deciding `modernbert_k4` enablement — advisory, no default flip
- [ ] Cross-link pack regenerate commands (SWE-Gym, FC-RewardBench, optional weak labels)

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run dry-run npm script on CI fixtures
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `README.md` — label packs, dry-run ECE, OATS min samples, regenerate commands *(also in File Scope)*

**Check If Affected:**
- `docs/routing-roadmap.md` — mark #102 / label-volume gap closed or partial
- `tests/eval/corpus/label-packs/PROVENANCE.md` — ECE/holdout notes
- `config/routing-calibration.json.example` — min sample commentary

## Completion Criteria

- [ ] Calibration dry-run reports ECE on holdout from packs
- [ ] OATS minimum sample sizes documented
- [ ] Operator regenerate + dry-run docs in README
- [ ] Absolute gate thresholds unchanged
- [ ] `npm run verify:ci` green
- [ ] Issue #102 closable

## Git Commit Convention

- `feat(SP-191): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip `modernbert_k4` / encoder defaults (#96)
- Change `config/release-gates.json` absolute thresholds
- Re-open or implement #1, #25, #26
- Implement #95 dogfood protocol or #103 LLMRouterBench subset

## Amendments

None.
