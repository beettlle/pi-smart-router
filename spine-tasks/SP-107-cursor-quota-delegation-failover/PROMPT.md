# Task: SP-107 — Cursor quota delegation failover wiring

**Created:** 2026-07-07
**Size:** S

## Review Level: 2

**Assessment:** Complete #70 P1 gap — wire `shouldFailoverOnProviderError` into extension delegation so dogfood usage-limit messages trigger `selectFailover`, not only JSON infra errors.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 2

## Source

- GitHub: beettlle/pi-smart-router#70
- Bucket: bug

## Mission

SP-097 implemented Cursor quota classification and `selectFailover` in `gateway-dispatch.ts`, but `route-and-delegate.ts` only retries on `isInfraAssistantError`. Plain-text usage-limit messages (dogfood: *"You've hit your usage limit…"*) never reach quota failover at runtime.

Wire `shouldFailoverOnProviderError` from gateway dispatch into the delegation error path so subscription quota exhaustion fails over to `cursor/auto` or an economical API model with `cursor_quota_exhausted` telemetry, matching gateway unit tests.

## Dependencies

- SP-097

## Context to Read First

- `.pi/extensions/smart-router/route-and-delegate.ts` — failover loop (lines ~197–240)
- `src/infrastructure/gateway/gateway-dispatch.ts` — `shouldFailoverOnProviderError`, `selectFailover`
- `tests/unit/gateway-dispatch.test.ts` — quota failover expectations
- `tests/unit/smart-router-extension.test.ts` — extension failover patterns

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/route-and-delegate.ts` |
| May change | `tests/unit/smart-router-extension.test.ts`, `tests/integration/pi-extension.test.ts` |
| Must NOT change | `src/infrastructure/gateway/gateway-dispatch.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| fileScopeMustNotChange | `src/infrastructure/gateway/gateway-dispatch.ts` |
| completionCriteria | Usage-limit assistant errors trigger selectFailover; integration or extension unit test proves message-based quota path; verify:ci passes. |

## Steps

### Step 1: Wire quota-aware failover gate

- [ ] Import `shouldFailoverOnProviderError` from `gateway-dispatch.ts`
- [ ] Replace or extend `isInfraAssistantError`-only gate with quota-aware check using fleet profile for failed model
- [ ] Preserve existing infra and Gemini thought-signature terminal paths

### Step 2: Extension test coverage

- [ ] Add test: mocked usage-limit `AssistantMessage` triggers failover to alternate model
- [ ] Assert `reason_code` includes `cursor_quota_exhausted` when failover decision is returned

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Dogfood-style usage-limit messages trigger delegation-layer failover (not only JSON infra errors)
- [ ] Extension or integration test covers message-based quota failover path
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-107): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)
- Change gateway-dispatch quota logic (SP-097 scope)

---
