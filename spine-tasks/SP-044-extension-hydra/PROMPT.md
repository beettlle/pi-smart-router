# Task: SP-044 — Extension HyDRA Wiring

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Wire optional HyDRA embedding matcher into pi extension bootstrap.
**Score:** 4/8

## Mission

Instantiate `HydraMatcher` in the smart-router pi extension so ambiguous requests route through Step 5 (`hydra_match`) instead of always falling through to `safeCloudDefault`. Add `@huggingface/transformers` as an optional runtime dependency; when missing or init fails, extension continues with matcher disabled (same as today).

## Dependencies

- SP-043

## Context to Read First

- `.pi/extensions/smart-router/index.ts` — extension bootstrap, `rebuildFleet`, `createRouterFromFleet` usage
- `src/index.ts` — `createRouterFromFleet()` factory (SP-039)
- `src/domain/matching/hydra-matcher.ts` — `HydraMatcher`, `createOnnxEmbeddingProvider`
- `src/domain/pipeline/router-pipeline.ts` — optional `hydraMatcher` in `PipelineOptions`
- `src/infrastructure/gateway/gateway-dispatch.ts` — passes `PipelineOptions` to `RouterPipeline`
- `src/config/defaults.ts` — `hydra.artifact_cache_path`
- `tests/unit/router-pipeline.test.ts` — hydraMatcher stage patterns

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts`, `src/index.ts`, `package.json`, `.pi/extensions/smart-router/package.json` |
| Must NOT change | `src/domain/matching/hydra-matcher.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/matching/hydra-matcher.ts` |
| completionCriteria | Extension injects HydraMatcher when ONNX provider loads; graceful disable on missing `@huggingface/transformers`; ambiguous routing can reach `hydra_match` stage. |

## Steps

### Step 1: Factory and dependency wiring

- [ ] Extend `createRouterFromFleet()` to accept optional `GatewayDispatchOptions` / `PipelineOptions` (including `hydraMatcher`)
- [ ] Add `@huggingface/transformers` to root `package.json` dependencies (and extension `package.json` if required for pi runtime resolution)
- [ ] Document optional install in extension comments only — do not add README changes unless blocked

### Step 2: Extension bootstrap

- [ ] On extension init, attempt `createOnnxEmbeddingProvider(DEFAULT_OPERATOR_CONFIG.hydra.artifact_cache_path)` and construct `HydraMatcher`
- [ ] Pass matcher into router factory used by `rebuildFleet`
- [ ] On provider/matcher init failure, log a single warning and continue with matcher disabled
- [ ] Ensure `dispose()` or equivalent cleanup on extension teardown if pi exposes a hook; otherwise document no-op in code comment

### Step 3: Tests

- [ ] Add unit tests for factory options passthrough (`tests/unit/fleet-factory.test.ts` or extend existing)
- [ ] Add extension-level test proving hydra-enabled router reaches `hydra_match` for an ambiguous fixture (mock ONNX provider; do not download weights in CI)
- [ ] Add test proving graceful fallback when matcher is not configured

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-044): description`

## Do NOT

- Modify HyDRA matcher core (`src/domain/matching/hydra-matcher.ts`)
- Add automatic ONNX model download to CI
- Wire price broker or registry cost mapping (SP-045, SP-046)

---

## Amendments (Added During Execution)
