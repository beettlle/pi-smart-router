# SP-246: Adaptive reasoning operator config, telemetry, and README — Status

**Current Step:** 2
**Status:** Complete
**Last Updated:** 2026-08-30
**Review Level:** 1
**Size:** S

---

## Step 1: Config + telemetry fields

**Status:** Complete

- [x] Wire enable/disable + optional floor/ceiling
- [x] Emit `reasoning_level_requested`, `reasoning_level_applied`, `reason_code`

## Step 2: Testing and verification

**Status:** Complete

- [x] README operator section updated
- [x] Contract `testCommand` green
- [x] #166 closable with SP-245

## Completion Criteria

- [x] Config, telemetry, README complete; #166 closable

## Discoveries

- Telemetry reason-code field named `reasoning_reason_code`: `RoutingTelemetry.reason_code` is already the routing-decision code, so the adaptive-reasoning code follows the established `saar_reason_code` / `planning_delegate_reason_code` / `context_fit_reason_code` pattern. PROMPT's `reason_code` (e.g. `turn_envelope_main_loop`) maps to this field.
- Floor/ceiling semantics: bounds clamp the policy-derived level before the caller merge; explicit operator `/thinking` is never lowered by either bound (a floor may raise one via the policy-upgrade path); when floor > ceiling (env edge), the ceiling wins (cost-safe). Schema rejects floor > ceiling in JSON config; env resolver ignores invalid levels.
- Telemetry enrichment follows the SP-241 usage-actuals pattern: `onDelegationReasoning` callback → `store.updateTelemetryReasoning?.(requestId, fields)` fail-open; SQLite migration V7 adds the three columns.
- Full `npm test` after Step 1: 117 files / 2034 tests green (+53 from SP-246 suites).
- Time-bomb tests fixed in Step 2:`memory-store.test.ts` / `sqlite-store.test.ts` dataset tests used hardcoded `2026-08-01` timestamps; once wall-clock crossed the 30-day retention window (`dataset-limits.ts` evicts expired rows on append / sqlite purges on write), the just-appended fixture rows were evicted and 4 tests failed. Timestamps are now relative to `Date.now()`. Pre-existing flake, unrelated to SP-246 logic.
- Final verification (2026-09-01): `npm run typecheck` clean; contract `npx vitest run tests/integration/pi-extension.test.ts` 42/42 green; full `npm test` 117 files / 2035 tests green. Plan review at Step 2 checkpoint: skipped by engine (SP-195 — batch engine runs reviews after .DONE). File-scope contract verified: `README.md` changed; `router-pipeline.ts`, `src/infrastructure/pricing/**`, `package.json` untouched.
