# SP-214: Quota Window Feed for Virtual Cost v2 — Status

**Current Step:** Step 1
**Status:** ⬜ Not Started
**Last Updated:** 2026-08-02
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Feed module + degrade chain

**Status:** ⬜ Not Started

- [ ] Document adapter → estimate → omit
- [ ] Pool-level QuotaWindowPosition or omit
- [ ] Soft bias only; hard-ban threshold documented if any

**Plan-review checkpoint** — Confirm SP-097 safety net; no universal-provider claims.

## Step 2: Extension wiring + tests

**Status:** ⬜ Not Started

- [ ] Wire into createDispatchOptions / pipeline
- [ ] Unit tests for estimate/adapter mapping
- [ ] Roadmap/README feed note

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand` green
- [ ] Related virtual-cost / extension tests if touched
- [ ] coverage:check
- [ ] #125 commented + closable

---

## Completion Criteria

- [ ] Degrade chain documented and implemented
- [ ] QuotaWindowPosition (or omit) wired through dispatch
- [ ] Soft bias only; SP-097 preserved
- [ ] #125 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Notes

Release v0.14.0. Disjoint from SP-212 (pipeline sandwich) and SP-213 (planning-delegate timeouts).
