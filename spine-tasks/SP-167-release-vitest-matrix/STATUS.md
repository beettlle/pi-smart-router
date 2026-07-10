**Current Step:** Step 2
**Status:** In Progress
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

**Status:** In Progress

- [x] Add `"test:release": "vitest run --testNamePattern '@release'"` to package.json

## Step 3: Testing and verification

**Status:** Pending

- [ ] Run `npm run test:release` — confirms matrix subset runs
- [ ] Run `npm run verify:ci`

---

## Completion Criteria

- [ ] 10 test files wrapped with @release
- [ ] `test:release` script in package.json
- [ ] No changes to test assertions
- [ ] `npm run verify:ci` passes

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
