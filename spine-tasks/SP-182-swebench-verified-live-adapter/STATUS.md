# SP-182: SWE-bench Verified Native Live Adapter — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Parse Verified board → fixture entries

**Status:** ✅ Complete

- [x] Adapter for leaderboards.json Verified
- [x] Model id mapping + resolved→score
- [x] Register live URL

## Step 2: Offline unit fixtures + tests

**Status:** 🔄 In Progress

- [ ] Truncated sample for CI
- [ ] Unit tests (extract, map, skip)

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] Full suite + coverage ≥77%

---

## Completion Criteria

- [ ] Native adapter live
- [ ] Offline unit coverage
- [ ] No invented scores

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine-owned; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Verified board uses `tags: ["Model: …"]` + `resolved` (0–100). Multi-model rows are common. | Map only single-model rows; skip multi-model / unmapped. |
| 2026-07-10 | SP-181 test asserts `getDefaultLiveFetchUrls() === {}`. Registering swebench live URL will fail that assertion. | Amend File Scope to allow updating that one expectation. |
| 2026-07-10 | Live override tests pass fixture-shaped JSON to swebench. | Native adapter accepts fixture-shaped JSON passthrough OR leaderboards.json. |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | start | Resume: Step 1 in progress; plan review skipped by engine |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Plan review for Step 1 returned skipped (batch engine runs reviews after `.DONE`). Proceeding with implementation.
