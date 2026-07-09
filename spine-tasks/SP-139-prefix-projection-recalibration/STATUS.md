**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-07-09
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Train path update

- [x] Ensure projection training uses extended prefix in feature extraction
- [x] Bump artifact version when prefix schema changes

## Step 2: Verify and example bundle

- [ ] Update verify benchmarks for new prefix behavior
- [ ] Refresh `routing-calibration.json.example` if needed

## Step 3: Testing and verification

- [ ] Unit tests for version mismatch rejection
- [ ] Run `npm run routing:verify-calibration` and `npm run verify:ci`

## Completion Criteria

- [ ] Projection recalibration path works with 7-flag prefix
- [ ] Verify script passes
- [ ] Stale bundle version rejected at runtime
- [ ] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

(none)
