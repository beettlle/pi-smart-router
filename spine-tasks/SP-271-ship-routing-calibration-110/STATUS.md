# SP-271 — Ship checked-in routing-calibration.json and supersede synthetic weights when floors met. — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-09-07
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** In Progress

- [ ] Confirm SP-270 verify metrics
- [ ] Decide ship vs operator-local with rationale

## Step 1: Ship artifacts + README

**Status:** In Progress

- [ ] Commit routing-calibration.json with provenance
- [ ] Update README behavioral-first path
- [ ] Supersede synthetic weights if floors met

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-07 | 0 | plan | skipped in-worker (engine runs post-.DONE, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-07 | SP-270's bundle was never committed to any branch; regenerated on this lane from `data/calibration/dogfood-20260714-aggregate.jsonl` — metrics byte-identical (15/15 verify, 32/32 samples, ECE 0.0208) | Bundle authored fresh here |
| 2026-09-07 | `train-calibration` strips the standalone weights' provenance block; re-ran `train-p-success` last per SP-270 handoff, then reverted the date-only diff to keep the merged SP-270 artifact | p-success-weights.json unchanged |
| 2026-09-07 | 9 tests fail with bundle present (test isolation gap; SP-270 handoff) — pin `routingCalibrationPath` in 3 test files to keep `release:check` green | Documented scope note in Step 0 |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-07 | Step 0 started | read SP-270 STATUS + train note, manifest, config examples |
| 2026-09-07 | train-calibration rerun | bundle v2 regenerated, verify 15/15 PASS |
| 2026-09-07 | full suite with bundle | 9 failed / 2162 passed — matches SP-270's documented failure set (now in SP-277/278 fragmented files) |
| 2026-09-07 | Step 0 plan review | skipped in-worker (SP-195); Step 0 complete |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
