# SP-181: Live Fetch Per-Benchmark Fallback + Adapter Registry — Status

**Current Step:** 3
**Status:** ✅ Complete
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Adapter types + registry stubs

**Status:** ✅ Complete

- [x] LeaderboardAdapter types + registry
- [x] Four stub adapters (fixture-shaped JSON)
- [x] Provenance vs live URL split

## Step 2: Per-benchmark fallback orchestration

**Status:** ✅ Complete

- [x] Independent per-benchmark live → recorded → fixture
- [x] Wire CLI / release refresh
- [x] No invented scores

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Mixed success/fallback unit tests
- [x] Scoped vitest + typecheck
- [x] Full suite + coverage ≥77%

---

## Completion Criteria

- [x] Fail-fast-all removed
- [x] Registry + stubs ready for SP-182–SP-185
- [x] Tests green

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-10 | 2 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-10 | 3 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Pre-existing `release-refresh-benchmark-profiles.test.ts` imported `.ts` path; broke `tsc --noEmit`. Fixed to `.js` (one-line, outside File Scope May-change but required for contract typecheck). | Unblocks verification |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | start | Step 1 in progress — adapter types + registry stubs |
| 2026-07-10 | implement | Adapters + per-benchmark fallback + scoped tests green |
| 2026-07-10 | step1 | Complete — committed 1f2d17b |
| 2026-07-10 | step2 | Complete — committed 5f20d16 |
| 2026-07-10 | step3 | typecheck + npm test + coverage:check (92.91% lines) green |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Release refresh already invokes `--live`; per-benchmark fallback inside fetch path means no release script change required. Step 2 orchestration landed in the same commit as Step 1 (fetch rewrite inseparable from adapter wiring).
