# SP-275 — Define infra ports and invert domain→infra coupling. — Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-09-07
**Review Level:** 2
**Review Counter:** 2
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

**Status:** Complete

- [x] Add port interfaces
- [x] Wire adapters; remove concrete imports from domain

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green
- [x] npm run coverage:check

**Evidence (2026-09-06):** `npm run typecheck` clean; `npm test` 126 files / 2169 tests passed (0 failed); `npm run coverage:check` exit 0 — All files 91.58% lines / 87.83% branches / 96.55% functions (thresholds 80). New port modules: hardware-probe-port 100%, local-runtime-port 93.02%, telemetry-emitter-port 95.25% lines.

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-07 | 0 | plan | APPROVE (0-20260907T025012) |
| 2026-09-07 | — | code | REVISE → fixed (2-20260907T163428): removed unused `RoutePath` import in `src/infrastructure/telemetry/routing-telemetry.ts`; lint/typecheck/tests/coverage re-verified green |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | `src/domain/pinning/session-pinner.ts` + `src/domain/routing/expected-cost.ts` import `infrastructure/pricing/price-broker` — pricing port not among the three named ports (Partial #143; future packet). | Left as-is; outside File Scope |
| 2026-09-06 | `estimateRoutingCost` (3-arg domain call) embeds wall-clock peak-pricing bias via `resolveFrugalityCostPer1M` — not safely re-implementable in domain. | Injected via optional `PipelineOptions.costEstimator`; default wired in `GatewayDispatch` (documented seam, not a 4th named port) |
| 2026-09-06 | Reason-code constants (`LOCAL_ZERO_DISABLED` etc.) are domain vocabulary written into decisions by domain stages. | Moved to `domain/ports/telemetry-emitter-port.ts`; infra re-exports for compat |
| 2026-09-06 | GitNexus impact on `RouterPipeline` (upstream d2): MEDIUM — 3 production importers (index.ts, gateway-dispatch, router-explain) | Public API preserved: options fields only added/re-typed structurally; no caller breakage expected |
| 2026-09-06 | GitNexus impact on `withEstimatedCost` (upstream): HIGH (5 direct callers) — index stale (symbol moved to stage-helpers.ts in SP-273/274) | All 5 callers updated in the same change (session-pin ×4, turn-envelope ×2, hydra-match ×2, context-overflow-fallback ×1); GatewayDispatch wires the identical default estimator; full suite green |
| 2026-09-06 | DESIGN AMENDMENT vs Step-0 sketch: `enrichRoutingDecisionWithContextFit/WithTierSelection` + their pure builder chains MOVED into `domain/ports/telemetry-emitter-port.ts` instead of a `DecisionEnricher` options seam | Closure audit showed zero infra deps (domain types + `config/` loader constants only, and domain→config imports have precedent) — moving is the correct hexagonal direction, avoids permanent indirection and test churn; infra re-exports keep paths stable |
| 2026-09-06 | Direct `new RouterPipeline()` without `costEstimator` yields decisions without `estimated_cost_usd` (production unaffected: GatewayDispatch is the only production constructor and wires `defaultRoutingCostEstimator`) | 4 SP-085 tests updated to inject `costEstimator: defaultRoutingCostEstimator` — demonstrates the seam |
| 2026-09-06 | Domain default `defaultLocalRuntimePort` fails closed (no transport → `available:false`); infra `nodeLocalRuntimePort` binds Node global fetch | GatewayDispatch wires the infra adapter — production behavior unchanged (fail-open ping semantics preserved via ping-internal catch) |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | Inventory of 11 domain→infra import sites recorded; 3 port files named; pricing coupling documented out of scope |
| 2026-09-06 | Step 0 plan review | Engine-deferred (SP-195): batch engine runs reviews after .DONE; worker proceeded per real-pi standing orders |
| 2026-09-06 | Step 1 implemented | 3 domain port modules (`hardware-probe-port`, `local-runtime-port`, `telemetry-emitter-port`); 7 pipeline files re-import from ports; 4 infra modules re-export domain symbols; GatewayDispatch wires `costEstimator` + `localRuntime` defaults; index.ts exports port types; typecheck + 2169/2169 tests green; detect_changes: medium, expected modules only |
| 2026-09-07 | Code review REVISE addressed | Removed unused `RoutePath` import (routing-telemetry.ts:23) flagged by engine code review; `npm run lint` green; typecheck clean; 2169/2169 tests green; coverage 91.58% exit 0; detect_changes: low, 0 changed symbols |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
