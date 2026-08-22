# SP-229: Sync routing contracts with live pipeline — Status

**Current Step:** Done
**Status:** Complete
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

**Status:** Complete

- [x] Contract `testCommand` — `npm run typecheck && npx vitest run tests/contract/routing-schemas.test.ts` (38 tests pass)
- [x] `npm run verify:ci` — build + typecheck + lint + coverage:check exit 0 (93.15% lines)
- [x] Full `npm test` — 113 files, 1895 tests pass

---

## Completion Criteria

- [x] Contracts match live pipeline
- [x] Live round-trip contract test passes
- [x] #136 closable
