# SP-201: TwinRouterBench Weak Packs + Fit CLI — Status

**Current Step:** 3
**Status:** ✅ Complete
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Corpus → weak pack path

**Status:** ✅ Complete

- [x] Ingest from ci-subset
- [x] PROVENANCE note
- [x] weak policy enforced

## Step 2: CLI `--include-excluded-in-fit`

**Status:** ✅ Complete

- [x] Flag wiring
- [x] Unit tests fit vs ECE
- [x] README / PROVENANCE

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Contract tests
- [x] Smoke dry-run
- [x] verify:ci
- [x] Close #106

---

## Completion Criteria

- [x] Weak pack path
- [x] CLI flag
- [x] ECE boundary
- [x] #106 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-11 | 2 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-11 | 3 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | `includeExcludedInFit` already on `runCalibrationDryRunFromRows`; CLI did not parse `--include-excluded-in-fit` | Wired + tests; fit path includes weak in isotonic fit only |
| 2026-07-11 | Smoke: ci-subset → 148 weak rows; dry-run `ece_eligible=4` with/without flag | ECE boundary held |
| 2026-07-11 | `detect_changes` vs main: HIGH (dry-run calibration flows) | Expected; unit + verify:ci green |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | start | Resume Step 1; plan review skipped by engine |
| 2026-07-11 | step1 done | Commit `feat(SP-201): complete Step 1 — Corpus → weak pack path` |
| 2026-07-11 | step2 done | Commit `feat(SP-201): complete Step 2 — CLI --include-excluded-in-fit` |
| 2026-07-11 | step3 done | Contract + smoke + verify:ci + coverage 92.96% lines; #106 closed |

## Blockers

None.
