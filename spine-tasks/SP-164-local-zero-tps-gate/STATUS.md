**Current Step:** Step 1
**Status:** Pending
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Pipeline integration

**Status:** Pending

- [ ] Inject throughput meter into router pipeline
- [ ] In `localZeroTierStage`, check median tok/s before dispatch
- [ ] Skip local_zero when below threshold; return economical cloud path

## Step 2: Telemetry and tests

**Status:** Pending

- [ ] Add `throughput_below_threshold` to local_zero skip reasons
- [ ] Unit tests with mocked throughput meter (above/below threshold)

## Step 3: Testing and verification

**Status:** Pending

- [ ] Run `npm run verify:ci`

---

## Completion Criteria

- [ ] local_zero gated on rolling median tok/s
- [ ] Fall through to economical cloud when below threshold
- [ ] Unit tests with mocked throughput meter
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
