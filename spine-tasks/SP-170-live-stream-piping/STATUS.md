# SP-170: Live Stream Event Piping — Status

**Current Step:** 3
**Status:** 🟢 Complete
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Live pipe to outer

**Status:** ✅ Complete

- [x] Refactor happy path to push events to outer as they arrive
- [x] Adapt injectFailoverNotice for live piping
- [x] Keep delegateWithOutcome recording after stream ends
- [x] Document planning-delegate buffer vs discard choice

## Step 2: Live-forwarding tests

**Status:** ✅ Complete

- [x] Unit test: text_delta or start before done on slow stream
- [x] Update existing delegation/failover tests

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Run scoped vitest for smart-router-extension
- [x] Run full `npm test`
- [x] Run coverage gate

---

## Completion Criteria

- [x] Live event forwarding on delegated streams
- [x] Failover notice works without buffered-array mutation
- [x] Live-forwarding unit test passes
- [x] Existing delegation/failover tests pass

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE) |
| 2026-07-10 | 2 | plan | skipped (engine post-.DONE) |
| 2026-07-10 | 3 | plan | pending |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Terminal done/error held until failover decision; non-terminal events live-forward | Preserves discard-on-failover without freezing UI |
| 2026-07-10 | Planning delegate stays on collectDelegatedStream (buffer) | Only observation text reaches primary; frontier tokens discarded |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 | Live pipe + pushFailoverNotice + planning buffer docs |
| 2026-07-10 | Step 2 | Live-forwarding test + failover notice assertions on text_delta |
| 2026-07-10 | Step 3 | typecheck + 1465 tests + coverage 92.49% lines |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

- 2026-07-10: Contract `fileScopeMustChange` redirected to `delegation-runtime.ts` (SP-169 prelanded stream paths).

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

- 2026-07-10: Contract `fileScopeMustChange` redirected to `delegation-runtime.ts` (SP-169 prelanded stream paths).
