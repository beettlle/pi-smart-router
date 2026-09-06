# SP-272 — Introduce PipelineStage interface and shared RoutingContext. — Status

**Current Step:** 2
**Status:** Complete
**Last Updated:** 2026-09-06
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Map current stage order in router-pipeline.ts
- [x] Draft RoutingContext fields

**Stage order (from `PIPELINE_STAGE_ORDER`, SP-119):** hardware_probe → loop_escalation → turn_envelope → context_fit → low_intensity → session_pin → triage → local_zero → triage_cloud_fallback → hydra_match → safe_default → context_overflow_fallback.

**Per-route shared state (RoutingContext fields, mirrors RouterPipeline `current*` members):** request, options, fleet (active, narrowable), fullFleet, hardwareResult, triageResult, hydraResult, clusterMatch, tierHint(+reasonCode), lowIntensityScore, pSuccessCheap/Raw/Calibrated/Alpha, expectedCostByTier, localEligibleReason, contextFitRejected(+viableCount), contextOverflowTriggered(+preferredProvider), breakevenReason, planningDelegate, localZeroGateSkipReasons, routePath(+confidence), prewarmOutcome.

**Impact (grep-based; gitnexus impact tool truncated target param — see Discoveries):**
- `PipelineStage` (existing fn-type alias): referenced only inside `router-pipeline.ts` (`NamedPipelineStage.run`); no imports in src/tests/bin/extensions → LOW risk to replace with interface re-export.
- `hardwareProbeStage` (thin-wrap target): private, only referenced in constructor stage list → LOW risk.

## Step 1: Add stage + context types

**Status:** Complete

- [x] Implement PipelineStage + RoutingContext
- [x] Minimal compile proof

**Implementation:**
- New `src/domain/pipeline/pipeline-stage.ts`: `RoutingContext` (shared per-route state mirroring the orchestrator's `current*` fields) + `PipelineStage` interface (`name` + `run(context)`). Type-only imports — no runtime cycle with router-pipeline.
- `router-pipeline.ts`: re-exports `PipelineStage`/`RoutingContext` (replaces the old fn-type alias, which had no external importers); `hardware_probe` thin-wrapped through the interface via `hardwareProbePipelineStage` + `buildRoutingContext()` snapshot with write-back of `hardwareResult`. No behavior change.
- `tests/unit/pipeline-stage.test.ts`: contract tests (decide/continue, shared mutation, fleet narrowing) + thin-wrap proof (provider invoked, zero-crash fallback intact).
- Plan review Step 1: engine-skipped (SP-195), not a spawn failure.

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green
- [x] coverage:check if app code changed

**Evidence:**
- `npm run typecheck` — green (tsc --noEmit, strict + exactOptionalPropertyTypes).
- `npm test` — 122 files, 2169 tests, all pass.
- `npm run coverage:check` (testWithCoverage) — exit 0, thresholds pass.
- `gitnexus detect_changes` — risk_level low, no unexpected affected processes.

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-06 | 1 | plan | skipped (engine-owned per SP-195; not a spawn failure) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | gitnexus_context/impact MCP tools truncate the `name`/`target` parameter to its first character (sent `hardwareProbeStage`, received `h`) | Used repo-wide grep instead: `PipelineStage` alias and `hardwareProbeStage` have no external callers — LOW blast radius |
| 2026-09-06 | Manifest: SP-273/SP-274 extract stage clusters behind the context; SP-275 inverts ports | RoutingContext must expose full per-route state so later packets can migrate stages without redesign |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | Stage order + context fields mapped; grep-based impact LOW |
| 2026-09-06 | Step 1 complete | pipeline-stage.ts added; hardware_probe wrapped; typecheck + 90 targeted tests green |
| 2026-09-06 | Step 2 complete | Full suite 2169/2169 green; coverage:check exit 0; detect_changes low risk |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
