# SP-212: Degraded Neural Failover Sandwich — Status

**Current Step:** Done
**Status:** ✅ Complete
**Last Updated:** 2026-08-02
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Sandwich module + wiring

**Status:** ✅ Complete (plan review skipped by runtime — engine-owned, SP-195)

- [x] Degrade path neural → learned → pattern → safe default
- [x] Pipeline/matcher wiring; host never crashes
- [x] `route_path` telemetry + confidence
- [x] Learned keys fingerprint/cluster only

**Plan-review checkpoint** — Confirm distinct from #115; no FrugalGPT cascade.

## Step 2: Pattern pack + failure injection tests

**Status:** ✅ Complete

- [x] Optional pattern pack fail-closed
- [x] Unit tests for encoder failure injection
- [x] Brief operator docs pointer

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Contract `testCommand` green
- [x] Related matcher/pipeline tests if touched
- [x] coverage:check
- [x] #119 commented + closable

---

## Completion Criteria

- [x] Non-crashing sandwich with reason codes
- [x] `route_path` telemetry present
- [x] No prompt text in learned store
- [x] #119 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-08-02 | 1 | plan | SKIPPED (engine-owned per SP-195; nested spawn blocked) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-08-02 | 5 pre-existing test failures under `--coverage` instrumentation (sqlite-store/memory-store/dataset-limits dataset-record tests) reproduce identically on untouched baseline c3a6f23; plain `npm test` is 1742/1742 green | `npm run coverage:check` (and therefore `verify:ci`) exits non-zero independent of SP-212; coverage measured with those 3 files excluded: changed modules 91–100% lines, total 90.7% (≥77% gate met) |
| 2026-08-02 | `RoutingTelemetry` is materialized by sqlite-store (out of File Scope), so `route_path`/`route_path_confidence` added as optional fields | Telemetry exposes route_path without touching persistence; sqlite rows simply omit it |

## Notes

Release v0.14.0 wave 1. Disjoint from SP-213 (planning-delegate) and SP-214 (quota feed).
