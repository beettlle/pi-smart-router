## Summary

Validate or fix `RouterPipeline` instance-level transient state so concurrent `route()` calls cannot corrupt routing decisions.

## Priority

P0

## Pipeline stages

`src/domain/pipeline/router-pipeline.ts`

## Problem / motivation

`RouterPipeline` stores per-route state (`currentHardwareResult`, `currentTriageResult`, `currentHydraResult`, etc.) as instance fields (~lines 304–338). `route()` resets at start, but concurrent calls on the same instance race (Gemini audit). Even if pi serializes today, the class contract is unsafe for embedders and future concurrency.

## Proposed solution

- [ ] Document pi’s serialization guarantee in code comment + README if calls are strictly serialized.
- [ ] **Preferred:** Refactor transient state into per-call `RoutingContext` passed through stages (coordinate with B1 split).
- [ ] Add test: two overlapping `route()` calls (if API allows) do not cross-contaminate sidecar fields — or test documents single-flight assumption.
- [ ] Export concurrency contract in `createRouter()` docs.

## Evidence

- `src/domain/pipeline/router-pipeline.ts` — instance fields ~304–338
- Gemini audit P0 concurrency finding

## Dependencies

| Issue | Role |
|-------|------|
| B1 | Pipeline split may land RoutingContext refactor |

## Out of scope

- Full B1 refactor (can be phased: document first, refactor in B1)

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/router-pipeline.test.ts
# New concurrent or contract test as applicable
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Investigation + fix or documented contract | Autonomous |
