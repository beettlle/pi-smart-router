## Summary

Add a non-deciding `typed_judgment` pipeline stage that calls the typed-judgment port on user-prompt turns and stores the result on the routing context for later stages. Epic: {{EPIC}}.

## Priority

P1

## Pipeline stages

New `typed_judgment` between `turn_envelope` and `context_fit` in `src/domain/pipeline/router-pipeline.ts`.

## Problem / motivation

Consumers (`low_intensity`, `local_zero`, `hydra_match`, adaptive reasoning) need one judgment per turn, computed before the first stage that can early-exit on a cheap tier.

## Proposed solution

- [ ] New stage module `src/domain/pipeline/typed-judgment-stage.ts` behind the `PipelineStage` contract; **always returns `decided: false`**.
- [ ] New `RoutingContext.typedJudgment: TypedJudgment | null` (and `typedJudgmentSkipReason`) in `src/domain/pipeline/pipeline-stage.ts`, initialized in `createRoutingContext`.
- [ ] Runs only when `typed_judgment.enabled` and the turn is a user prompt (`main_loop`, `planning`, `subagent`, `unknown` with a user message). Skips with reason codes:
  - `typed_judgment_disabled`, `typed_judgment_tool_result`, `typed_judgment_acknowledgement`, `typed_judgment_force_model`, `typed_judgment_timeout`, `typed_judgment_error`
- [ ] Timeout / error / abort → `typedJudgment = null`; every later stage behaves exactly as today (fail open).
- [ ] Update `PIPELINE_STAGE_ORDER`, the README "How it works" stage table, and specs that enumerate stages.
- [ ] Telemetry / feature sidecar (`attachFeatures`): answers, confidences, judgment latency, skip reason. No prompt text.
- [ ] Document latency impact: `route()` is serialized per pipeline (SP-230), so judge latency adds to user-turn routing latency only; `tool_result` turns pay nothing.

## Evidence

- Local OpenJev latency on Apple silicon: ~385–990 ms per user turn depending on question/state size; 27–31 ms on NVIDIA GPU per OpenJev README.
- pi-jev-model-router calls its judge only on pi's `input` event and skips acknowledgements — same policy.

## Dependencies

| Issue | Role |
|-------|------|
| {{T1}} | Port + adapter |
| {{T2}} | State builder + questions + mapper |

## Out of scope

- Using the judgment (separate Sprint 2 issues).
- Async prefetch at turn start (follow-up if latency requires).

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/router-pipeline*.test.ts tests/unit/typed-judgment-stage.test.ts
```

- Stage order test includes `typed_judgment`.
- Fake port: success populates context; timeout/error/abort → null + reason code; tool_result turns never call the port.
- With `enabled: false`, routing decisions are byte-identical to current fixtures.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Stage, wiring, telemetry, tests | Autonomous |
