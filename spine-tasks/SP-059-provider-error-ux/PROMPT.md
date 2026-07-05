# Task: SP-059 — Provider Error UX

**Created:** 2026-07-05
**Size:** S

## Review Level: 1

**Assessment:** Sanitize provider error messages for user display when failover exhausts; no raw JSON in terminal.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#22
- Bucket: bug

## Mission

When provider returns 503/infra error and smart-router has no failover alternate, raw nested JSON in `AssistantMessage.errorMessage` reaches the pi session/terminal. Failover-retry path parses errors for notices; terminal failure path does not rewrite `errorMessage`.

Tasks:
- Add `formatProviderErrorMessage(raw)` in `provider-error.ts`
- Sanitize delegated error events before terminal `flushDelegatedEvents`
- Use formatter in `createErrorMessage` for JSON-ish Error messages
- Tests for double-wrapped LiteLLM 503 payload and terminal failure with no alternate

## Dependencies

- SP-062

## Context to Read First

- `src/infrastructure/delegation/provider-error.ts` — `parseProviderError`, `parseAssistantMessageError`
- `.pi/extensions/smart-router/index.ts` — `routeAndDelegate`, `flushDelegatedEvents`, `createErrorMessage`, `injectFailoverNotice`
- `tests/unit/provider-error.test.ts`
- `tests/unit/smart-router-extension.test.ts` — infra failover tests

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts`, `src/infrastructure/delegation/provider-error.ts` |
| May change | `tests/unit/provider-error.test.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Terminal 503 double-wrapped payload surfaces human-readable message; no raw JSON in errorMessage; failover-retry path unchanged. |

## Testing

- Unit test: `formatProviderErrorMessage` on double-wrapped LiteLLM 503 blob
- Extension test: infra error with no failover alternate returns sanitized errorMessage
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Add formatProviderErrorMessage

- [ ] Implement formatter using existing `parseProviderError`
- [ ] Fallback for unparseable JSON: short generic message, never full blob

### Step 2: Sanitize terminal error events

- [ ] Add helper to rewrite errorMessage on error/done events before flush
- [ ] Apply on all terminal failure flush paths in `routeAndDelegate`
- [ ] Use formatter in `createErrorMessage`

### Step 3: Tests and verification

- [ ] Add provider-error and extension tests
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] No raw JSON in user-facing errorMessage on terminal failure
- [ ] Failover-retry behavior unchanged
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-059): description`

## Do NOT

- Change failover selection logic in gateway-dispatch
- Remove structured `console.warn` operator logs
- Change pipeline stage logic

---

## Amendments (Added During Execution)
