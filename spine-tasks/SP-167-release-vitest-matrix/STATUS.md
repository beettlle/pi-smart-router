**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 1: @release wrappers

**Status:** Complete

- [x] Wrap 8 integration test files in top-level `describe('@release', ...)`
- [x] Wrap `tests/contract/routing-schemas.test.ts` and `tests/eval/harness-tracks.test.ts`
- [x] Add optional scenario matrix comment at file top where helpful

## Step 2: test:release script

**Status:** Complete

- [x] Add `"test:release": "vitest run --testNamePattern '@release'"` to package.json

## Step 3: Testing and verification

**Status:** Complete

- [x] Run `npm run test:release` — confirms matrix subset runs
- [x] Run `npm run verify:ci`

---

## Completion Criteria

- [x] 10 test files wrapped with @release
- [x] `test:release` script in package.json
- [x] No changes to test assertions
- [x] `npm run verify:ci` passes

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | Step 1 | plan | skipped (engine-owned) |
| 2026-07-10 | Step 2 | plan | skipped (engine-owned) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 complete | 10 files wrapped with @release |
| 2026-07-10 | Step 2 complete | test:release script added |
| 2026-07-10 | Step 3 complete | test:release 157 tests, verify:ci passed |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
