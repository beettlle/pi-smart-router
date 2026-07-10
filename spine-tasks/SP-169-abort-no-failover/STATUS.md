# SP-169: Abort Must Not Trigger Failover — Status

**Current Step:** 1
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 1: Abort helper and catch path

**Status:** 🔄 In Progress

- [x] Add shared helper e.g. `isAbortError(error, options)` and/or `throwIfAborted(options)`
- [x] In `routeAndDelegate` catch: if abort, push aborted error, `outer.end()`, no `selectFailover`
- [x] Keep STREAM_DELEGATION_ERROR failover path for non-abort failures

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
- [x] Shared abort helper in place

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | step_start | Step 1 — Abort helper and catch path |
| 2026-07-10 | outcomes | Abort helpers + catch path wired; STREAM_DELEGATION_ERROR failover preserved |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
