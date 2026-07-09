**Current Step:** 3
**Status:** In progress
**Last Updated:** 2026-07-09
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Label schema and aggregate mapping

- [x] Define label fields for tool-failure chains, stop_reason failures, re-prompt, edit-distance proxy
- [x] Map telemetry/outcome records in `calibration-aggregate.ts`
- [x] Extend calibration bundle schema if needed

## Step 2: Classifier training consumption

- [x] Update `p-success-classifier.ts` training path to use richer labels
- [x] Keep `MIN_TRAINING_SAMPLES` guard and neutral fallback

## Step 3: Testing and verification

- [x] Unit tests with fixture rows for each new label type
- [x] Run `npm run verify:ci`

## Completion Criteria

- [x] Aggregate export includes richer failure proxies
- [x] Classifier training uses new labels when present
- [x] Privacy constraint preserved (no raw prompt text)
- [x] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

- Checked-in `scripts/calibration-aggregate.js` must be recompiled when `.ts` changes (vitest imports `.js`).
