# SP-214: Quota Window Feed for Virtual Cost v2 — Status

**Current Step:** Step 3
**Status:** 🔄 In Progress
**Last Updated:** 2026-08-02
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Feed module + degrade chain

**Status:** ✅ Complete

- [ ] Document adapter → estimate → omit
- [ ] Pool-level QuotaWindowPosition or omit
- [ ] Soft bias only; hard-ban threshold documented if any

**Plan-review checkpoint** — Confirm SP-097 safety net; no universal-provider claims.

## Step 2: Extension wiring + tests

**Status:** ✅ Complete

- [x] Wire into createDispatchOptions / pipeline
- [x] Unit tests for estimate/adapter mapping
- [x] Roadmap/README feed note

## Step 3: Testing & Verification

**Status:** 🔄 In Progress

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
| 2026-08-02 | 1 | plan | SKIPPED (engine-owned; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-08-02 | Feed module created: degrade chain adapter → telemetry pool burn estimate → omit; pool = models with `quota_cost_per_1m`; budget env-gated (default disabled, never invented) | None |

## Notes

Release v0.14.0. Disjoint from SP-212 (pipeline sandwich) and SP-213 (planning-delegate timeouts).
