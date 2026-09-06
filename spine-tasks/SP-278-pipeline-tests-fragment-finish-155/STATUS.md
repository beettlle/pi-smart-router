# SP-278 — Finish test fragmentation and retire monolithic router-pipeline.test.ts. — Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] List remaining monolith suites

### Remaining monolith inventory (tests/unit/router-pipeline.test.ts, 1522 lines, 52 its, 16 describes)

| describe block (line) | its | src alignment | wave-2 target file |
|---|---|---|---|
| pipeline stage order (SP-119) / stage chain with placeholders / StageResult type contract | 4 | router-pipeline.ts | router-pipeline-stage-order.test.ts |
| pipeline error telemetry (SP-053) | 3 | router-pipeline.ts error path | router-pipeline-error-telemetry.test.ts |
| dataset feature sidecar (SP-057) | 4 | router-pipeline.ts features plumbing | router-pipeline-feature-sidecar.test.ts |
| gemini deprioritization (SP-080/129) | 4 | tool-history-guard via pipeline | router-pipeline-gemini-deprioritization.test.ts |
| cost-aware turn envelope selection (SP-085) | 2 | turn-envelope-stage.ts | router-pipeline-turn-envelope.test.ts |
| estimated_cost_usd telemetry (SP-085) | 4 | turn-envelope-stage.ts + pipeline | router-pipeline-cost-telemetry.test.ts |
| context-fit gate (SP-093) + context overflow fallback (SP-095) | 7 | context-fit-stage.ts + context-overflow-fallback-stage.ts | router-pipeline-context-fit.test.ts |
| low_intensity tier gate (SP-103) | 8 | low-intensity-stage.ts | router-pipeline-low-intensity.test.ts |
| local_zero throughput gate (SP-164) | 3 | local-zero-stage.ts | router-pipeline-local-zero-throughput.test.ts |
| P(success) online inference (SP-105) incl. nested SP-223 gate | 7 | p-success-classifier.ts via pipeline | router-pipeline-p-success.test.ts |
| isotonic calibration (SP-133) + expected-cost tier selection (SP-106) | 4 | isotonic-calibrator.ts / expected-cost.ts | router-pipeline-expected-cost.test.ts |
| concurrent route() safety (SP-230, #141) | 2 | router-pipeline.ts route() serialization | router-pipeline-concurrent-route.test.ts |

Shared helpers move to router-pipeline-fixtures.ts: HARDWARE_CONFIG, LOCAL_TEST_CONFIG, READY_FETCH, makeSystemInfo, makeClusterMatcher, makeMockHydraProvider, makeHighPWeights/makeLowPWeights (makeThroughputMeter stays local to local-zero-throughput file). Nothing imports the monolith (grep clean); vitest include `tests/**/*.test.ts` picks up new files — monolith can be **deleted** (no thin re-export needed).

## Step 1: Finish fragmentation

**Status:** Complete

- [x] Move remaining suites
- [x] Delete or thin re-export monolith

### Outcome

- 12 new stage-focused files created (all 52 its moved verbatim): stage-order (4), error-telemetry (3), feature-sidecar (4), gemini-deprioritization (4), turn-envelope (2), cost-telemetry (4), context-fit (7), low-intensity (8), local-zero-throughput (3), p-success (7), expected-cost (4), concurrent-route (2)
- Shared helpers consolidated into router-pipeline-fixtures.ts: HARDWARE_CONFIG, LOCAL_TEST_CONFIG, READY_FETCH, makeSystemInfo, makeClusterMatcher, makeMockHydraProvider, makeHighPWeights/makeLowPWeights
- `tests/unit/router-pipeline.test.ts` **deleted** (no importers; vitest glob picks up new files — no thin re-export needed)
- Family run: 16 files / 85 tests green (52 wave-2 + 33 wave-1) — count preserved

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green

### Verification evidence

- `npm test` exit 0: **137 files / 2169 tests passed** (126→137 files after +12/−1; test count identical to pre-fragmentation baseline — no assertion loss)
- `npm run coverage:check` exit 0 (thresholds 80/80/80/80 met — no coverage reduction)
- `npx tsc --noEmit` exit 0; `npm run lint` exit 0
- Final `gitnexus detect_changes` (all scope): low risk, 0 changed src symbols, 0 affected processes

## Completion Criteria

- [x] Monolith retired (deleted, no thin re-export needed); Closes #155; npm test green

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-06 | 0 | plan | skipped (engine policy — reviews post-.DONE) |
| 2026-09-06 | 1 | plan | skipped (engine policy — reviews post-.DONE) |
| 2026-09-06 | 2 | plan | skipped (engine policy — reviews post-.DONE) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | Inventoried 16 describes / 52 its in monolith; mapped to 12 wave-2 files aligned with SP-273/274 stage modules; confirmed no importers → full delete |
| 2026-09-06 | Step 1 complete | 12 wave-2 files created, helpers shared into fixtures, monolith deleted; typecheck clean; family 85/85 green; detect_changes low risk 0 symbols |
| 2026-09-06 | Step 2 complete | npm test 137 files/2169 tests exit 0; coverage:check exit 0; typecheck + lint exit 0; completion criteria met |
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
