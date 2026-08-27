# SP-236: Remove fire-and-forget SQLite writes + benchmark — Status

**Current Step:** 3
**Status:** In Progress
**Last Updated:** 2026-08-27
**Review Level:** 1
**Size:** S

---

## Step 1: Remove fire-and-forget + document StorePort

**Status:** ✅ Complete (plan review skipped by engine — SP-195)

- [x] Remove void.catch hot-path patterns
- [x] StorePort sync docs

## Step 2: Benchmark evidence

**Status:** ✅ Complete (plan review skipped by engine — SP-195)

- [x] Lag / p95 evidence under synthetic write load

## Step 3: Testing and verification

**Status:** 🔄 In Progress

- [ ] Contract `testCommand`
- [ ] `npm test` + coverage gate

---

## Completion Criteria

- [ ] #142 closable

## Discoveries

- 2026-08-27: SP-235 pre-landed queue wiring in `session-pinner.ts`; residual `void … .catch` still present (~900/913). Contract redirected to `store-port.ts` + `tests/unit/write-queue-lag.test.ts` (see PROMPT Amendment 1).
