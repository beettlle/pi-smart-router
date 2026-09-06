# SP-274 — Extract remaining stages and shrink RouterPipeline orchestrator. — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-09-06
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] List remaining stages in STATUS

**Remaining inline stages in `router-pipeline.ts` (1651 lines) → target modules (SP-273 deferred these to SP-274):**

1. **turn_envelope** → new `src/domain/pipeline/turn-envelope-stage.ts`: `createTurnEnvelopeStage()` — turn-type tier bias, SAAR planning deferral/buffer, pin-breakeven gate (`evaluateModelSwitchBreakeven` + `resolveBreakevenContext`), planning-delegate path (SP-143) + direct-frontier observability.
2. **context_fit** → new `src/domain/pipeline/context-fit-stage.ts`: `createContextFitStage()` — fleet narrowing via `filterFleetByContextFit`, records rejected/viable counts.
3. **low_intensity** → new `src/domain/pipeline/low-intensity-stage.ts`: `createLowIntensityStage()` — triage+cluster scoring, P(success) raw/calibrated (lazy weights + isotonic calibrator caches in factory closure, per-pipeline-instance), expected-cost tier hint (SP-149), SMART_ROUTER_LOG_ROUTING explain, structural tier-hint resolution.
4. **local_zero** → new `src/domain/pipeline/local-zero-stage.ts`: `createLocalZeroStage()` — eligibility gates, capability ceiling (#98), throughput gate (#84), speculative prewarm (SP-217, guard instance spans routes → factory closure), readiness ping.
5. **safe_default** → new `src/domain/pipeline/safe-default-stage.ts`: `createSafeDefaultStage()` + exported `buildSafeDefaultFallbackDecision()` shared with the orchestrator error path.
6. **context_overflow_fallback** → new `src/domain/pipeline/context-overflow-fallback-stage.ts`: `createContextOverflowFallbackStage()` + exported `shouldAttemptContextOverflowFallback()` / `buildContextOverflowFallbackDecision()` shared with the orchestrator error path (`buildFallbackDecision` stays as thin error-path coordinator).
7. **hardware_probe** → new `src/domain/pipeline/hardware-probe-stage.ts`: `createHardwareProbeStage()` — the SP-272 inline `PipelineStage` moves out of the orchestrator class body.

**Stays in orchestrator (thin coordinator):** stage wiring, `route`/`routeExclusive` single-flight (SP-230), `prioritizeFleetForToolHistory`, `buildRoutingContext`/`syncRoutingContext`/`runStageWithContext` seam, telemetry/feature attachment (`attachFeatures`, `attachLocalZeroGateSkipReasons`, `mergeFeatureCandidates`, `emitTelemetry`, `resolveRoutePathTelemetry`, pipeline-error telemetry), fallback decision error path, pin persistence/finalize. Thin private wrappers keep pre-extraction method names (SP-273 pattern; SP-071 prototype-spy compatibility).

**Sizing:** orchestrator 1651 → ~750 lines; all modules ≤ ~350 lines (target: no pipeline file ≫800 lines).
**Impact analysis:** `RouterPipeline` MEDIUM (public API consumed by GatewayDispatch/src/index.ts/router-explain.ts — unchanged; behavior-preserving). `turnEnvelope` and other private stage methods: LOW, 0 external callers.

## Step 1: Extract + shrink

**Status:** Not Started

- [ ] Move remaining stages
- [ ] Keep orchestrator as thin coordinator

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
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Task started | Resumed from clean tree; SP-273 merged; reading pipeline state |
| 2026-09-06 | Step 0 complete | Remaining stages listed; seams + sizing planned |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
