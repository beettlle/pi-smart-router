# Task: SP-097 — Cursor quota exhaustion failover

**Created:** 2026-07-06
**Size:** M

## Review Level: 2

**Assessment:** P1 for #70 — detect Cursor usage-limit errors in gateway dispatch and fail over to cursor/auto or economical cloud model.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#70
- Bucket: bug

## Mission

When Cursor returns usage-limit / quota-exhausted errors during dispatch, the router should fail over instead of surfacing a dead-end to the user. Fail over to `cursor/auto` or an economical cloud model from the scoped fleet. Record telemetry with `reason_code: cursor_quota_exhausted`.

## Dependencies

- SP-096

## Context to Read First

- `src/infrastructure/gateway/gateway-dispatch.ts`
- `src/domain/pipeline/router-pipeline.ts`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- Existing provider error handling patterns (SP-059)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/gateway/gateway-dispatch.ts` |
| May change | `src/infrastructure/telemetry/routing-telemetry.ts`, `tests/unit/gateway-dispatch.test.ts` |
| Must NOT change | `src/config/pi-model-mapper.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/infrastructure/gateway/gateway-dispatch.ts` |
| fileScopeMustNotChange | `src/config/pi-model-mapper.ts` |
| completionCriteria | Quota-style Cursor errors trigger failover; reason_code cursor_quota_exhausted in telemetry; integration or unit test covers failover path. |

## Steps

### Step 1: Quota error detection

- [ ] Identify Cursor usage-limit error patterns (message/status codes from dogfood evidence)
- [ ] Add classifier helper for quota-exhausted vs other provider errors

### Step 2: Failover dispatch

- [ ] On quota error, retry with cursor/auto or cheapest viable economical model
- [ ] Preserve session context; do not infinite-retry
- [ ] Emit `reason_code: cursor_quota_exhausted` on failover decision

### Step 3: Testing and verification

- [ ] Unit or integration test: mocked quota error triggers failover
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Quota-style provider error triggers failover to cursor/auto or economical model
- [ ] Telemetry records `cursor_quota_exhausted` when failover triggered
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-097): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
