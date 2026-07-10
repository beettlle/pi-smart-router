# SP-170: Live Stream Event Piping — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Live pipe to outer

**Status:** ⬜ Not Started

- [ ] Refactor happy path to push events to outer as they arrive
- [ ] Adapt injectFailoverNotice for live piping
- [ ] Keep delegateWithOutcome recording after stream ends
- [ ] Document planning-delegate buffer vs discard choice

## Step 2: Live-forwarding tests

**Status:** ⬜ Not Started

- [ ] Unit test: text_delta or start before done on slow stream
- [ ] Update existing delegation/failover tests

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Run scoped vitest for smart-router-extension
- [ ] Run full `npm test`
- [ ] Run coverage gate

---

## Completion Criteria

- [ ] Live event forwarding on delegated streams
- [ ] Failover notice works without buffered-array mutation
- [ ] Live-forwarding unit test passes
- [ ] Existing delegation/failover tests pass

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
