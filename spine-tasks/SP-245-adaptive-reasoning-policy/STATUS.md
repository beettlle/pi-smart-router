# SP-245: Adaptive reasoning policy and delegation option merge — Status

**Current Step:** 2
**Status:** In Progress
**Last Updated:** 2026-08-30
**Review Level:** 1
**Size:** M

---

## Step 1: Policy module + unit tests

**Status:** Complete

- [x] Add adaptive-reasoning policy module (domain or extension) with matrix tests
- [x] Explicit higher `/thinking` / caller reasoning never lowered
- [x] Model max ceiling respected; fail open when unsupported

## Step 2: Wire into delegation options

**Status:** Complete

- [x] Consult policy from route-and-delegate / stream option build
- [x] Merge before `delegateStream`; preserve caller option keys contract
- [x] Optional conciseness suffix only for low/minimal + high `verbosity_factor`

## Step 3: Testing and verification

**Status:** Pending

- [ ] Extension test asserts delegated options reflect turn class
- [ ] Contract `testCommand` green
- [ ] Partial #166 — config/docs/telemetry polish → SP-246

## Completion Criteria

- [ ] Policy + merge wired with tests; Partial #166

## Discoveries

(none yet)
