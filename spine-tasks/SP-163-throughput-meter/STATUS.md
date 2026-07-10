**Current Step:** Step 1
**Status:** Pending
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Throughput meter module

**Status:** Pending

- [ ] Implement `throughput-meter.ts` with rolling median over last N samples
- [ ] API: `recordSample(tokens, durationMs)`, `getMedianTps()`, `isAboveThreshold(threshold)`
- [ ] Default threshold ~25 tok/s; configurable window size

## Step 2: Config and unit tests

**Status:** Pending

- [ ] Add throughput config to operator/hardware config schema
- [ ] Unit tests with mocked throughput samples (above/below threshold)

## Step 3: Testing and verification

**Status:** Pending

- [ ] Run `npm run verify:ci`

---

## Completion Criteria

- [ ] Rolling median tokens_per_second meter
- [ ] Configurable window and threshold
- [ ] Unit tests with mocked samples
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
