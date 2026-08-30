# SP-242: Calibrate cost estimates from rolling usage actuals — Status

**Current Step:** 1
**Status:** Pending
**Last Updated:** 2026-08-30
**Review Level:** 1
**Size:** S

---

## Step 1: Rolling calibration prior

**Status:** Pending

- [ ] Persist/update per-model or per-tier rolling ratio from recorded actuals vs estimates
- [ ] Apply soft bias in `estimateRoutingCost` / expected-cost path; cold → catalog
- [ ] Optional log line under `SMART_ROUTER_LOG_ROUTING` for applied ratio

## Step 2: Testing and verification

**Status:** Pending

- [ ] Unit tests: warm bias changes estimate; cold unchanged; fail open
- [ ] Contract `testCommand` green
- [ ] README economics/stats section updated

## Completion Criteria

- [ ] Calibration soft-bias implemented with cold degrade
- [ ] Tests + README done
- [ ] #164 closable (with SP-241)

## Discoveries

- 2026-08-30: Preflight redirected fileScopeMustChange from routing-telemetry.ts (pre-landed by SP-241) to expected-cost.ts — see PROMPT Amendments.
