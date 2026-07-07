# Task: SP-108 — Delegation output headroom guard and explicit maxTokens

**Created:** 2026-07-07
**Size:** M

## Review Level: 2

**Assessment:** #52 core fix — block provider dispatch when reserved output budget is below floor; set `maxTokens` explicitly from context window math.
**Score:** 5/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#52
- Bucket: bug

## Mission

Dogfood produced `stopReason: "length"` with **0 output tokens** when a 34K-token context hit `gemini-flash-lite-latest`. Pipeline context-fit (SP-093) filters input, but delegation still calls the provider without reserving output headroom or setting `maxTokens`.

Before `delegateStream`, validate `estimated_input_tokens + minOutputReserve <= contextWindow` using fleet/registry limits. Compute `maxTokens = min(model.max_output_tokens, contextWindow - estimated_input - buffer)` and skip dispatch when below a configured floor (default 256). On no-fit, trigger context-overflow fallback (SP-095 policy) without calling the provider.

## Dependencies

- SP-095
- SP-092
- SP-107

## Context to Read First

- `.pi/extensions/smart-router/route-and-delegate.ts`
- `.pi/extensions/smart-router/delegation-runtime.ts` — `resolveDelegationOptions`
- `src/domain/routing/context-fit.ts` — overflow fallback helpers
- `src/domain/types/entities.ts` — `limits.max_input_tokens`, `max_output_tokens`
- Epic: beettlle/pi-smart-router#46

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/route-and-delegate.ts`, `.pi/extensions/smart-router/delegation-runtime.ts` |
| May change | `src/domain/delegation/output-headroom.ts`, `tests/unit/delegation-headroom.test.ts`, `tests/integration/pi-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `.pi/extensions/smart-router/delegation-runtime.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | No dispatch when reserved output < floor; maxTokens set explicitly at delegation; integration test mocks 0-output length failure and expects fallback or structured error. |

## Steps

### Step 1: Output headroom helper

- [ ] Add pure helper (domain or `src/domain/delegation/`) computing `maxOutputTokens` from profile limits, estimated input, and buffer
- [ ] Export configurable `MIN_OUTPUT_TOKEN_FLOOR` (default 256) and output reserve buffer constant
- [ ] Unit tests: 34K input on 32K window → no-fit; healthy margin → positive maxTokens

### Step 2: Pre-dispatch guard in route-and-delegate

- [ ] After routing decision, before `delegateWithOutcome`, re-check input + minOutputReserve against target model context window
- [ ] On fail → call context-overflow fallback selection (reuse SP-095 helpers) without provider call
- [ ] Retry delegation with larger-fit model when fallback available

### Step 3: Explicit maxTokens in delegation options

- [ ] In `resolveDelegationOptions`, set `maxTokens` from headroom helper (do not rely on provider defaults)
- [ ] When computed maxTokens < floor → treat as no-fit (do not dispatch)

### Step 4: Testing and verification

- [ ] Integration test: mock provider `length` stop at 0 output → router retries larger model or returns structured error
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] No dispatch when reserved output budget < configured floor
- [ ] `maxTokens` set explicitly at delegation call site
- [ ] Integration test covers 0-output length failure path
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-108): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)
- Change pipeline stage order (#69 handles integration pass)

---
