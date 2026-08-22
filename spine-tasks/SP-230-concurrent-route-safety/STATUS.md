# SP-230: RouterPipeline concurrent route() safety — Status

**Current Step:** Step 1
**Status:** In Progress
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** M

---

## Plan (SP-230)

Enforce the single-flight contract in code: serialize `RouterPipeline.route()` via an internal promise-chain mutex. Chosen over the full per-call `RoutingContext` refactor because that touches ~138 instance-field references across every stage — adjacent to the B1 god-object split (#143), which PROMPT explicitly excludes. Verified safe: no reentrancy (nothing inside a route() execution calls route()/dispatch()), route() never rejects to the caller (zero-crash catch; queue chained defensively anyway).

## Step 1: Refactor or document concurrency contract

**Status:** In progress

- [x] Per-call RoutingContext or documented single-flight
- [x] Code comments on concurrency

## Step 2: Test and document

**Status:** Not started

- [ ] Concurrent or contract test
- [ ] createRouter / README note

## Step 3: Testing and verification

**Status:** Not started

- [ ] Contract `testCommand`
- [ ] `npm run verify:ci`

---

## Completion Criteria

- [ ] Concurrency contract clear and tested
- [ ] #141 closable
