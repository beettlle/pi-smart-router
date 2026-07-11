# SP-191: Calibration Dry-Run ECE + OATS Docs — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Pack-fed calibration dry-run + ECE

**Status:** ✅ Complete

- [x] Dry-run loads packs + holdout ECE
- [x] Tainted rows rejected
- [x] Unit tests on fixtures

## Step 2: OATS min-sample docs + operator README

**Status:** 🔄 In Progress

- [ ] Document OATS + MINIMUM_TRAINING_SAMPLES
- [ ] #96 holdout advisory
- [ ] Regenerate command cross-links

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] Dry-run script on fixtures
- [ ] verify:ci
- [ ] Coverage ≥77%

---

## Completion Criteria

- [x] ECE reported on holdout
- [ ] OATS mins documented
- [ ] README updated
- [ ] Gates untouched
- [ ] #102 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine-owned SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | Plan review spawn skipped in worker; engine runs reviews after `.DONE` | Continue step work |
| 2026-07-11 | `verifyRoutingCalibration` upstream impact LOW (0 callers in graph) | Safe to extend |
| 2026-07-11 | Isotonic holdout ECE helpers already exist; wire packs via label-pack schema | Reuse fit/split/ECE |
| 2026-07-11 | CI fixtures are sample-starved → dry-run report-only; soft ECE when ≥30 eligible | Matches PROMPT |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | start | Step 1 in progress — pack-fed dry-run + ECE |
| 2026-07-11 | step1 outcomes | Dry-run API + npm script + unit tests green |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Review Level 1: in-worker plan review skipped (SP-195); engine runs plan/code/final after `.DONE`.
