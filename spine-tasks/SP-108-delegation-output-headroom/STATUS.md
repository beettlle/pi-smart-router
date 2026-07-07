# SP-108 Status

**Current Step:** Step 1
**Status:** Not Started
**Last Updated:** 2026-07-07
**Review Level:** 2
**Size:** M

---

## Step 1: Output headroom helper

**Status:** ⬜ Not Started

- [ ] Pure headroom computation helper
- [ ] MIN_OUTPUT_TOKEN_FLOOR and buffer constants
- [ ] Unit tests for no-fit and healthy margin cases

## Step 2: Pre-dispatch guard

**Status:** ⬜ Not Started

- [ ] Re-check input + reserve before delegateWithOutcome
- [ ] Context-overflow fallback without provider call on no-fit

## Step 3: Explicit maxTokens

**Status:** ⬜ Not Started

- [ ] Set maxTokens in resolveDelegationOptions
- [ ] Skip dispatch when below floor

## Step 4: Testing and verification

**Status:** ⬜ Not Started

- [ ] Integration test for 0-output length failure
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] All acceptance criteria from PROMPT met
- [ ] `npm run verify:ci` passes
