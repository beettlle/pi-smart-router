# SP-274 — Extract remaining stages and shrink RouterPipeline orchestrator. — Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-09-06
**Review Level:** 2
**Review Counter:** 3
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

**Status:** Complete

- [x] Move remaining stages
- [x] Keep orchestrator as thin coordinator

**Implementation:**
- New `hardware-probe-stage.ts` (`createHardwareProbeStage`), `context-fit-stage.ts` (`createContextFitStage`), `turn-envelope-stage.ts` (`createTurnEnvelopeStage` — SAAR planning deferral/buffer, pin-breakeven, planning-delegate SP-143 + direct-frontier observability, `resolveBreakevenContext`), `low-intensity-stage.ts` (`createLowIntensityStage` — lazy P(success) weights + isotonic calibrator caches in factory closure, expected-cost tier hint SP-149, SMART_ROUTER_LOG_ROUTING explain), `local-zero-stage.ts` (`createLocalZeroStage` — eligibility/capability/throughput gates + speculative prewarm SP-217 with session-scoped guard in factory closure), `safe-default-stage.ts` (`createSafeDefaultStage` + shared `buildSafeDefaultFallbackDecision`), `context-overflow-fallback-stage.ts` (`createContextOverflowFallbackStage` + shared `shouldAttemptContextOverflowFallback` / `buildContextOverflowFallbackDecision`).
- Orchestrator: 1651 → **795 lines** (target ≤800 met); all pipeline files ≤312 lines except orchestrator. All 12 stages now behind PipelineStage + RoutingContext (SP-272 contract) via `runStageWithContext()` snapshot/sync-back; thin wrappers keep pre-extraction method names (SP-071 prototype-spy compatibility). Telemetry/feature attachment, single-flight serialization (SP-230), fallback error path (delegating to shared builders), and pin persistence stay in the orchestrator.
- Public API unchanged: `RouterPipeline`, `PipelineOptions`, `StageResult`, `PIPELINE_STAGE_ORDER`, stage-helpers re-exports, `PipelineStage`/`RoutingContext` re-export — verified no external consumer changes needed.
- typecheck clean; 122 files / 2169 tests green (identical count to SP-273 baseline — behavior preserved). gitnexus detect_changes: touched symbols confined to must-change `router-pipeline.ts`; flag on routing-core centrality (ContextOverflowFallback/SafeDefault processes) — all affected flows covered by the passing suite.

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green
- [x] npm run coverage:check

**Evidence:** `npm run typecheck && npm test` → tsc clean, 122 files / 2169 tests passed, CONTRACT_EXIT=0 (identical test count to SP-273 baseline — behavior preserved). `npm run coverage:check` → exit 0 (combined gate green); `src/domain/pipeline` dir 92.68% lines (up from 92.37% at SP-273), `router-pipeline.ts` 93.69% lines; new modules: context-fit 100%, context-overflow-fallback 100%, hardware-probe 100%, safe-default-stage 98.21%, local-zero 96.81%, low-intensity 96.15%, turn-envelope 92.95% — all ≥77% threshold.

## Completion Criteria

- [x] Remaining stages extracted; orchestrator shrunk; Partial #143

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-06 | 0 | plan | skipped — engine runs reviews after .DONE (SP-195) |
| 2026-09-06 | 1 | plan | skipped — engine runs reviews after .DONE (SP-195) |
| 2026-09-06 | 2 | plan | skipped — engine runs reviews after .DONE (SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | No `scripts/worker-verify.sh` in this repo; used the contract testCommand directly (typecheck && test) | None — evidence captured in Step 2 |
| 2026-09-06 | gitnexus index predates the new SP-274 modules (e.g. shows `markContextOverflowFromPin` under router-pipeline); the HIGH risk heuristic on routing-core centrality is index-staleness + centrality, not a regression signal — detect_changes confirmed confinement to the must-change file and the full suite is green | Operator may run `/gitnexus analyze` post-merge to refresh |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Task started | Resumed from clean tree; SP-273 merged; reading pipeline state |
| 2026-09-06 | Step 0 complete | Remaining stages listed; seams + sizing planned |
| 2026-09-06 | Step 1 complete | 7 stage modules extracted; orchestrator 1651→795 lines; 2169 tests green |
| 2026-09-06 | Step 2 complete | Contract testCommand + coverage:check green; all criteria met |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
