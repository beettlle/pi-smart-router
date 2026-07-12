# SP-202: TwinRouterBench Over-Routing Analysis — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Reproduce soft-report + analyzer

**Status:** ✅ Complete

- [x] Archive soft-report numbers
- [x] Analyzer script
- [x] package.json script (optional)
- [x] Unit tests

## Step 2: Authoring report + recommendation

**Status:** 🔄 In Progress

- [ ] over-routing-analysis.md
- [ ] No silent hard-gate move
- [ ] Link from #112 / #95

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract tests
- [ ] Analyzer smoke
- [ ] verify:ci
- [ ] coverage:check
- [ ] Close #112

---

## Completion Criteria

- [x] Soft-report archived
- [x] Breakdown script + tests
- [ ] Report with causes + recommendation
- [ ] Gates untouched
- [ ] #112 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | Soft-report mean_over_routing_rate=0.868056 vs max 0.15 | Archived for report |
| 2026-07-11 | 100/100 over-routes are downgrade_first_candidate zero-tier→economical-cloud; no baseline_tier on corpus records | Primary root cause = adapter default, not live router |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | Step 1 started | Reproduce soft-report + analyzer |
| 2026-07-11 | Soft-report | FAIL report-only; mean_over_routing_rate 0.868056 |
| 2026-07-11 | Analyzer + tests | scripts/eval/analyze-twinrouterbench-overrouting.ts + unit tests + npm script |
| 2026-07-11 | Step 1 complete | Commit 32ade07; plan review skipped |
| 2026-07-11 | Step 2 started | Authoring report + recommendation |

## Blockers

None.
