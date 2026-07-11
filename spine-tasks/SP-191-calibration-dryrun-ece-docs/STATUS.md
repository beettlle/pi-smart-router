# SP-191: Calibration Dry-Run ECE + OATS Docs — Status

**Current Step:** 3
**Status:** ✅ Complete
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

**Status:** ✅ Complete

- [x] Document OATS + MINIMUM_TRAINING_SAMPLES
- [x] #96 holdout advisory
- [x] Regenerate command cross-links

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Contract testCommand
- [x] Dry-run script on fixtures
- [x] verify:ci
- [x] Coverage ≥77%

---

## Completion Criteria

- [x] ECE reported on holdout
- [x] OATS mins documented
- [x] README updated
- [x] Gates untouched
- [x] #102 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine-owned SP-195) |
| 2026-07-11 | 2 | plan | skipped (engine-owned SP-195) |
| 2026-07-11 | 3 | plan | skipped (engine-owned SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | Plan review spawn skipped in worker; engine runs reviews after `.DONE` | Continue step work |
| 2026-07-11 | `verifyRoutingCalibration` upstream impact LOW (0 callers in graph) | Safe to extend |
| 2026-07-11 | Isotonic holdout ECE helpers already exist; wire packs via label-pack schema | Reuse fit/split/ECE |
| 2026-07-11 | CI fixtures are sample-starved → dry-run report-only; soft ECE when ≥30 eligible | Matches PROMPT |
| 2026-07-11 | `routing-calibration.json.example` already encodes MINIMUM_TRAINING_SAMPLES; commentary in README/PROVENANCE (schema forbids extra keys) | Docs-only |
| 2026-07-11 | `calibration-aggregate.ts` lacked CLI entry guard; import side-effect broke dry-run | Minimal out-of-scope fix (LOW risk) |
| 2026-07-11 | `excludes legacy-prefix` train test flaked at 5s under suite load | Raised timeout to 15s |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | start | Step 1 in progress — pack-fed dry-run + ECE |
| 2026-07-11 | step1 done | Dry-run API + npm script + unit tests; committed |
| 2026-07-11 | step2 done | README + PROVENANCE + routing-roadmap docs; committed |
| 2026-07-11 | step3 done | Contract + dry-run + verify:ci green (92.91% lines); coverage ≥77% |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Review Level 1: in-worker plan review skipped (SP-195); engine runs plan/code/final after `.DONE`.
