# SP-177: Local Zero Tool-Use Gate — Status

**Current Step:** 1
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Pre-local_zero capability estimate + skip

**Status:** 🔄 In Progress

- [x] Cheap tool-use / capability estimate before local_zero dispatch
- [x] Skip when predicted need exceeds local capability or configured max
- [x] Record telemetry skip reason

## Step 2: Operator config + tests

**Status:** ⬜ Not Started

- [x] Operator knobs with safe defaults
- [x] Document in operator-config example (+ README if needed)
- [x] Agentic turn-1 tests; trivial path still eligible under threshold

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Run scoped vitest
- [ ] Run full `npm test`
- [ ] Run coverage gate

---

## Completion Criteria

- [x] Pre-local_zero heuristic/estimate for likely tool use
- [x] Skip when predicted need exceeds local capability or configured max
- [x] Operator config knobs present with safe defaults
- [x] Telemetry reason when skipped
- [x] Agentic turn-1 with local ready does not win local_zero

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; spawnFailed=false) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Impact on `localZeroTierStage` / `resolveLocalEligible` / `buildLocalZeroSkipReasons`: LOW risk | Safe to edit |
| 2026-07-10 | Extension wiring of new knobs is out of File Scope; expose via `PipelineOptions.localZeroConfig` + operator schema/defaults | Later wiring outside SP-177 |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 started | Plan review skipped by engine |
| 2026-07-10 | Step 1 outcomes | estimateCheapToolUseRequirement + gate + telemetry; scoped tests 109 passed |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Gate: `predicted > min(local.tool_use, max_tool_use_requirement)` → skip with `tool_use_capability_shortfall`. Defaults: `enabled: true`, `max_tool_use_requirement: 0.25`.
