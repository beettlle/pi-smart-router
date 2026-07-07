# SP-112 Status

**Current Step:** Step 1
**Status:** In Progress
**Last Updated:** 2026-07-07
**Review Level:** 1
**Size:** M

---

## Step 1: Metadata prefix builder

**Status:** ✅ Complete

- [x] Create `hydra-input.ts` with `buildHydraInput`
- [x] Unit tests for prefix format

## Step 2: Wire into HyDRA matcher

**Status:** ⬜ Not Started

- [ ] Replace raw prompt in `HydraMatcher.match()`
- [ ] Regression tests for coding prompts
- [ ] Document in data-model.md

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Token-count sensitivity test
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] All acceptance criteria from PROMPT met
- [ ] `npm run verify:ci` passes
