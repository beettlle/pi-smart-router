**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-04
**Review Level:** 1
**Size:** S

---

## Step 1: Mapper cost derivation

**Status:** Complete

- [x] Extend `PiModelInput` with optional cost fields
- [x] Derive `fallback_cost_per_1m` from registry cost
- [x] Keep pattern tier/capability defaults

## Step 2: Extension pass-through

**Status:** Complete

- [x] Forward cost in `registryModelsToFleetInput`
- [x] Verify scoped and all modes

## Step 3: Testing and verification

**Status:** Complete

- [x] Unit tests for cost override and fallback paths
- [x] Run `npm run typecheck && npm test`

## Completion Criteria

- [x] All steps complete
- [x] Tests pass
