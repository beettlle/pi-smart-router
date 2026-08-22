## Summary

When HyDRA projection or ModernBERT K4 head weights are missing/invalid, routing must enter an explicit degraded mode — not silent placeholder-as-production.

## Priority

P1

## Pipeline stages

`src/domain/matching/hydra-matcher.ts`, `src/domain/matching/modernbert-heads.ts`

## Problem / motivation

`resolveHydraProjectionWeights` / `resolveModernBertK4HeadWeights` return null, `console.warn`, then use deterministic placeholders. Operators may believe learned heads are active. Distinct from #96 (enablement flip when trained weights exist).

## Proposed solution

- [ ] Emit telemetry/explain reason code: `hydra_weights_missing`, `k4_heads_placeholder`, etc.
- [ ] Surface in routing decision metadata (not only stderr warn).
- [ ] Optional operator config: `fail_closed_on_missing_weights` for dogfood.
- [ ] Integrate with degraded neural sandwich (#119 closed) reason codes where applicable.
- [ ] Unit tests: missing artifact → placeholder path + explicit reason in decision sidecar.

## Evidence

- `hydra-matcher.ts` ~172–183 — `projectToRequirementsPlaceholder`
- `modernbert-heads.ts` ~176–188 — placeholder heads

## Dependencies

| Issue | Role |
|-------|------|
| #96 | Enablement decision when real K4 weights trained — separate |

## Out of scope

- Training/shipping `modernbert-k4-heads.json` (#114 closed / #96)
- Flipping default to `modernbert_k4`

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/hydra-matcher.test.ts tests/unit/modernbert-heads.test.ts
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Degraded mode + tests | Autonomous |
