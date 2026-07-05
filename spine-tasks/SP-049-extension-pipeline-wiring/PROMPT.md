# Task: SP-049 — Extension Pipeline Wiring

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Wire MVP pipeline stages (hardware, local, loop escalation, rate limiter) in production pi extension path.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#14
- Bucket: bug

## Mission

The production pi extension path does not wire several pipeline stages implemented and tested in `src/` but inert at runtime.

`createDispatchOptions()` in `.pi/extensions/smart-router/index.ts` currently passes only `sessionPinner`, optional `hydraMatcher`, and `telemetryEmitter`. Missing options:

- `hardwareConfig` + `systemInfoProvider` → hardware probe and local zero-tier gating never run
- `localConfig` → LM Studio / Ollama local routing dead in production
- `loopEscalationConfig` → loop escalation stage is always a no-op
- `rateLimiter` / SQLite token bucket → FR-017 rate limiting unused in extension path

Integration tests inject full options manually, masking this gap.

## Dependencies

- SP-046

## Context to Read First

- `.pi/extensions/smart-router/index.ts` — `createDispatchOptions()`, `createRouterFromFleet()`
- `src/config/operator-config.ts` — `DEFAULT_OPERATOR_CONFIG`
- `src/domain/pipeline/router-pipeline.ts`
- `tests/integration/` — existing pipeline injection patterns

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts` |
| May change | `tests/integration/pi-extension.test.ts`, `src/config/operator-config.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Extension passes hardware, local, loop-escalation, and rate-limiter options into dispatch; integration test boots extension-equivalent dispatch options. |

## Steps

### Step 1: Wire hardware and local config

- [ ] Pass `DEFAULT_OPERATOR_CONFIG` hardware settings and `systemInfoProvider` into `GatewayDispatchOptions`
- [ ] Pass `localConfig` for LM Studio / Ollama backends

### Step 2: Wire loop escalation and rate limiter

- [ ] Pass `loopEscalationConfig` into dispatch options
- [ ] Wire rate limiter via `StorePort` (`initBucket` / `consumeToken`) when SQLite store is active

### Step 3: Extension wiring integration test

- [ ] Add or extend integration test that boots extension-equivalent dispatch options (not only direct pipeline injection)
- [ ] Verify hardware probe and local config reach pipeline at runtime

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Extension passes hardware, local, loop-escalation, and rate-limiter settings into `GatewayDispatchOptions`
- [ ] Integration test covers extension wiring regression
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-049): description`

## Do NOT

- Change pipeline stage order (SP-050)
- Wire lifecycle hooks (SP-051)
- Modify domain pipeline logic beyond what extension wiring requires

---

## Amendments (Added During Execution)
