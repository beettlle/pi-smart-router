# SP-201: TwinRouterBench Weak Packs + Fit CLI — Status

**Current Step:** 2
**Status:** 🟡 In Progress
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

**Status:** 🟡 In Progress

- [x] Flag wiring
- [x] Unit tests fit vs ECE
- [x] README / PROVENANCE

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract tests
- [ ] Smoke dry-run
- [ ] verify:ci
- [ ] Close #106

---

## Completion Criteria

- [x] Weak pack path
- [ ] CLI flag
- [ ] ECE boundary
- [ ] #106 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-11 | 2 | plan | pending |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | `includeExcludedInFit` already on `runCalibrationDryRunFromRows`; CLI did not parse `--include-excluded-in-fit` | Wired + tests; fit path includes weak in isotonic fit only |
| 2026-07-11 | Smoke ingest from `ci-subset.json` accepted 50/50 schema-valid weak rows with `weak_tier_proxy` + `exclude_from_holdout_ece` | Step 1 path verified |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | start | Resume Step 1; plan review skipped by engine |
| 2026-07-11 | step1 done | Commit `feat(SP-201): complete Step 1 — Corpus → weak pack path` |

## Blockers

None.
