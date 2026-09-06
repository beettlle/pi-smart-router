# SP-273 — Extract first stage cluster behind RoutingContext. — Status

**Current Step:** 2
**Status:** Complete
**Last Updated:** 2026-09-06
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Choose first cluster seams; list target files in STATUS

**First cluster seams (manifest: triage / pin / hydra; SP-274 takes the rest):**
- **triage cluster** → new `src/domain/pipeline/triage-stage.ts`: `createTriageStage()` (`triage`) + `createTriageCloudFallbackStage()` (`triage_cloud_fallback`).
- **pin cluster** → new `src/domain/pipeline/session-pin-stage.ts`: `createSessionPinStage()` (`session_pin`) + `createLoopEscalationStage()` (`loop_escalation` — mutates pin state, part of the pin seam, extraction is trivial).
- **hydra cluster** → new `src/domain/pipeline/hydra-match-stage.ts`: `createHydraMatchStage()` (`hydra_match` + degraded-sandwich failover + learned-route recording).
- **shared helpers** → new `src/domain/pipeline/stage-helpers.ts`: `TURN_TIER_MAP`, `withEstimatedCost`, `redactPromptFromError`, `isPinOnlyFallbackActive`, `enrichRequestWithSaarCandidate`, `constrainFleetToTierHint`, plus relocated pure gates `resolveLocalEligible` / `estimateCheapToolUseRequirement` / `resolveLocalZeroToolUseCeiling` (needed by both hydra module and the not-yet-extracted local_zero stage). Re-exported from `router-pipeline.ts` so all existing import paths (tests, src/index.ts) stay unchanged.
- **orchestrator** (`router-pipeline.ts`, may-change): stage list wires extracted stages through a generic `runStageWithContext()` snapshot/sync-back helper (extends the SP-272 hardware_probe pattern); telemetry/finalize/attachFeatures stay in the orchestrator.
- Deferred to SP-274: turn_envelope, context_fit, low_intensity, local_zero, safe_default, context_overflow_fallback.
- GitNexus impact on `sessionPin`/`hydraMatcher`: LOW (private, 0 external callers). No behavior change; route outcomes untouched.

## Step 1: Extract stages

**Status:** Complete

- [x] Move logic to modules; wire orchestrator
- [x] Preserve telemetry hooks

**Implementation:**
- New `stage-helpers.ts`: pure helpers shared by extracted stages and remaining inline stages (`TURN_TIER_MAP`, `withEstimatedCost`, `redactPromptFromError`, `isPinOnlyFallbackActive`, `enrichRequestWithSaarCandidate`, `constrainFleetToTierHint`) + relocated gates `resolveLocalEligible` / `estimateCheapToolUseRequirement` / `resolveLocalZeroToolUseCeiling` (re-exported from router-pipeline.ts — no test/import changes needed).
- New `triage-stage.ts`: `createTriageStage()` + `createTriageCloudFallbackStage()`.
- New `session-pin-stage.ts`: `createSessionPinStage()` (use_pin / saar_route / sub_route / force_rejected / break / no_pin) + `createLoopEscalationStage()`; context-overflow pin markers written to context.
- New `hydra-match-stage.ts`: `createHydraMatchStage()` + degraded sandwich (learned → pattern → safe default; SP-212/#119, SP-252/#148 fail-closed) + learned-route recording.
- Orchestrator: generic `runStageWithContext()` (snapshot → run → `syncRoutingContext()` write-back, extends SP-272 hardware_probe pattern); thin private wrappers keep pre-extraction method names so SP-071 prototype spies pass unchanged. Telemetry (`emitTelemetry`, `attachFeatures`, `finalizeRoute`, pipeline-error telemetry) untouched in orchestrator — hooks preserved.
- typecheck clean; 122 files / 2169 tests green. gitnexus detect_changes: touched symbols confined to must-change file; affected flows all covered by suite.

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green
- [x] npm run coverage:check

**Evidence:** `npm run typecheck && npm test` → tsc clean, 122 files / 2169 tests passed. `npm run coverage:check` → exit 0 (combined gate green; domain/pipeline dir 92.37% lines).

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | Extracted `session-pin-stage.ts` shows 71.13% line coverage; baseline diff shows the same arms (`saar_route`, `sub_route`, force_rejected-no-fallback) were already uncovered pre-refactor (HEAD~1 router-pipeline.ts lines 1235–1268, 1298–1306 uncovered). No coverage regression — extraction preserved the exact profile; combined coverage gate passes. | Recommend SP-277/SP-278 (test fragmentation) or a follow-up add pipeline-level tests for the saar_route / sub_route decision arms; out of SP-273 test scope ("minimal import path fixes"). |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | First cluster = triage / pin(+loop_escalation) / hydra; 4 new modules under src/domain/pipeline/; re-exports keep import paths stable |
| 2026-09-06 | Step 1 complete | 4 new modules (stage-helpers, triage-stage, session-pin-stage, hydra-match-stage); orchestrator wires extracted stages via runStageWithContext; tests green |
| 2026-09-06 | Step 2 complete | typecheck + 2169 tests green; coverage:check exit 0; all completion criteria met |
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
