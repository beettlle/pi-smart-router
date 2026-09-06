# SP-275 — Define infra ports and invert domain→infra coupling. — Status

**Current Step:** 0
**Status:** In Progress
**Last Updated:** 2026-09-06
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Inventory domain→infra imports
- [x] Name port files

**Inventory (domain→infra, non-test):**

| Domain file | Infra module | Symbols |
|---|---|---|
| pipeline/router-pipeline.ts | hardware/hardware-probe | `HardwareProbeConfig`, `HardwareProbeResult`, `SystemInfo` (types) |
| pipeline/router-pipeline.ts | hardware/throughput-meter | `ThroughputMeter` (type) |
| pipeline/router-pipeline.ts | local/local-zero-tier | `HttpFetchPort`, `LocalZeroTierConfig` (types) |
| pipeline/router-pipeline.ts + local-zero-stage | telemetry/routing-telemetry | `RoutingTelemetryEmitter` (class), `LOCAL_ZERO_DISABLED`, `TOOL_USE_CAPABILITY_SHORTFALL`, `enrichRoutingDecisionWithContextFit/WithTierSelection` |
| pipeline/hardware-probe-stage.ts | hardware/hardware-probe | `probeHardware` (pure fn) |
| pipeline/local-zero-stage.ts | local/local-zero-tier | `pingLocalServices`, `LocalReadinessResult` |
| pipeline/local-zero-stage.ts | telemetry/routing-telemetry | `LOCAL_ZERO_DISABLED`, `THROUGHPUT_BELOW_THRESHOLD`, `TOOL_USE_CAPABILITY_SHORTFALL` |
| pipeline/turn-envelope-stage.ts | telemetry/routing-telemetry | `createPlanningDelegateObservability`, `PLANNING_DELEGATE`, `PLANNING_DELEGATE_DISABLED`, `PLANNING_DIRECT_FRONTIER` |
| pipeline/stage-helpers.ts | telemetry/routing-telemetry | `estimateRoutingCost` |
| pipeline/pipeline-stage.ts | hardware/hardware-probe | `HardwareProbeResult` (type) |
| pinning/session-pinner.ts, routing/expected-cost.ts | pricing/price-broker | `resolveFrugalityCostPer1M` — **out of scope** (pricing port is not one of the three named ports; pre-existing partial #143 coupling) |

**Port file names:**

- `src/domain/ports/hardware-probe-port.ts` — `HardwareProbePort` + moved pure types/kernel (`HardwareProbeResult`, `HardwareProbeConfig`, `SystemInfo`, `SystemInfoPort`, `ThroughputMeter` + throughput type surface)
- `src/domain/ports/local-runtime-port.ts` — `LocalRuntimePort` + moved types/kernel (`ServicePingResult`, `LocalReadinessResult`, `LocalZeroTierConfig`, `HttpFetchPort`, `pingLocalServices` pure orchestration)
- `src/domain/ports/telemetry-emitter-port.ts` — `TelemetryEmitterPort` + moved reason-code constants, `createPlanningDelegateObservability`, `RoutePathTelemetryExtras`, `PeakPricingTelemetryFields`, and function seams for infra-backed helpers (`RoutingCostEstimator`, `DecisionEnricher`)

Design notes:
- Pure kernels (`probeHardware`, `pingLocalServices` orchestration) move into domain port modules; impure adapters (OS readers, default fetch binding) stay in infrastructure, re-exported for import-path stability.
- `estimateRoutingCost` cannot move (depends on infra pricing + wall-clock peak bias — pricing inversion is a separate #143 phase); domain consumes it via optional `PipelineOptions.costEstimator` seam, default wired in the composition root (`GatewayDispatch`).
- `enrichRoutingDecisionWithContextFit/WithTierSelection` stay infra (deep builder chains); consumed via optional `PipelineOptions.decisionEnricher` seam, default wired in `GatewayDispatch`.

## Step 1: Ports + adapters

**Status:** Not Started

- [ ] Add port interfaces
- [ ] Wire adapters; remove concrete imports from domain

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green
- [ ] npm run coverage:check

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | `src/domain/pinning/session-pinner.ts` + `src/domain/routing/expected-cost.ts` import `infrastructure/pricing/price-broker` — pricing port not among the three named ports (Partial #143; future packet). | Left as-is; outside File Scope |
| 2026-09-06 | `estimateRoutingCost` (3-arg domain call) embeds wall-clock peak-pricing bias via `resolveFrugalityCostPer1M` — not safely re-implementable in domain. | Injected via optional `PipelineOptions.costEstimator`; default wired in `GatewayDispatch` (documented seam, not a 4th named port) |
| 2026-09-06 | Reason-code constants (`LOCAL_ZERO_DISABLED` etc.) are domain vocabulary written into decisions by domain stages. | Moved to `domain/ports/telemetry-emitter-port.ts`; infra re-exports for compat |
| 2026-09-06 | GitNexus impact on `RouterPipeline` (upstream d2): MEDIUM — 3 production importers (index.ts, gateway-dispatch, router-explain) | Public API preserved: options fields only added/re-typed structurally; no caller breakage expected |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | Inventory of 11 domain→infra import sites recorded; 3 port files named; pricing coupling documented out of scope |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
