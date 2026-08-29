# Task: SP-240 — Dependency refresh: pi-ai/pi-coding-agent 0.84.x + lockfile hygiene

**Created:** 2026-08-29
**Size:** S

## Review Level: 1

**Assessment:** Caret-bump `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` from ^0.80.10 to ^0.84.4 (align with running pi 0.84.3), refresh in-range zod/tsx in the lockfile, and raise `engines.node` floor to `>=22.19.0` per pi-ai@0.84.4's requirement.
**Score:** 3/8 — Blast radius: 2 (all runtime consumers of pi-ai compat layer), Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: Partial #154 (EBADENGINE alignment aspect)
- Bucket: chore (release hygiene — v0.19.3 manifest)
- Release: v0.19.3
- Manifest: `spine-tasks/_authoring/release-v0.19.3/manifest.md`
- Related deferred: #162 (better-sqlite3 v13), #163 (toolchain majors) — **out of scope here**

## Mission

Keep the extension tracking the current pi runtime and clear accumulated dependency drift identified in the v0.19.3 dependency audit, without taking major-version risk (those are filed as #162/#163):

| Package | From | To | Note |
|---|---|---|---|
| `@earendil-works/pi-ai` | `^0.80.10` | `^0.84.4` | Runtime dep. Our usage: 15× `pi-ai/compat` imports + 1 root import (`isContextOverflow` in `src/infrastructure/delegation/provider-error.ts`). pi 0.84.3 changelog's breaking change (`GoogleThinkingLevel` → `GoogleApiThinkingLevel` rename) does **not** touch our imports. |
| `@earendil-works/pi-coding-agent` | `^0.80.10` | `^0.84.4` | Dev dep; peer deps are `*` so no constraint conflict |
| `zod` | 4.4.3 (installed) | 4.5.4 | In-range (`^4.4.3`) — lockfile refresh via `npm update zod` |
| `tsx` | 4.23.0 (installed) | 4.23.12 | In-range (`^4.23.0`) — lockfile refresh via `npm update tsx` |
| `engines.node` | `>=22` | `>=22.19.0` | Matches pi-ai@0.84.4 `engines` (`>=22.19.0`); addresses the EBADENGINE complaint in #154 |

**Explicitly out of scope:** `better-sqlite3` 13, `@types/better-sqlite3` 9, `typescript` 7, `vitest` 4, `@types/node` 26 (#162/#163), and any code changes beyond type-fallout fixes.

## Dependencies

- SP-239 — de-flaked suites must land first so full-suite verification of the dependency bump is trustworthy, and so `npm install`/test runs don't race within a wave.

## Context to Read First

- `package.json` — dependencies, devDependencies, peerDependencies (`*`), engines
- `src/infrastructure/delegation/provider-error.ts` — the single root `@earendil-works/pi-ai` import (`isContextOverflow`)
- `rg -n "from '@earendil-works/pi-ai" src .pi/extensions/smart-router` — the 16 import sites (15 compat + 1 root)
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/CHANGELOG.md` — 0.80→0.84 changes (local copy of upstream changelog)
- `scripts/verify-consumer-pack.sh` — consumer-pack gate exercised by `release:check`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json` |
| May change | `package-lock.json`, type-fallout fixes in files that import `@earendil-works/pi-ai*` (expected: none) |
| Must NOT change | `src/domain/**` (unless type-fallout forces it — document if so), `vitest.config.ts`, `tests/**`, `package.json` version field |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/provider-error.test.ts tests/unit/delegate-stream-composed-provider.test.ts tests/unit/schemas.test.ts tests/unit/pi-model-scope.test.ts` |
| fileScopeMustChange | `package.json` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | pi-ai and pi-coding-agent at ^0.84.4 in package.json and 0.84.4 installed; engines.node >=22.19.0; zod/tsx refreshed in lockfile; npm install clean; typecheck + contract tests green; lockfile diff touches only intended packages; no unrelated majors pulled in |

## Steps

### Step 1: Apply version bumps

- [ ] `package.json`: `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` → `^0.84.4`; `engines.node` → `>=22.19.0`
- [ ] `npm install`, then `npm update zod tsx`
- [ ] Verify: `npm ls @earendil-works/pi-ai @earendil-works/pi-coding-agent zod tsx` resolves to 0.84.4 / 0.84.4 / 4.5.4 / 4.23.12
- [ ] Inspect `git diff package-lock.json` — no unrelated packages upgraded in transit (transitive additions from pi-ai 0.84.x are fine; flag any runtime **major** transitive bumps in STATUS)

### Step 2: Fix fallout (expected: none)

- [ ] `npm run typecheck` — fix any errors at the 16 pi-ai import sites if the compat layer shifted
- [ ] If a compat import moved/renamed, prefer the compat-layer equivalent over reaching into pi-ai internals

### Step 3: Testing and verification

- [ ] Contract `testCommand` green (provider-error = root import; delegate-stream-composed-provider = compat usage; schemas = zod; pi-model-scope = module resolution against installed packages)
- [ ] Full `npm test` once (suites are de-flaked as of SP-239)
- [ ] `npm run release:consumer-pack` green (installs the pack against bumped deps)

## Do NOT

- Pull any major-version bump: better-sqlite3 13 / @types/better-sqlite3 9 / typescript 7 / vitest 4 / @types/node 26 (#162/#163)
- Touch `tests/**`, `vitest.config.ts`, routing/pinning logic, or telemetry
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version (release operator does this at publish gate)

## Git Commit Convention

- `chore(SP-240): refresh pi-ai/pi-coding-agent to 0.84.4, engines floor 22.19, lockfile hygiene`

## Completion Criteria

- [ ] All five version changes from the Mission table applied and verified installed
- [ ] Typecheck, contract tests, full suite, consumer-pack gate green
- [ ] Lockfile diff scoped to intended packages
- [ ] #154 remains open (this is `Partial:` — full alignment may track CI matrix work)
