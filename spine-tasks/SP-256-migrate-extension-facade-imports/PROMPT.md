# Task: SP-256 — Migrate extension deep src imports to facade

**Created:** 2026-09-04
**Size:** S

## Review Level: 1

**Assessment:** Rewrite pi extension modules to import from the public package facade instead of deep `src/` paths.
**Score:** 4/8 — Blast radius: 3 (extension runtime), Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#149
- Bucket: feature
- Partial: #149 (lint/CI guard is SP-257)
- Release: v0.22.0
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`

## Mission

Partial #149 — migrate `.pi/extensions/smart-router` off deep `../../../src/` imports onto the SP-255 facade:

1. Replace deep imports with package entry / facade imports (`pi-smart-router` or documented relative package path that resolves to public exports — prefer the same pattern already used for public package consumers).
2. Target **0** matches for `from '../../../src/` (and equivalent depth variants) under `.pi/extensions/smart-router`.
3. Preserve runtime behavior; no intentional routing policy changes.
4. Extension/unit tests that cover setup/route paths must stay green.
5. Do **not** add ESLint restricted-imports yet (SP-257). Do **not** expand facade further unless a missing export blocks migration — if blocked, add the minimal export and note in STATUS.

## Dependencies

- **SP-255**

## Context to Read First

- SP-255 STATUS Discoveries — facade inventory + export names
- `.pi/extensions/smart-router` import sites
- `src/index.ts` public surface after SP-255
- Existing extension tests under `tests/` that load the extension

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router` |
| May change | `src/index.ts`, `tests` |
| Must NOT change | `.eslintrc.cjs` (SP-257), `vitest.config.ts` (SP-258), `src/domain/matching/embedding-provider.ts` (SP-259/260), `README.md` (SP-262), `package.json` version field |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router` |
| fileScopeMustNotChange | `README.md`, `package.json`, `vitest.config.ts` |
| completionCriteria | Zero deep `../../../src/` imports under extension; typecheck + tests green; Partial #149 |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-255 facade exports cover inventory
- [ ] Baseline deep-import count via ripgrep

### Step 1: Migrate imports

- [ ] Rewrite extension modules to facade/package imports
- [ ] Minimal facade gap-fills only if required
- [ ] Re-check deep-import count → 0

### Step 2: Testing & Verification

- [ ] Contract `testCommand` green
- [ ] Record before/after import counts in STATUS

## Completion Criteria

- [ ] Extension uses facade only; Partial #149 ready for SP-257 guard

## Do NOT

- Add ESLint/CI guards (SP-257)
- Change coverage thresholds (SP-258)
- Edit README theme docs (SP-262)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `refactor(SP-256): migrate extension imports to facade (#149)`

## Amendments

- None
