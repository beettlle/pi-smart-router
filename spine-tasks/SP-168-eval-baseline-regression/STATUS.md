**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Baseline capture

**Status:** Complete

- [x] Add `scripts/eval/capture-baseline.ts` — `--version 0.6.0` writes `tests/eval/baselines/v0.6.0.json`
- [x] Capture current fixture aggregate metrics from main and commit baseline file

## Step 2: Baseline regression in assert-release-gates

**Status:** Complete

- [x] Extend gate config with `baseline_regression` (`reference_version`, max drops)
- [x] Add `--baseline` and `--baseline-version` CLI flags
- [x] Reuse `computeQualityRetentionRegression` for QR; add optional capability/pin/over-routing deltas

## Step 3: Wire release path and verify

**Status:** Complete

- [x] Update `release:functional-smoke` to pass baseline version from config
- [x] Document operator re-capture flow in README (post-tag v0.7.0)
- [x] Unit test: simulated regression fails gates
- [x] Run `npm run release:check`

---

## Completion Criteria

- [x] `tests/eval/baselines/v0.6.0.json` frozen snapshot
- [x] `capture-baseline.ts` CLI
- [x] Baseline regression in assert-release-gates
- [x] `release:functional-smoke` uses baseline compare
- [x] `npm run release:check` passes

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
| 2026-07-10 | Step 1 complete | capture-baseline CLI + v0.6.0.json committed |
| 2026-07-10 | Step 2 complete | baseline_regression in assert-release-gates + config |
| 2026-07-10 | Step 3 complete | release:functional-smoke wired, tests pass, release:check OK |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
