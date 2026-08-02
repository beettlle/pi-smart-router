# SP-212: Degraded Neural Failover Sandwich — Status

**Current Step:** Step 1
**Status:** ⬜ Not Started
**Last Updated:** 2026-08-02
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Sandwich module + wiring

**Status:** ⬜ Not Started

- [ ] Degrade path neural → learned → pattern → safe default
- [ ] Pipeline/matcher wiring; host never crashes
- [ ] `route_path` telemetry + confidence
- [ ] Learned keys fingerprint/cluster only

**Plan-review checkpoint** — Confirm distinct from #115; no FrugalGPT cascade.

## Step 2: Pattern pack + failure injection tests

**Status:** ⬜ Not Started

- [ ] Optional pattern pack fail-closed
- [ ] Unit tests for encoder failure injection
- [ ] Brief operator docs pointer

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand` green
- [ ] Related matcher/pipeline tests if touched
- [ ] coverage:check
- [ ] #119 commented + closable

---

## Completion Criteria

- [ ] Non-crashing sandwich with reason codes
- [ ] `route_path` telemetry present
- [ ] No prompt text in learned store
- [ ] #119 closable

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

Release v0.14.0 wave 1. Disjoint from SP-213 (planning-delegate) and SP-214 (quota feed).
