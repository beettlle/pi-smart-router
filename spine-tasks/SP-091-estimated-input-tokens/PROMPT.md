# Task: SP-091 — Populate estimated_input_tokens in extension

**Created:** 2026-07-06
**Size:** S

## Review Level: 1

**Assessment:** Foundation for context-fit routing — set token estimate in buildRoutingRequest.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#47
- Bucket: feature

## Mission

`RoutingRequest.estimated_input_tokens` exists in the domain schema but the pi extension never sets it. `buildRoutingRequest()` only passes `prompt_text`, `messages`, and `turn_type`.

Populate `estimated_input_tokens` in `buildRoutingRequest(context, options, lifecycleHookState)`:

1. Prefer pi/`Context` token count if exposed on stream options or context object.
2. Fallback: conservative estimate from `mapContextMessages(context.messages)` (chars / 4 or provider estimator if available).
3. Pass through on every `RoutingRequest` so pipeline, pinner, telemetry, and dataset recorder see the same number.

## Dependencies

- SP-090

## Context to Read First

- `.pi/extensions/smart-router/routing-context.ts`
- `.pi/extensions/smart-router/route-and-delegate.ts`
- `src/domain/types/entities.ts` — `estimated_input_tokens`
- `specs/001-build-smart-router/data-model.md`
- Epic: beettlle/pi-smart-router#46

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/routing-context.ts` |
| May change | `.pi/extensions/smart-router/route-and-delegate.ts`, `tests/integration/pi-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `.pi/extensions/smart-router/routing-context.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | buildRoutingRequest sets non-zero estimated_input_tokens when messages exist; stable across turns; integration test asserts field populated. |

## Steps

### Step 1: Investigate pi token APIs

- [ ] Check `@earendil-works/pi-ai/compat` Context / SimpleStreamOptions for exposed token counts

### Step 2: Implement estimate in buildRoutingRequest

- [ ] Set `estimated_input_tokens` with preferred API or chars/4 fallback
- [ ] Ensure estimate flows through route-and-delegate to RoutingRequest

### Step 3: Testing and verification

- [ ] Extend `tests/integration/pi-extension.test.ts` to assert field is populated
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `buildRoutingRequest` sets `estimated_input_tokens` to a non-zero integer when messages exist
- [ ] Estimate is stable across main_loop and tool_result turns (monotonic with history growth)
- [ ] Unit or integration test asserts field is populated
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-091): description`

## Do NOT

- Re-open or implement #1, #25, #26 (dogfooding hardware probe — operator excluded)

---
