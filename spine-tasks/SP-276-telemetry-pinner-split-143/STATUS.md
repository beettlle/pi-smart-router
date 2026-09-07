# SP-276 — Split routing-telemetry / touch session-pinner as needed for ports. — Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-09-07
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Measure routing-telemetry.ts / session-pinner.ts sizes
- [x] List remaining #143 checkboxes

## Step 1: Split / finish ports leftovers

**Status:** Complete

- [x] Bounded telemetry builders as needed
- [x] Minimal pinner touch

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |
| 2026-09-07 | Plan review Step 1 | skipped (engine-run, SP-195) |
| 2026-09-07 | Plan review Step 2 | skipped (engine-run, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-07 | Sizes: routing-telemetry.ts = 1214 lines (was 1516 pre-SP-275), session-pinner.ts = 976 lines. SP-272–275 already landed PipelineStage/RoutingContext, per-stage modules, and HardwareProbe/LocalRuntime/TelemetryEmitter ports. Remaining #143 checkboxes for SP-276: the two sub-tasks (telemetry bounded split, pinner touch). Phased-PR-plan checkbox is process-level (operator closes issue). | Scoped Step 1 |
| 2026-09-07 | Port-inversion leftovers: domain→infra imports of `resolveFrugalityCostPer1M` (infrastructure/pricing/price-broker) remain in `domain/pinning/session-pinner.ts` and `domain/routing/expected-cost.ts`. Both call sites are pure functions over domain types — invert by moving pure price resolution to `domain/pricing/price-resolution.ts` with infra re-export (SP-275 pattern). | Step 1 pinner touch |


## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-07 | Step 0 complete | Preflight measurements + #143 checkbox inventory; plan: split routing-telemetry.ts into pin-economics / planning-delegate / scalar-fields / decision-log builders + slim emitter façade; move pure price resolution to domain |
| 2026-09-07 | Step 1 complete | Files split: routing-telemetry.ts 1214→387 (emitter + façade re-exports) + new bounded builders pin-economics-telemetry.ts (353), planning-delegate-telemetry.ts (101), telemetry-scalar-fields.ts (278), routing-decision-log.ts (262). Port leftover: pure price resolution moved to domain/pricing/price-resolution.ts (84); price-broker.ts re-exports (194→137); session-pinner.ts + expected-cost.ts now import domain→domain. Domain has zero infrastructure imports. |
| 2026-09-07 | Step 2 complete | Contract testCommand green: tsc --noEmit clean; vitest 137 files / 2171 tests passed; coverage:check exit 0. detect_changes(unstaged): 1 file (STATUS.md), 0 symbols, risk low. |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
