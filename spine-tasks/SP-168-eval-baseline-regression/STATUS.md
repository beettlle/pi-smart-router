**Current Step:** Step 1
**Status:** Pending
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Baseline capture

**Status:** Pending

- [ ] Add `scripts/eval/capture-baseline.ts` — `--version 0.6.0` writes `tests/eval/baselines/v0.6.0.json`
- [ ] Capture current fixture aggregate metrics from main and commit baseline file

## Step 2: Baseline regression in assert-release-gates

**Status:** Pending

- [ ] Extend gate config with `baseline_regression` (`reference_version`, max drops)
- [ ] Add `--baseline` and `--baseline-version` CLI flags
- [ ] Reuse `computeQualityRetentionRegression` for QR; add optional capability/pin/over-routing deltas

## Step 3: Wire release path and verify

**Status:** Pending

- [ ] Update `release:functional-smoke` to pass baseline version from config
- [ ] Document operator re-capture flow in README (post-tag v0.7.0)
- [ ] Unit test: simulated regression fails gates
- [ ] Run `npm run release:check`

---

## Completion Criteria

- [ ] `tests/eval/baselines/v0.6.0.json` frozen snapshot
- [ ] `capture-baseline.ts` CLI
- [ ] Baseline regression in assert-release-gates
- [ ] `release:functional-smoke` uses baseline compare
- [ ] `npm run release:check` passes

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
