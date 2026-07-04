**Current Step:** Step 1: Mapper cost derivation
**Status:** In Progress
**Last Updated:** 2026-07-04
**Review Level:** 1
**Size:** S

---

## Step 1: Mapper cost derivation

**Status:** In Progress

- [x] Extend `PiModelInput` with optional cost fields
- [x] Derive `fallback_cost_per_1m` from registry cost
- [x] Keep pattern tier/capability defaults

## Step 2: Extension pass-through

**Status:** Not Started

- [ ] Forward cost in `registryModelsToFleetInput`
- [ ] Verify scoped and all modes

## Step 3: Testing and verification

**Status:** Not Started

- [ ] Unit tests for cost override and fallback paths
- [ ] Run `npm run typecheck && npm test`
