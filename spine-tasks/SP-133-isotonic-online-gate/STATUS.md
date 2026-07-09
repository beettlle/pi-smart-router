**Current Step:** 3
**Status:** In progress (addressing Step 3 REVISE — coverage on loader error paths)
**Last Updated:** 2026-07-09
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Runtime calibrator loader

- [x] Parse isotonic knots from bundle in classifier module
- [x] `applyIsotonicCalibrator(rawScore)` with monotonic lookup

## Step 2: Pipeline and observability

- [x] Wire calibrated score in `lowIntensityGate`
- [x] Telemetry/explain fields: `p_success_raw`, `p_success_calibrated`

## Step 3: Testing and verification

- [x] Unit tests: monotonic mapping, missing artifact fallback
- [x] Integration test: gate uses calibrated threshold
- [x] Run `npm run verify:ci`

## Completion Criteria

- [x] Online lookup applied in low_intensity gate
- [x] Observability shows calibration applied
- [x] Graceful fallback without bundle artifact
- [x] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

**2026-07-09:** Pre-land redirect — `p-success-classifier.ts` on main from SP-131; new `isotonic-calibrator.ts` module owns runtime lookup.
