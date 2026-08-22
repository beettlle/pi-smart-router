# Task: SP-229 — Sync routing contracts with live pipeline

**Created:** 2026-08-22
**Size:** M

## Review Level: 1

**Assessment:** Align JSON Schema, Zod, types, and contract tests with live RouterPipeline.route() output.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#136
- Bucket: enhancement
- Closes: #136
- Release: v0.17.0
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## Mission

Closes #136 — `routing-decision.schema.json` and Zod models must match runtime: full `PIPELINE_STAGE_ORDER` enum, `features` sidecar, Message `status`/tool fields, strict `RoutingRequestSchema` (reject unknown keys). Add contract test round-tripping live `RouterPipeline.route()` decision through JSON Schema + Zod.

## Dependencies

- SP-225

## Context to Read First

- `specs/001-build-smart-router/contracts/routing-decision.schema.json`, `routing-request.schema.json`
- `src/domain/types/entities.ts`, `src/domain/types/schemas.ts`
- `src/domain/pipeline/router-pipeline.ts` — `PIPELINE_STAGE_ORDER`
- `tests/contract/routing-schemas.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `specs/001-build-smart-router/contracts/`, `src/domain/types/entities.ts`, `src/domain/types/schemas.ts`, `tests/contract/routing-schemas.test.ts` |
| May change | `src/domain/pipeline/router-pipeline.ts` (only if export needed for live round-trip test) |
| Must NOT change | Routing policy logic in pipeline stages |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/contract/routing-schemas.test.ts` |
| fileScopeMustChange | `specs/001-build-smart-router/contracts/routing-decision.schema.json` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| completionCriteria | Schemas match runtime stages and features; strict Zod; live route() round-trip test; #136 closable |

## Steps

### Step 1: Extend decision/request schemas and types

- [ ] Full stage enum from `PIPELINE_STAGE_ORDER`
- [ ] `features` sidecar in decision schema
- [ ] Message status/tool fields aligned with SP-225

### Step 2: Strict Zod and live round-trip test

- [ ] `.strict()` on RoutingRequestSchema and related models
- [ ] Contract test: live `route()` payload validates JSON Schema + Zod

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Contracts match live pipeline output
- [ ] Live round-trip contract test passes
- [ ] #136 closable

## Do NOT

- Flip modernbert_k4 defaults (#96)
- Ship calibration artifacts (#110)
