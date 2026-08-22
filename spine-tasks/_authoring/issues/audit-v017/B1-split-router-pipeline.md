## Summary

Split the 2005-line `RouterPipeline` god object into per-stage modules and invert domain→infrastructure coupling via ports.

## Priority

P1

## Pipeline stages

`src/domain/pipeline/router-pipeline.ts`, hardware/local/telemetry infra imports

## Problem / motivation

`RouterPipeline` owns 12+ stages, telemetry sidecars, expected-cost, degraded sandwich, and pin orchestration while importing `infrastructure/hardware`, `infrastructure/local`, and `infrastructure/telemetry` — domain is not domain. Blocks safe 0.17 feature work.

## Proposed solution

- [ ] Introduce `PipelineStage` interface + shared `RoutingContext` (per A7).
- [ ] Extract stages to focused modules (triage, pin, hydra, local_zero, fallback, etc.).
- [ ] Define ports: `HardwareProbePort`, `LocalRuntimePort`, `TelemetryEmitterPort` — domain depends on interfaces only.
- [ ] Phased PR plan in issue comments (≥3 PRs: extract stages → ports → shrink orchestrator).
- [ ] Sub-task: split `routing-telemetry.ts` (1516 lines) into bounded builders.
- [ ] Sub-task: split `session-pinner.ts` (966 lines) where touched.

## Evidence

- `src/domain/pipeline/router-pipeline.ts` — 2005 lines
- All three audit runs flagged god object

## Dependencies

| Issue | Role |
|-------|------|
| A7 | RoutingContext refactor may land here |
| A8 | SQLite store may get repository split in parallel |

## Out of scope

- Behavior changes to routing policy
- #96 encoder defaults

## Verification

```bash
npm run typecheck && npm test
npm run coverage:check
# No single file >800 lines in pipeline/ after phase 1 (target)
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Phased refactor | Autonomous |
