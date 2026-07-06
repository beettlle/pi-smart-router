# SP-091 Status

**Current Step:** Step 1
**Status:** Ready
**Last Updated:** 2026-07-06
**Review Level:** 1
**Size:** S

---

## Step 1: Investigate pi token APIs

**Status:** Not Started

- [ ] Check Context / SimpleStreamOptions for exposed token counts

## Step 2: Implement estimate in buildRoutingRequest

**Status:** Not Started

- [ ] Set `estimated_input_tokens` with preferred API or chars/4 fallback
- [ ] Ensure estimate flows through route-and-delegate

## Step 3: Testing and verification

**Status:** Not Started

- [ ] Extend integration test to assert field populated
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] All acceptance criteria from PROMPT met
- [ ] `npm run verify:ci` passes
