# Task: SP-297 — bump dev pi packages to ^1.3.0

**Created:** 2026-10-19
**Size:** S

## Review Level: 1

**Assessment:** Dependency hygiene — typecheck and tests against the pi version users run (1.3.0) instead of 0.85.1.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#176
- Release: v1.2.1
- Bucket: dependency hygiene (peer drift)
- Partial: #176

## Mission

Bump `devDependencies` `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` from `^0.85.1` to `^1.3.0`. Peers stay `*`. Fix any type drift surfaced by `npm run typecheck` and any test breakage with the smallest change that preserves behavior on both 0.85.x and 1.x hosts.

Known 1.x API facts (verified 2026-10-19 against pi 1.3.0):

- `@earendil-works/pi-ai` still exports `./compat` and `isContextOverflow`.
- `resolveModelScope(patterns, modelRuntime, options)` in `dist/core/model-resolver.js` calls `await modelRuntime.getAvailable(undefined, options)`; our `ModelRegistry` argument (sync `getAvailable()`) stays compatible. It is not on the public index export (only `resolveModelScopeWithDiagnostics`); keep the existing `pi-model-scope.ts` fallback.

Do not raise `pi.minPiVersion` unless a 1.x-only API is now required; if raised, record why in STATUS.

## Dependencies

- SP-296

## Context to Read First

- `package.json`
- `.pi/extensions/smart-router/pi-model-scope.ts`
- `.pi/extensions/smart-router/fleet-bootstrap.ts`
- `src/infrastructure/delegation/provider-error.ts`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** npm registry access

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json`, `package-lock.json` |
| May change | `.pi/extensions/smart-router/**`, `src/**`, `tests/**` (type-drift fixes only) |
| Must NOT change | `src/config/pi-model-mapper.ts`, `src/infrastructure/pricing/price-broker.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm run lint && npm test` |
| fileScopeMustChange | `package.json`, `package-lock.json` |
| fileScopeMustNotChange | `src/config/pi-model-mapper.ts`, `src/infrastructure/pricing/price-broker.ts` |
| completionCriteria | dev pi-ai / pi-coding-agent at ^1.3.0; typecheck, lint, and full unit suite green; minPiVersion decision recorded |

## Steps

### Step 0: Preflight

- [ ] `npm view @earendil-works/pi-ai version` and `@earendil-works/pi-coding-agent version`; confirm 1.3.x is latest stable

### Step 1: Implementation

- [ ] Bump both devDependencies to `^1.3.0`; `npm install`
- [ ] Fix typecheck/test drift (record each fix in STATUS)

### Step 2: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Record `pi.minPiVersion` decision in STATUS

## Do NOT

- Add host-provided packages to `dependencies`
- Bump unrelated packages (majors are deferred to #162 / #163 / #157)

## Completion Criteria

- [ ] Dev pi packages at ^1.3.0
- [ ] `npm run typecheck`, `npm run lint`, `npm test` exit 0
