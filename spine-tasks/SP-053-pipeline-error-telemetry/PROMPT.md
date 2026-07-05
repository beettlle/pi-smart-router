# Task: SP-053 — Pipeline Error Telemetry

**Created:** 2026-07-04
**Size:** S

## Review Level: 1

**Assessment:** Emit telemetry and warn logs when pipeline stage errors are swallowed; preserve safe-default fallback.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#20
- Bucket: bug

## Mission

`RouterPipeline.route()` wraps stage execution in a bare `catch {}` that degrades to safe default without logging or telemetry. Constitution VI (zero-crash) is correct, but silent failure violates observability expectations.

On catch:
- Emit telemetry record with `reason_code: 'pipeline_error'` and stage name
- Log at `warn` level with error message (redact prompt content)
- Preserve zero-crash fallback behavior (do not rethrow)
- Unit test: injected stage throw → telemetry emitted + safe default returned

## Dependencies

- SP-052

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — catch block ~line 87
- `src/infrastructure/telemetry/routing-telemetry.ts`
- `tests/unit/router-pipeline.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `src/infrastructure/telemetry/routing-telemetry.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts`, `src/api/middleware/pi-router-middleware.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Injected stage throw emits telemetry with pipeline_error reason_code and returns safe default; warn log present; no rethrow. |

## Steps

### Step 1: Instrument catch block

- [ ] Capture error in catch (typed unknown); extract message without prompt content
- [ ] Emit telemetry via existing emitter with `reason_code: 'pipeline_error'` and stage identifier
- [ ] Log at warn level with redacted context

### Step 2: Unit test for silent-failure regression

- [ ] Add test: mock stage throws → telemetry record emitted + safe default returned
- [ ] Assert zero-crash behavior preserved (no exception propagates)

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Pipeline errors observable via telemetry and warn logs
- [ ] Safe-default fallback unchanged
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-053): description`

## Do NOT

- Rethrow pipeline errors
- Log prompt or message content from routing requests
- Modify extension or middleware wiring

---

## Amendments (Added During Execution)
