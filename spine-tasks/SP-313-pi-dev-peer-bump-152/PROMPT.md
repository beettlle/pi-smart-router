# Task: SP-313 — bump dev pi packages to ^1.5.2

**Created:** 2026-11-15
**Size:** S

## Review Level: 1

**Assessment:** Peer drift — lockfile has pi-ai / pi-coding-agent 1.4.0 while npm latest is 1.5.2; theme-adjacent because 1.5.x registry exposes K3.1 / Gemini 4 fleet ids.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- Release: v1.4.0
- Bucket: dependency hygiene (peer drift)

## Mission

Bump `devDependencies` `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` from `^1.3.0` to `^1.5.2`. Peers stay `*`. Refresh the lockfile. Fix any type drift or test breakage with the smallest change that preserves behavior.

Do not raise `pi.minPiVersion` unless a 1.5.x-only API is now required; if raised, record why in STATUS. Do not bump unrelated packages (majors deferred to #162 / #163 / #157).

## Dependencies

- None

## Context to Read First

- `package.json`
- `spine-tasks/SP-297-pi-dev-peer-bump/PROMPT.md` (prior peer-bump pattern)
- `.pi/extensions/smart-router/pi-model-scope.ts`
- `src/infrastructure/delegation/provider-error.ts`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** npm registry access

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json`, `package-lock.json` |
| May change | `.pi/extensions/smart-router/**`, `src/**`, `tests/**` (type-drift fixes only) |
| Must NOT change | `src/config/pi-model-mapper.ts`, `config/benchmark-profiles.json`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm run lint && SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1 npm run release:check && bash scripts/spine-stet-contract-run.sh lenient SP-313` |
| fileScopeMustChange | `package.json`, `package-lock.json` |
| fileScopeMustNotChange | `src/config/pi-model-mapper.ts`, `config/benchmark-profiles.json`, `.review/` |
| completionCriteria | dev pi-ai / pi-coding-agent at ^1.5.2; typecheck/lint/release:check green; minPiVersion decision recorded |

## Steps

### Step 0: Preflight

- [ ] `npm view @earendil-works/pi-ai version` and `@earendil-works/pi-coding-agent version`; confirm 1.5.2 is latest stable

### Step 1: Implementation

- [ ] Bump both devDependencies to `^1.5.2`; `npm install`
- [ ] Fix typecheck/test drift (record each fix in STATUS)

### Step 2: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Record `pi.minPiVersion` decision in STATUS

## Do NOT

- Add host-provided packages to `dependencies`
- Bump better-sqlite3 / typescript / vitest / eslint majors

## Completion Criteria

- [ ] Dev pi packages at ^1.5.2
- [ ] Contract green; minPiVersion decision recorded
