# SP-215: Workload Heat Map + Soft Fleet Affinity — Status

**Current Step:** 3
**Status:** ✅ Complete
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Heat schema + persistence + soft bias

**Status:** ✅ Complete

- [x] Privacy-safe heat record (no prompt text)
- [x] Persist histogram with provenance
- [x] Soft-bias first-turn via expected-cost
- [x] Unit tests for soft-bias

**Plan-review checkpoint** — No raw prompt text; shortfall gates hard.

## Step 2: Hysteresis + export/clear + dogfood pointer

**Status:** ✅ Complete

- [x] Pin-safe hysteresis (~25% + swap cap)
- [x] Export/import/clear documented
- [x] Dogfood protocol pointer
- [x] No frugality/gate flips

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Contract `testCommand` (typecheck + workload-heat.test.ts: 32/32 pass)
- [x] Related expected-cost / pinning tests if touched (expected-cost, session-pinner, saar, defaults: 103/103 pass)
- [x] `npm run verify:ci` — build ✓ typecheck ✓ lint ✓ coverage:check ✓ (full suite 108 files / 1804 tests pass)
- [x] coverage:check ≥77% — totals 92.98% lines; in-scope modules: workload-heat 94.06%, heat-affinity 79.43%, workload-heat-store 88.23%, expected-cost 93.53%, schemas 97.64%, defaults 100%
- [x] #115 comment posted; closable on lane merge

---

## Completion Criteria

- [x] Heat + persist without prompt text
- [x] Soft-bias first-turn; shortfall/gates preserved
- [x] Hysteresis at pin-safe boundaries
- [x] Export/clear documented
- [x] #115 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-08-03 | 1 | plan | skipped (engine-owned, SP-195) |
| 2026-08-03 | 2 | plan | skipped (engine-owned, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.15.0 Colibri theme. Disjoint from SP-216 (hardware/commands) and SP-217 (pipeline prewarm).

Implementation notes:
- `src/domain/routing/workload-heat.ts` — privacy-safe histogram (fingerprint/cluster keys only), bounded FIFO, decay, versioned artifact with provenance, export/import/clear.
- `src/infrastructure/telemetry/workload-heat-store.ts` — `.pi-smart-router/workload-heat.json` persistence (gitignored path reused from dataset recorder).
- `src/domain/routing/expected-cost.ts` — optional `heatBias` (soft, ≤25% cap) applied before price-delta/pin gates; gates remain hard (tests assert both).
- `src/domain/pinning/heat-affinity.ts` — opt-in live affinity (`live_update_enabled` default off) at pin-safe boundaries (break / saar_idle_reopen) with 25% hysteresis + swap cap + heat decay.
- Config: `workload_heat` optional section in OperatorConfigSchema + DEFAULT_WORKLOAD_HEAT_CONFIG; no frugality or release-gate changes.
- Pipeline wiring (passing resolved affinity into selectTierByExpectedCost) intentionally out of scope — SP-217 owns router-pipeline.ts this wave; the API is ready (`resolveAffinity` → `ExpectedCostHeatBias`).
- Plan reviews at step checkpoints: skipped in-worker per SP-195 (engine-owned after .DONE).
