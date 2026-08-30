# SP-242: Calibrate cost estimates from rolling usage actuals — Status

**Current Step:** 2
**Status:** In progress
**Last Updated:** 2026-08-30
**Review Level:** 1
**Size:** S

---

## Step 1: Rolling calibration prior

**Status:** Complete (review deferred to engine — in-worker spawn skipped per SP-195)

- [x] Persist/update per-model or per-tier rolling ratio from recorded actuals vs estimates — `buildCostCalibrationPrior` derives per-model + per-tier mean actual/estimate ratios over the rolling telemetry window (SP-241 rows persist via sqlite `updateTelemetryUsageActuals`); warmup-gated (`minSamples`), per-pair outlier clamp, aggregate soft clamp [0.5, 2.0]
- [x] Apply soft bias in `estimateRoutingCost` / expected-cost path; cold → catalog — `estimateRoutingCost` optional 4th param; `resolveTierVirtualCost` calibrates base per-1M before the v2 λ/premium/KV chain (single application point); `selectTierByExpectedCost.costCalibration` threads it; `computeExpectedCost` annotates `calibrationRatio`
- [x] Optional log line under `SMART_ROUTER_LOG_ROUTING` for applied ratio — rationale note `[cost-calib ×N.NN from rolling actuals (SP-242)]` flows through the pipeline's expected-cost explain (already gated on `SMART_ROUTER_LOG_ROUTING`; pipeline untouched)

Bonus surface: `aggregateSessionStats` snapshot gains `cost_calibration` buckets (omitted when cold, fail-closed like `frontier_savings_usd`).

## Step 2: Testing and verification

**Status:** In progress

- [x] Unit tests: warm bias changes estimate; cold unchanged; fail open — 16 new tests across `expected-cost.test.ts` (prior builder, ratio resolution, tier resolution bias, selection flip + `calibrationApplied` + rationale note, cold fail-open, no double-apply), `routing-telemetry.test.ts` (estimateRoutingCost 4-arg soft bias, tier fallback, cold), `session-stats.test.ts` (cost_calibration buckets, cold omission, privacy assert)
- [x] Contract `testCommand` green — typecheck clean; contract files 105/105; full suite 117 files / 2023 tests passed
- [x] README economics/stats section updated — new "Usage actuals" + "Rolling cost calibration (v0.20.0)" economics subsections; `/smart-router stats` row updated (JSON snapshot surface, honest about text output)

## Completion Criteria

- [ ] Calibration soft-bias implemented with cold degrade
- [ ] Tests + README done
- [ ] #164 closable (with SP-241)

## Discoveries

- 2026-08-30: Preflight redirected fileScopeMustChange from routing-telemetry.ts (pre-landed by SP-241) to expected-cost.ts — see PROMPT Amendments.
- 2026-08-30: Impact analysis — `estimateRoutingCost` HIGH (direct caller `RouterPipeline.withEstimatedCost`, must-not-change file) → calibration added as optional 4th param, no-op default; `selectTierByExpectedCost` / `aggregateSessionStats` LOW. Single application point in `resolveTierVirtualCost` (calibrated base before virtual-cost v2) to avoid double-apply via explicit `costPer1M`.
- 2026-08-30: `router-pipeline.ts` must-not-change means live wiring of the prior into pipeline options is out of scope — same delivery pattern as SP-215 `heatBias` (domain-level optional input + estimateRoutingCost param + stats surface). Rolling persistence = telemetry rows themselves (SP-241 sqlite `updateTelemetryUsageActuals`); prior computed on demand over the rolling window.
