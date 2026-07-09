**Current Step:** 3 (complete)
**Status:** Complete
**Last Updated:** 2026-07-09
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Isotonic fit module

**Status:** Complete

- [x] Implement isotonic regression fit (PAV algorithm) on validation split
- [x] Compute and log holdout ECE vs raw logistic scores

## Step 2: Bundle schema and train integration

**Status:** Complete

- [x] Extend `routing-calibration.schema.json` with `isotonic_calibrator`
- [x] Serialize piecewise lookup table in train output
- [x] Bump bundle version field

## Step 3: Testing and verification

**Status:** Complete

- [x] `verify-routing-calibration.ts` loads and sanity-checks calibrator
- [x] Unit tests for monotonicity and edge cases
- [x] Run `npm run verify:ci`

## Completion Criteria

- [x] Isotonic artifact in versioned bundle
- [x] Holdout ECE reported in train logs
- [x] Verify script passes with new artifact
- [x] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

**2026-07-09:** Pre-land redirect — schema already on main from SP-131; contract targets new `scripts/lib/isotonic-calibrator.ts`.
**2026-07-09:** Synced `scripts/calibration-aggregate.js` with TS source so vitest resolves updated `MINIMUM_TRAINING_SAMPLES.isotonic_calibrator`.
