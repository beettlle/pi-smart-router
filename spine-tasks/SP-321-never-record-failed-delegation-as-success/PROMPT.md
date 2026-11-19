# Task: SP-321 — Never record failed delegation as success; single recordOutcome

**Created:** 2026-11-19
**Size:** S

## Review Level: 2

**Assessment:** Failed streams must never call `recordSuccess`; remove duplicate infra `recordOutcome`.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 2

## Source

- GitHub: beettlle/pi-smart-router#194
- Release: v1.5.0
- Bucket: bug
- Partial: #194 (recording; failover counter in SP-322)

## Mission

When `parseAssistantMessageError` returns `undefined` on a failed stream, `recordDelegateOutcome` passes `undefined` into `recordOutcome`, which treats it as success and resets the breaker.

1. In `recordDelegateOutcome`, when the delegation failed, **always** pass a defined error (reuse `resolveFailoverProviderError` / message fallback).
2. Remove the duplicate `recordOutcome` in `route-and-delegate.ts` failover branch (Proposed fix 3) so each attempt is counted once.
3. Ensure thrown-stream catch path still records a failure the breaker can see (or document handoff to SP-322 if tied to the new counter).

Prefer fixing the call sites over inventing a second success flag unless required for clarity.

## Dependencies

(none — File Scope disjoint from SP-320; prefer merge order SP-320 then SP-321 if both touch parse helpers via imports only)

## Context to Read First

- Issue #194 Proposed fix items 2–3 + tests c/d
- `.pi/extensions/smart-router/delegate-stream.ts` (`recordDelegateOutcome`)
- `.pi/extensions/smart-router/route-and-delegate.ts` (duplicate record + catch)
- `src/infrastructure/gateway/gateway-dispatch.ts` (`recordOutcome`)

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/delegate-stream.ts`, `.pi/extensions/smart-router/route-and-delegate.ts`, `tests/unit/smart-router-extension.test.ts` |
| May change | `src/infrastructure/gateway/gateway-dispatch.ts`, `tests/unit/gateway-dispatch.test.ts` |
| Must NOT change | `src/infrastructure/delegation/provider-error.ts`, `src/domain/`, `package.json`, `README.md`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts && bash scripts/spine-stet-contract-run.sh default SP-321` |
| fileScopeMustChange | `.pi/extensions/smart-router/delegate-stream.ts`, `.pi/extensions/smart-router/route-and-delegate.ts` |
| fileScopeMustNotChange | `src/infrastructure/delegation/provider-error.ts`, `src/domain/`, `package.json`, `.review/` |
| completionCriteria | Failed unparseable delegation does not reset consecutiveFailures / close half-open; one infra failure → consecutiveFailures === 1; tests green |

## Steps

### Step 0: Preflight

- [ ] Trace every `recordOutcome` call on the delegation success/fail/failover paths
- [ ] Note current half-open success semantics

### Step 1: Fix recording

- [ ] Failed path always passes defined error
- [ ] Remove duplicate failover `recordOutcome`

### Step 2: Testing & Verification

- [ ] Unit: unparseable failure does not reset failures / close half-open (test c)
- [ ] Unit: one infra failure → consecutiveFailures === 1 (test d)
- [ ] Run Contract `testCommand`
- [ ] Call `spine_review_step` after each implementation step

## Do NOT

- Implement model_repeated_failure counter (SP-322)
- Change provider-error parse rules (SP-320)

## Completion Criteria

- [ ] #194 Proposed fix 2–3 + tests c/d met
- [ ] Contract green

## Git Commit Convention

`fix(SP-321): never record failed delegation as success (#194)`
