**Current Step:** Step 3: Testing and verification
**Status:** In Progress
**Last Updated:** 2026-07-09
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Expected-cost integration

**Status:** Complete

- [x] Replace flat quota cost with v2 virtual cost in E[cost] computation
- [x] Late-window exhaustion risk increases effective tier cost
- [x] Explain output documents v2 cost breakdown

## Step 2: Breakeven and telemetry

**Status:** Complete

- [x] Compose KV-cache savings credit with breakeven gate decisions
- [x] Telemetry records quota premium and cache credit separately

## Step 3: Testing and verification

**Status:** In Progress

- [x] Expected-cost integration tests with window position scenarios
- [x] Run `npm run verify:ci`

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-09 | Breakeven v2 path activates only when quota window or v2 config is set; legacy path unchanged | Avoids double-counting KV credit with SAAR future_cache_value |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-09 | Step 1–3 | Wired computeVirtualCostV2 into expected-cost; breakeven v2 marginal savings + telemetry scalars |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
