# Task: SP-109 — Length stop error classification (context vs output)

**Created:** 2026-07-07
**Size:** S

## Review Level: 1

**Assessment:** #52 UX fix — distinguish input/context pressure from true output truncation when `stopReason: length` with 0 output tokens.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#52
- Bucket: bug

## Mission

pi maps any `length` stop to "maximum output token limit", which misleads operators when the root cause is input/context pressure or zero output budget (dogfood session `019f3904-e56e-78b2-b0bd-cafe486a10c0`: input 34566, output 0, stopReason length).

Extend `provider-error.ts` (and extension sanitization if needed) to classify length failures: when output tokens are 0 or negligible and input is near context limit, surface a context-overflow message instead of output-truncation wording.

## Dependencies

- SP-108

## Context to Read First

- `src/infrastructure/delegation/provider-error.ts`
- `.pi/extensions/smart-router/delegation-runtime.ts` — `sanitizeAssistantErrorMessage`
- `tests/unit/delegation-context.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/delegation/provider-error.ts` |
| May change | `.pi/extensions/smart-router/delegation-runtime.ts`, `tests/unit/provider-error.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/infrastructure/delegation/provider-error.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | User-facing error distinguishes context overflow vs output truncation; unit tests for 0-output length vs genuine truncation. |

## Steps

### Step 1: Length failure classifier

- [ ] Add helper accepting `AssistantMessage` (stopReason, usage.input/output) and optional context limit hints
- [ ] Classify `length` + 0 output + high input ratio as context pressure
- [ ] Export formatter for user-facing message distinct from output-truncation text

### Step 2: Wire into error sanitization

- [ ] Use classifier in `formatProviderErrorMessage` or dedicated `formatLengthStopMessage` used by delegation-runtime sanitization
- [ ] Avoid misleading "max output token" text for context-pressure cases

### Step 3: Testing and verification

- [ ] Unit tests: 0-output length near window → context message; normal truncation → output message
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] User-facing error message distinguishes context overflow vs output truncation
- [ ] Unit tests cover both classification paths
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-109): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
