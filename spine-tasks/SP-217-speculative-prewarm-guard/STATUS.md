# SP-217: Speculative Prewarm with Acceptance Guard — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Prewarm module + config (default off)

**Status:** ✅ Complete (plan review skipped by engine — SP-195; reviewed post-.DONE)

- [x] Speculative prewarm module (injectable clock/cancel)
- [x] Config default off
- [x] Hard deadline fail-open
- [x] Unit tests default-off + timeout

**Plan-review checkpoint** — Pre-generation only.

## Step 2: Pipeline wire + adaptive guard + telemetry

**Status:** 🔄 In Progress

- [ ] Pipeline hook for local/economical lean
- [ ] Adaptive session disable
- [ ] Telemetry fields
- [ ] Low-acceptance coverage

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand`
- [ ] Related pipeline / telemetry tests if touched
- [ ] `npm run verify:ci` if time allows
- [ ] coverage:check ≥77%
- [ ] #117 comment / closable

---

## Completion Criteria

- [ ] Default-off + hard deadline fail-open
- [ ] Adaptive disable + telemetry
- [ ] Pre-generation only
- [ ] #117 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-08-03 | 1 | plan | SKIPPED (engine-owned post-.DONE, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.15.0 Colibri theme. Owns `router-pipeline.ts`; disjoint from SP-215 (expected-cost/heat) and SP-216 (hardware/commands).
