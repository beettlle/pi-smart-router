# Task: SP-075 — Gemini Thought Signature Classification

**Created:** 2026-07-05
**Size:** S

## Review Level: 1

**Assessment:** Stop classifying Gemini thought_signature 400s as infra failover; surface terminal error per FR-018.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#37
- Bucket: bug

## Mission

When Google Gemini returns **400 INVALID_ARGUMENT** with `thought_signature` in the message, pi-smart-router incorrectly classifies it as an infrastructure error and triggers stream delegation failover. This is a **client/protocol validation error** (incomplete tool-call replay), not transient provider unavailability.

Fix:
1. Remove the thought_signature exception from `isInfraError()` in `circuit-breaker.ts`
2. Add explicit classifier in `provider-error.ts` (e.g. `isGeminiThoughtSignatureError`)
3. Extension stream delegation must **not** failover on this class; return sanitized terminal error with operator guidance
4. Update tests that currently assert thought_signature 400 **is** infra
5. Add README troubleshooting section (link Google docs + pi#6342)

## Dependencies

- SP-074

## Context to Read First

- `src/infrastructure/gateway/circuit-breaker.ts` — lines 62–65
- `src/infrastructure/delegation/provider-error.ts` — `isInfraAssistantError`, `formatProviderErrorMessage`
- `.pi/extensions/smart-router/index.ts` — `routeAndDelegate` failover loop ~1283–1312
- `tests/unit/provider-error.test.ts`
- `tests/unit/circuit-breaker.test.ts`
- `tests/unit/smart-router-extension.test.ts`
- Upstream: [earendil-works/pi#6342](https://github.com/earendil-works/pi/issues/6342)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/gateway/circuit-breaker.ts`, `src/infrastructure/delegation/provider-error.ts`, `.pi/extensions/smart-router/index.ts` |
| May change | `tests/unit/provider-error.test.ts`, `tests/unit/circuit-breaker.test.ts`, `tests/unit/smart-router-extension.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/gateway/circuit-breaker.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | thought_signature 400 not infra; no failover on this error; sanitized terminal message with workaround; tests updated. |

## Testing

- Unit: `provider-error.test.ts`, `circuit-breaker.test.ts` — thought_signature not infra
- Extension: `smart-router-extension.test.ts` — no failover on thought_signature error
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Reclassify error

- [ ] Remove thought_signature 400 from `isInfraError()`
- [ ] Add `isGeminiThoughtSignatureError()` helper in `provider-error.ts`

### Step 2: Extension terminal path

- [ ] Skip `selectFailover` when error is thought_signature class
- [ ] Format user-facing message with `/new` or non-Google model guidance

### Step 3: Tests and docs

- [ ] Update provider-error and circuit-breaker tests
- [ ] Extension test: thought_signature error does not trigger failover
- [ ] README troubleshooting subsection
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] No failover notice for thought_signature 400
- [ ] Clear terminal error for operators
- [ ] FR-018 infra-only failover preserved for real infra errors
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-075): description`

## Do NOT

- Change HyDRA or triage routing in this task
- Remove failover for genuine 5xx/429 errors

---

## Amendments (Added During Execution)
