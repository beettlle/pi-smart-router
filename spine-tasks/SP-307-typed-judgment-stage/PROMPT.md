# Task: SP-307 — typed_judgment pipeline stage (non-deciding, fail-open)

**Created:** 2026-10-24
**Size:** M

## Review Level: 2

**Assessment:** New pipeline stage between `turn_envelope` and `context_fit` that calls the typed-judgment port on user-prompt turns, stores the result on `RoutingContext`, and never decides.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 1, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#187
- Epic: beettlle/pi-smart-router#183
- Release: v1.3.0
- Bucket: feature
- Partial: #187 (stage + order + context; sidecar and composition wiring in SP-308)

## Mission

Consumers (`low_intensity`, `local_zero`, `hydra_match`, adaptive reasoning — later trains) need one judgment per turn, computed before the first stage that can early-exit on a cheap tier.

- New `src/domain/pipeline/typed-judgment-stage.ts` behind the `PipelineStage` contract; **always returns `decided: false`**.
- `RoutingContext` (`src/domain/pipeline/pipeline-stage.ts`): add `typedJudgment: TypedJudgment | null`, `typedJudgmentSkipReason: string | null`, `typedJudgmentLatencyMs: number | null`; initialize to `null` in `createRoutingContext`.
- `PipelineOptions` (`router-pipeline.ts`): add optional `typedJudgmentPort?: TypedJudgmentPort` and `typedJudgmentConfig?: TypedJudgmentConfig`. Missing port or config → stage skips with `typed_judgment_disabled`.
- Runs only when `typed_judgment.enabled` and the turn is a user prompt (`main_loop`, `planning`, `subagent`, `unknown` with a user message). Skip reason codes:
  - `typed_judgment_disabled`, `typed_judgment_tool_result`, `typed_judgment_acknowledgement` (via SP-306 `isAcknowledgement`), `typed_judgment_force_model`, `typed_judgment_timeout`, `typed_judgment_error`
- Calls `buildJudgeState` + the question set (SP-306), passes an `AbortSignal` bounded by `timeout_ms`, and maps answers with `mapTypedJudgment`.
- Timeout / error / abort → `typedJudgment = null` and the matching reason; every later stage behaves exactly as today (fail open). Errors are redacted via `redactPromptFromError`; never log prompt or state text.
- Stage order: insert `typed_judgment` after `turn_envelope` in `PIPELINE_STAGE_ORDER`, the orchestrator stage list, `RoutingStageSchema` (`src/domain/types/schemas.ts`), the contract JSON stage enum (`specs/001-build-smart-router/contracts/routing-decision.schema.json`), and the header comment in `router-pipeline.ts`. Keep them in sync (SP-119 rule).
- Latency note in the stage header comment: `route()` is serialized per pipeline (SP-230), so judge latency adds to user-turn routing latency only; `tool_result` turns pay nothing.

## Dependencies

- SP-304 (port + config types)
- SP-306 (state builder, questions, mapper, acknowledgement detector)

## Context to Read First

- Issue beettlle/pi-smart-router#187
- `src/domain/pipeline/pipeline-stage.ts`, `src/domain/pipeline/router-pipeline.ts` (stage list, `PIPELINE_STAGE_ORDER`, `PipelineOptions`)
- `src/domain/pipeline/turn-envelope-stage.ts` (turn type detection, stage module style)
- `src/domain/judgment/*` (SP-306), `src/domain/ports/typed-judgment-port.ts` (SP-304)
- `tests/unit/router-pipeline-stage-order.test.ts`, `tests/contract/routing-schemas.test.ts`, `tests/unit/router-pipeline-fixtures.ts`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None (fake port in tests)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/typed-judgment-stage.ts`, `src/domain/pipeline/pipeline-stage.ts`, `src/domain/pipeline/router-pipeline.ts`, `src/domain/types/schemas.ts`, `specs/001-build-smart-router/contracts/routing-decision.schema.json`, `tests/unit/typed-judgment-stage.test.ts`, `tests/unit/router-pipeline-stage-order.test.ts` |
| May change | `src/domain/types/entities.ts` (stage doc comment), `tests/contract/routing-schemas.test.ts`, `tests/unit/pipeline-stage.test.ts` |
| Must NOT change | `package.json`, `src/infrastructure/**`, `.pi/extensions/**`, `src/domain/judgment/**`, `README.md`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/typed-judgment-stage.test.ts tests/unit/router-pipeline-stage-order.test.ts tests/unit/pipeline-stage.test.ts tests/contract/routing-schemas.test.ts tests/unit/router-pipeline-feature-sidecar.test.ts && bash scripts/spine-stet-contract-run.sh default SP-307` |
| fileScopeMustChange | `src/domain/pipeline/typed-judgment-stage.ts`, `src/domain/pipeline/router-pipeline.ts`, `tests/unit/typed-judgment-stage.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/infrastructure/`, `.pi/extensions/`, `.review/` |
| completionCriteria | Stage runs after turn_envelope, never decides, fails open with reason codes; tool_result turns never call the port; stage enum in sync across order/schema/contract; disabled → byte-identical decisions; tests green |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-304 and SP-306 on `main`; list every stage-enum site (`rg "context_overflow_fallback"`)

### Step 1: Context and stage module

- [ ] `RoutingContext` fields + init; `typed-judgment-stage.ts` with skip reasons, timeout, fail-open

### Step 2: Orchestrator wiring and stage enum

- [ ] `PipelineOptions` fields, stage instance, order insert; sync `RoutingStageSchema` and contract JSON

### Step 3: Testing & Verification

- [ ] Stage order test includes `typed_judgment` after `turn_envelope`
- [ ] Fake port success populates context; timeout / error / abort → null + reason code
- [ ] `tool_result` turns and acknowledgements never call the port; force-model skips
- [ ] With `enabled: false` (or no port) routing decisions are byte-identical to current fixtures
- [ ] Run Contract `testCommand`

## Do NOT

- Use the judgment in any other stage (#188–#190)
- Return `decided: true` from the stage
- Add telemetry sidecar fields or composition-root wiring (SP-308)
- Edit README (SP-309)

## Completion Criteria

- [ ] #187 stage acceptance items met (sidecar in SP-308)
- [ ] Contract tests green
