# Task: SP-308 — Typed-judgment feature sidecar + composition-root wiring

**Created:** 2026-10-24
**Size:** M

## Review Level: 2

**Assessment:** Record typed-judgment answers, confidences, latency and skip reason on the privacy-safe feature sidecar, and bind the SP-305 adapter into the pi extension composition root from operator config.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 0, Security: 1, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#187
- Epic: beettlle/pi-smart-router#183
- Release: v1.3.0
- Bucket: feature
- Closes: #187 (with SP-307)

## Mission

- **Feature sidecar:** add an optional `typed_judgment` object to `RoutingFeatureSidecar` (`src/domain/types/entities.ts`), `RoutingFeatureSidecarSchema` (`src/domain/types/schemas.ts`, `.strict()`), and the contract JSON `features` definition (`specs/001-build-smart-router/contracts/routing-decision.schema.json`):
  - `task_kind`, `task_kind_confidence`, `capability_deserved`, `deep_reasoning_p`, `code_gen`, `tool_use`, `destructive_p` (numbers or null), `question_set_version`, `latency_ms`, `skip_reason` (string or null)
  - **No** prompt, state, or answer legend text
- Populate it in the orchestrator feature attachment (`router-pipeline.ts` ~L391–450) from `RoutingContext.typedJudgment*` (SP-307). Omit the key entirely when the stage was disabled so existing sidecar fixtures stay byte-identical.
- **Composition root:** in `.pi/extensions/smart-router/fleet-bootstrap.ts` `createDispatchOptions`, read `operatorConfig.typed_judgment`, call `createTypedJudgmentPort` (SP-305), and pass `typedJudgmentPort` + `typedJudgmentConfig` into the dispatch options when the factory returns a port. When it returns `null`, pass nothing and log the fail-closed reason once (no endpoint secrets, no key).
- `GatewayDispatchOptions` must forward the two new fields to `RouterPipeline` (it already spreads options; verify with a test).

## Dependencies

- SP-305 (adapter + factory)
- SP-307 (stage + context fields + `PipelineOptions`)

## Context to Read First

- Issue beettlle/pi-smart-router#187
- `src/domain/pipeline/router-pipeline.ts` (feature attachment), `src/domain/types/entities.ts`, `src/domain/types/schemas.ts` (`RoutingFeatureSidecarSchema`)
- `specs/001-build-smart-router/contracts/routing-decision.schema.json` (`features`)
- `.pi/extensions/smart-router/fleet-bootstrap.ts` (`createDispatchOptions`), `src/infrastructure/gateway/gateway-dispatch.ts`
- `tests/unit/router-pipeline-feature-sidecar.test.ts`, `tests/contract/routing-schemas.test.ts`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/entities.ts`, `src/domain/types/schemas.ts`, `src/domain/pipeline/router-pipeline.ts`, `specs/001-build-smart-router/contracts/routing-decision.schema.json`, `.pi/extensions/smart-router/fleet-bootstrap.ts`, `tests/unit/router-pipeline-feature-sidecar.test.ts`, `tests/unit/typed-judgment-wiring.test.ts` |
| May change | `src/infrastructure/gateway/gateway-dispatch.ts` (option typing only), `tests/contract/routing-schemas.test.ts` |
| Must NOT change | `package.json`, `src/domain/judgment/**`, `src/domain/pipeline/typed-judgment-stage.ts` (behavior), `src/infrastructure/judgment/**`, `README.md`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/router-pipeline-feature-sidecar.test.ts tests/unit/typed-judgment-wiring.test.ts tests/contract/routing-schemas.test.ts && bash scripts/spine-stet-contract-run.sh default SP-308` |
| fileScopeMustChange | `src/domain/types/schemas.ts`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/fleet-bootstrap.ts`, `tests/unit/typed-judgment-wiring.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/domain/judgment/`, `src/infrastructure/judgment/`, `.review/` |
| completionCriteria | Sidecar `typed_judgment` in entities, zod schema and contract JSON; populated from context, omitted when disabled; composition root binds adapter from config and fails closed with a logged reason; tests green |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-305 and SP-307 on `main`; read current sidecar fixture expectations

### Step 1: Sidecar

- [ ] Types + strict zod + contract JSON; populate in feature attachment; omit when disabled

### Step 2: Composition root

- [ ] `createDispatchOptions` builds the port from `operatorConfig.typed_judgment`; forwards through `GatewayDispatch`

### Step 3: Testing & Verification

- [ ] Sidecar contains judgment fields on a judged turn and skip reason on a skipped turn; no text fields
- [ ] Disabled config → sidecar fixtures byte-identical
- [ ] Wiring: enabled loopback config yields a port in dispatch options; remote without key yields none and logs the reason without the key
- [ ] Run Contract `testCommand`

## Do NOT

- Persist judgment fields to SQLite (out of scope; sidecar only)
- Change stage behavior from SP-307
- Edit README (SP-309)

## Completion Criteria

- [ ] #187 telemetry/sidecar acceptance items met (with SP-307)
- [ ] Contract tests green
