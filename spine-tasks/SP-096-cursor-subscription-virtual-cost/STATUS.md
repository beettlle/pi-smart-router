# SP-096 Status

**Current Step:** Step 1
**Status:** Not Started
**Last Updated:** 2026-07-06
**Review Level:** 1
**Size:** M

---

## Step 1: Virtual subscription cost on Cursor models

**Status:** Not Started

- [ ] Add quota_cost_per_1m to ModelProfile / mapper defaults
- [ ] Set non-zero virtual cost on Cursor and Composer defaults
- [ ] Document pricing semantics in mapper comments

## Step 2: Multi-objective scoring integration

**Status:** Not Started

- [ ] Update scoreMultiObjective for subscription-aware frugality
- [ ] Economical API models outscore composer-latest when sufficient
- [ ] Telemetry uses virtual cost for Cursor models

## Step 3: Tests and verification

**Status:** Not Started

- [ ] Regression tests for inverted selection
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] All acceptance criteria from PROMPT met
- [ ] `npm run verify:ci` passes
