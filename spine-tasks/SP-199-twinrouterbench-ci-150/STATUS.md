# SP-199: TwinRouterBench CI Subset 150 — Status

**Current Step:** 1
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Bump bound + regenerate subset

**Status:** 🔄 In Progress

- [x] CI_SUBSET_MAX_RECORDS=150
- [x] Regenerate ci-subset.json
- [x] PROVENANCE + tests

## Step 2: Offline load sanity

**Status:** ⬜ Not Started

- [ ] Corpus smoke path
- [ ] Fixtures unchanged

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
- [ ] Gates untouched
- [ ] Partial #107

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine post-.DONE) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | prefer-code-tool --limit 150 yields 148 rows (pin has fewer code/tool rows than quota) | Documented; still ≤150 |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | Step 1 started | Plan review skipped; bumping bound 50→150 |
| 2026-07-11 | Subset regenerated | 148 records; SHA c9a45d5bf25bb1e56d80d6a31dbd2b4c0fff02e4ba2a9e7a46565437ae97fdca |

## Blockers

None.
