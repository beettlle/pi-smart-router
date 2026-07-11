# SP-199: TwinRouterBench CI Subset 150 — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Bump bound + regenerate subset

**Status:** ✅ Complete

- [x] CI_SUBSET_MAX_RECORDS=150
- [x] Regenerate ci-subset.json
- [x] PROVENANCE + tests

## Step 2: Offline load sanity

**Status:** 🔄 In Progress

- [x] Corpus smoke path
- [x] Fixtures unchanged

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract tests
- [ ] corpus-smoke
- [ ] verify:ci

---

## Completion Criteria

- [x] Bound 150
- [x] Checksums
- [x] No full corpus
- [x] Gates untouched
- [ ] Partial #107

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine post-.DONE) |
| 2026-07-11 | 2 | plan | skipped (engine post-.DONE) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | prefer-code-tool --limit 150 yields 148 rows (pin has fewer code/tool rows than quota) | Documented; still ≤150 |
| 2026-07-11 | corpus-smoke reports fixture_count 68 (session-grouped) from 148 records | Expected harness behavior |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | Step 1 started | Plan review skipped; bumping bound 50→150 |
| 2026-07-11 | Subset regenerated | 148 records; SHA c9a45d5bf25bb1e56d80d6a31dbd2b4c0fff02e4ba2a9e7a46565437ae97fdca |
| 2026-07-11 | Step 1 complete | commit d903bd0 |
| 2026-07-11 | Step 2 | corpus-smoke OK; fixtures + release-gates untouched |

## Blockers

None.
