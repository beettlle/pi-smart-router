# SP-277 — Fragment router-pipeline.test.ts into stage-focused modules (wave 1). — Status

**Current Step:** 0
**Status:** In Progress
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** In Progress

- [x] Map describe blocks to stage modules
- [x] Choose first extract set

### Describe-block → stage-module map (SP-273 alignment)

| describe block (line) | stage module | wave |
|---|---|---|
| pipeline stage order (SP-119), stage chain with placeholders, StageResult type contract, pipeline error telemetry (SP-053), dataset feature sidecar (SP-057), context-fit gate (SP-093), context overflow fallback (SP-095), local_zero throughput gate (SP-164), concurrent route() safety (SP-230) | router-pipeline.ts (orchestrator) | W2 (SP-278) |
| safe default fallback on failure (99–136) | safe-default.ts | **W1** |
| session pin integration (FR-006/7/8, 152–454) + loop escalation integration (FR-014, 540–695) | session-pin-stage.ts | **W1** |
| fail_closed_on_missing_weights sandwich (SP-252, 771–857) | hydra-match-stage.ts | **W1** |
| resolveLocalEligible (SP-111, 1650–1715) + estimateCheapToolUseRequirement (SP-177, 1716–1733) | stage-helpers.ts | **W1** |
| gemini deprioritization (SP-080), cost-aware turn envelope (SP-085), estimated_cost_usd telemetry (SP-085), low_intensity tier gate (SP-103) | stage-helpers via pipeline | W2 |
| P(success) inference/calibration/expected-cost (SP-105/106/133/223) | p-success/isotonic (not stage modules) | W2 |

### Wave-1 extract set (~660 of 2206 lines, ~30%)

1. `tests/unit/router-pipeline-fixtures.ts` — shared makeModel/makeRequest/fleet/UNTRAINED_P_SUCCESS_WEIGHTS/HARDWARE_CONFIG (imported by new files + monolith)
2. `tests/unit/router-pipeline-safe-default.test.ts` ← “safe default fallback on failure”
3. `tests/unit/router-pipeline-session-pin.test.ts` ← “session pin integration” + “loop escalation integration”
4. `tests/unit/router-pipeline-hydra-match.test.ts` ← “fail_closed_on_missing_weights sandwich integration”
5. `tests/unit/router-pipeline-stage-helpers.test.ts` ← “resolveLocalEligible” + “estimateCheapToolUseRequirement”

Monolith keeps remaining ~1540 lines for SP-278 (wave 2) — not deleted per Do-NOT.

## Step 1: Extract wave-1 tests

**Status:** Not Started

- [ ] Move suites to stage-focused files
- [ ] Share fixtures helpers if needed

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green

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
| 2026-09-06 | Step 0 complete | Mapped 22 describe blocks to SP-273 stage modules; chose 4-file wave-1 extract set + shared fixtures |
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
