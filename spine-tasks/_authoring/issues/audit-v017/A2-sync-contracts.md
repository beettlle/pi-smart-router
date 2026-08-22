## Summary

Align RoutingDecision/RoutingRequest JSON Schema, Zod models, TypeScript types, and contract tests with live `RouterPipeline.route()` output — including strict validation.

## Priority

P0

## Pipeline stages

`specs/001-build-smart-router/contracts/`, `src/domain/types/`, `tests/contract/routing-schemas.test.ts`, `router-pipeline.ts`

## Problem / motivation

Published `routing-decision.schema.json` has `additionalProperties: false` and a six-stage enum; runtime attaches `features` sidecar and uses 12+ stage names from `PIPELINE_STAGE_ORDER`. Contract tests validate hand-written fixtures only. `RoutingRequestSchema` uses Zod strip behavior while JSON Schema requires `additionalProperties: false` (Gemini retry).

## Proposed solution

- [ ] Extend `routing-decision.schema.json` with `features` (or documented sidecar schema) and full stage enum matching `PIPELINE_STAGE_ORDER` in `src/domain/pipeline/router-pipeline.ts`.
- [ ] Widen `RoutingStage` in `src/domain/types/entities.ts` to match runtime stages (or document mapping layer).
- [ ] Add Message `status`, `tool_call_id` / `tool_calls` to entities + schemas per `routing-request.schema.json`.
- [ ] Add `.strict()` (or equivalent) on `RoutingRequestSchema` and related Zod models so unknown keys reject.
- [ ] Add contract test that round-trips a live `RouterPipeline.route()` decision through JSON Schema + Zod.

## Evidence

- `specs/001-build-smart-router/contracts/routing-decision.schema.json`
- `src/domain/types/entities.ts` — stale six-value `RoutingStage`
- `src/domain/types/schemas.ts` — `RoutingRequestSchema` ~line 32
- `tests/contract/routing-schemas.test.ts` — fixtures omit `features`

## Dependencies

| Issue | Role |
|-------|------|
| A3 (SP-222 producer) | Message fields must match synced schema |
| #132 (closed) | Partial loop-escalation schema work |

## Out of scope

- #96 modernbert_k4 enablement
- #110 calibration artifacts

## Verification

```bash
npm run typecheck
npx vitest run tests/contract/routing-schemas.test.ts
# New test: live route() payload validates against schema
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Schema + Zod + contract tests | Autonomous |
