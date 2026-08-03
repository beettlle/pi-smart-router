# SP-217: Speculative Prewarm with Acceptance Guard — Status

**Current Step:** 3
**Status:** ✅ Complete
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

**Status:** ✅ Complete (plan review skipped by engine — SP-195)

- [x] Pipeline hook for local/economical lean
- [x] Adaptive session disable
- [x] Telemetry fields
- [x] Low-acceptance coverage

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Contract `testCommand` (typecheck + 19/19 prewarm tests)
- [x] Related pipeline / telemetry tests if touched (174 tests, 6 files green)
- [x] `npm run verify:ci` if time allows (build/typecheck/lint/coverage all exit 0; full suite 1791/1791)
- [x] coverage:check ≥77% (overall 93.17%; speculative-prewarm.ts 97.18%)
- [x] #117 comment / closable (comment posted; close deferred to v0.15.0 release merge — "Closes #117")

---

## Completion Criteria

- [x] Default-off + hard deadline fail-open
- [x] Adaptive disable + telemetry
- [x] Pre-generation only
- [x] #117 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-08-03 | 1 | plan | SKIPPED (engine-owned post-.DONE, SP-195) |
| 2026-08-03 | 2 | plan | SKIPPED (engine-owned post-.DONE, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.15.0 Colibri theme. Owns `router-pipeline.ts`; disjoint from SP-215 (expected-cost/heat) and SP-216 (hardware/commands).

Implementation summary (2026-08-03):
- `src/domain/routing/speculative-prewarm.ts`: `SpeculativePrewarmGuard` — hard-deadline race with AbortController cancel, per-session rolling acceptance window (16), guard trips at `< min_acceptance_rate` after `min_attempts_before_guard`.
- Config `speculative_prewarm` in schemas + `DEFAULT_OPERATOR_CONFIG` — default OFF.
- Pipeline: prewarm in `local_zero` stage after eligibility/hardware/tool-use/throughput gates, before the readiness ping; accepted prewarm reuses the warm readiness result; timeout/miss falls back to the normal probe (fail open, no behavior change vs prewarm-off).
- Telemetry: `prewarm_attempted` / `prewarm_accepted` / `prewarm_disabled_reason` (optional on `RoutingTelemetry` + feature sidecar; emitter defaults false/null/null).
- fleet-bootstrap passthrough skipped — no existing local_zero/degraded_route passthrough pattern there; pipeline defaults apply.
- #117 commented (comment-5161182778); closing left to release PR.
