# SP-223: Gate expected-cost explain logging — Status

**Current Step:** Step 1
**Status:** In Progress
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** S

---

## Step 1: Gate explain logging

**Status:** In Progress

- [x] Wrap `logExpectedCostExplain` behind `SMART_ROUTER_LOG_ROUTING`
- [x] Preserve explain when env enabled

## Step 2: Testing and verification

**Status:** Not started

- [ ] Unit test: default env no stdout flood
- [ ] Contract `testCommand`
- [ ] `npm run verify:ci`

---

## Completion Criteria

- [ ] No unconditional stdout from expected-cost explain
- [ ] Unit test covers gated behavior
- [ ] #138 closable
