# SP-230: RouterPipeline concurrent route() safety — Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** M

---

## Plan (SP-230)

Enforce the single-flight contract in code: serialize `RouterPipeline.route()` via an internal promise-chain mutex. Chosen over the full per-call `RoutingContext` refactor because that touches ~138 instance-field references across every stage — adjacent to the B1 god-object split (#143), which PROMPT explicitly excludes. Verified safe: no reentrancy (nothing inside a route() execution calls route()/dispatch()), route() never rejects to the caller (zero-crash catch; queue chained defensively anyway).

## Step 1: Refactor or document concurrency contract

**Status:** Complete (plan review skipped — engine-owned, SP-195)

- [x] Per-call RoutingContext or documented single-flight
- [x] Code comments on concurrency

## Step 2: Test and document

**Status:** Complete (plan review skipped — engine-owned, SP-195)

- [x] Concurrent or contract test
- [x] createRouter / README note

## Step 3: Testing and verification

**Status:** Complete

- [x] Contract `testCommand` — typecheck clean; 81/81 tests pass (incl. 2 new SP-230 concurrency tests)
- [x] `npm run verify:ci` — exit 0 (build, typecheck, lint, coverage 93.06% overall)

---

## Completion Criteria

- [x] Concurrency contract clear and tested
- [x] #141 closable

## Discoveries

- File Scope lists `README.md` as the only may-change doc, but the Contract completion criteria explicitly require "createRouter docs". Interpreted this as authorizing a doc-only JSDoc addition on `createRouter()` in `src/index.ts` (no code change). README carries the full concurrency contract section.
