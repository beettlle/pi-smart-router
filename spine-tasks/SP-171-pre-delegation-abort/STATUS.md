# SP-171: Pre-Delegation Abort Checks — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 1: Phase-boundary abort checks

**Status:** ⬜ Not Started

- [ ] throwIfAborted at top of routeAndDelegate
- [ ] Before ensureFleetFresh, dispatch, planning delegate
- [ ] At each failover loop iteration
- [ ] Document HyDRA mid-ONNX cancel limitation

## Step 2: Pre-delegation abort test

**Status:** ⬜ Not Started

- [ ] Add `tests/unit/pre-delegation-abort.test.ts` — abort during mocked slow dispatch — no delegation

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Run scoped vitest (pre-delegation-abort + smart-router-extension)
- [ ] Run full `npm test`
- [ ] Run coverage gate

---

## Completion Criteria

- [ ] Abort checks at all listed phase boundaries
- [ ] Slow-dispatch abort test passes in `tests/unit/pre-delegation-abort.test.ts`
- [ ] HyDRA limitation documented
- [ ] Closes #90

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

- 2026-07-10: Contract `fileScopeMustChange` redirected to `planning-delegate.ts` (SP-169 prelanded route-and-delegate).
- 2026-07-10: Contract redirected again to `tests/unit/pre-delegation-abort.test.ts` (SP-170 prelanded planning-delegate).
