## Summary

Add `hydra.requirements_source: "projection" | "jev"` so HyDRA can take its requirement vector from the typed judgment instead of the MiniLM/Granite embedding + learned projection. Epic: {{EPIC}}.

## Priority

P2

## Pipeline stages

`hydra_match` (`src/domain/pipeline/hydra-match-stage.ts`, `src/domain/matching/hydra-matcher.ts`).

## Problem / motivation

HyDRA's requirement vector (`RequirementVector { reasoning, code_gen, tool_use }`) comes from a projection head that is still honest-untrained (#110 v1.1 comment). Encoder work (#96 K=4 heads, #167 Granite dogfood, #173 cascade) exists largely to improve that vector. The typed judgment produces the same three dimensions with no training.

## Proposed solution

- [ ] Config `hydra.requirements_source` in `src/domain/types/schemas.ts`, default `"projection"` (no behavior change).
- [ ] When `"jev"` and `RoutingContext.typedJudgment` is present: `reasoning ← deepReasoningP`, `code_gen ← codeGen`, `tool_use ← toolUse` (all 0–1). Matcher accepts precomputed requirements; embedding is skipped for that turn.
- [ ] Shortfall gate, multi-objective scoring, and degraded sandwich unchanged.
- [ ] Judgment null → fall back to the projection path; reason code `requirements_source_fallback`.
- [ ] `recordLearnedRoute` still records requirement fingerprints (`requirementFingerprint`) for the degraded sandwich.
- [ ] Telemetry / sidecar field `requirements_source: "projection" | "jev" | "projection_fallback"`.

## Evidence

On local OpenJev, the judge separated trivial (capability 0.00–0.02) from planning/debug (≈2.0/3) consistently; HyDRA's flag-prefix input under-rated the #179 case the same way the projection did.

## Dependencies

| Issue | Role |
|-------|------|
| {{T4}} | Stage populating the judgment |

## Out of scope

- Flipping the default (decided after the eval issue).
- Removing encoder code paths.

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/hydra-matcher.test.ts tests/unit/router-pipeline-hydra-match.test.ts
```

- `projection` default: decisions byte-identical to current fixtures.
- `jev` with judgment: requirements equal mapped values; embedder not called.
- `jev` without judgment: projection used, fallback reason recorded.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Config, matcher seam, tests | Autonomous |
