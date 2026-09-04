# Task: SP-255 — Public package facade exports for extension needs

**Created:** 2026-09-04
**Size:** S

## Review Level: 1

**Assessment:** Expand package entrypoint exports so the pi extension can stop deep-importing `src/**` internals.
**Score:** 3/8 — Blast radius: 2 (public API surface), Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#149
- Bucket: feature
- Partial: #149 (import migration SP-256; lint/CI guard SP-257)
- Release: v0.22.0
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`

## Mission

Partial #149 — define a **stable public facade** on the package entrypoint for everything the pi extension currently needs from deep `../../../src/` imports:

1. Inventory current deep imports under `.pi/extensions/smart-router/**` (expect ~70–80).
2. Expand `src/index.ts` (and a thin `src/api/facade.ts` or equivalent **only if** `index.ts` would bloat) so required types/functions are re-exported from the package `exports` surface (`pi-smart-router`).
3. Prefer expanding `createRouter` / existing exports over inventing a parallel `createSmartRouterFacade` unless a new factory is clearly clearer — document the chosen name in STATUS.
4. Add focused unit/type tests that import facade symbols from the package entry (or `src/index.ts`) — **do not** mass-migrate extension files here (SP-256).
5. Do **not** add ESLint restricted-imports yet (SP-257). Do **not** edit README theme docs (SP-262).

## Dependencies

- **None**

## Context to Read First

- Issue #149 body
- `src/index.ts` — current public exports
- `.pi/extensions/smart-router/**` — deep import sites (`rg "from '../../../src/"`)
- `package.json` `exports` / `main` / `types`
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/index.ts` |
| May change | `src/api/facade.ts`, `tests/unit` facade/export tests, `package.json` exports map only if required for new entry path |
| Must NOT change | `.pi/extensions/smart-router` (SP-256), `.eslintrc.cjs` (SP-257), `README.md` (SP-262), `src/domain/matching/embedding-provider.ts` (SP-259/260), `package.json` version field, `config/release-gates.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/index-exports.test.ts` |
| fileScopeMustChange | `src/index.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router`, `README.md`, `package.json` |
| completionCriteria | Facade exports cover inventoried extension needs; typecheck green; extension tree unchanged; STATUS lists inventory count + chosen facade shape |

## Steps

### Step 0: Preflight

- [ ] Inventory deep `../../../src/` imports under `.pi/extensions/smart-router`
- [ ] Map each import to a planned public export

### Step 1: Facade exports

- [ ] Re-export required symbols from `src/index.ts` (optional thin facade module)
- [ ] Keep existing public API stable; additive exports only
- [ ] Record chosen facade shape in STATUS Discoveries

### Step 2: Testing & Verification

- [ ] Add `tests/unit/index-exports.test.ts` (or extend existing) importing facade symbols
- [ ] Contract `testCommand` green
- [ ] Confirm zero edits under `.pi/extensions/smart-router`

## Completion Criteria

- [ ] Public facade ready for SP-256 migration; Partial #149

## Do NOT

- Migrate extension imports (SP-256)
- Add ESLint/CI deep-import guards (SP-257)
- Edit README (SP-262)
- Pin ONNX digests or change dispose (SP-259/260)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-255): public package facade exports (#149)`

## Amendments

- None
