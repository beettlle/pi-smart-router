# SP-229: Sync routing contracts with live pipeline — Status

**Current Step:** Step 3
**Status:** In Progress
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** M

---

## Step 1: Extend decision/request schemas and types

**Status:** Complete (plan review engine-skipped, SP-195)

- [x] Stage enum + features sidecar
- [x] Message fields aligned with SP-225

## Step 2: Strict Zod and live round-trip test

**Status:** Complete (plan review engine-skipped, SP-195)

- [x] Strict schemas
- [x] Live route() contract test

## Step 3: Testing and verification

**Status:** In progress

- [ ] Contract `testCommand`
- [ ] `npm run verify:ci`

---

## Completion Criteria

- [ ] Contracts match live pipeline
- [ ] #136 closable
