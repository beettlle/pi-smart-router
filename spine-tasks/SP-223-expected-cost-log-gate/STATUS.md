# SP-223: Gate expected-cost explain logging — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** S

---

## Step 1: Gate explain logging

**Status:** Complete

- [x] Wrap `logExpectedCostExplain` behind `SMART_ROUTER_LOG_ROUTING`
- [x] Preserve explain when env enabled

## Step 2: Testing and verification

**Status:** Complete

- [x] Unit test: default env no stdout flood
- [x] Contract `testCommand`
- [x] `npm run verify:ci`

---

## Completion Criteria

- [x] No unconditional stdout from expected-cost explain
- [x] Unit test covers gated behavior
- [x] #138 closable
