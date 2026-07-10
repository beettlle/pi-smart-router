# SP-169: Abort Must Not Trigger Failover — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 1: Abort helper and catch path

**Status:** ⬜ Not Started

- [ ] Add shared helper e.g. `isAbortError(error, options)` and/or `throwIfAborted(options)`
- [ ] In `routeAndDelegate` catch: if abort, push aborted error, `outer.end()`, no `selectFailover`
- [ ] Keep STREAM_DELEGATION_ERROR failover path for non-abort failures

## Step 2: Mid-stream abort tests

**Status:** ⬜ Not Started

- [ ] Unit test: mid-stream abort — selectFailover not called; reason aborted
- [ ] Unit test: pre-aborted signal still skips delegation

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Run scoped vitest for smart-router-extension
- [ ] Run full `npm test`
- [ ] Run coverage gate

---

## Completion Criteria

- [ ] Abort never triggers failover retry
- [ ] Mid-stream abort unit test passes
- [ ] Pre-aborted regression still passes
- [ ] Shared abort helper in place

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
