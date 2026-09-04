# Task: SP-257 — ESLint/CI guard blocking extension deep imports

**Created:** 2026-09-04
**Size:** S

## Review Level: 1

**Assessment:** Fail closed on new deep `src/` imports from the pi extension via lint and CI.
**Score:** 3/8 — Blast radius: 1 (tooling), Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#149
- Bucket: feature
- Closes: #149
- Release: v0.22.0
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`

## Mission

Close #149 — prevent regression of deep extension imports:

1. Add ESLint `no-restricted-imports` (or equivalent project check) so `.pi/extensions/smart-router/**` cannot import `../../../src/**` (and sibling deep patterns).
2. Ensure `npm run lint` and CI fail on a new deep import.
3. Confirm the tree is already clean after SP-256 before enabling the rule.
4. Do **not** migrate ESLint to flat config (#157). Do **not** edit README narrative (SP-262).

## Dependencies

- **SP-256**

## Context to Read First

- `.eslintrc.cjs`
- SP-256 STATUS — confirmed zero deep imports
- CI workflow that runs lint

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.eslintrc.cjs` |
| May change | `.github/workflows/ci.yml`, scripts that enforce the check |
| Must NOT change | Extension runtime logic except stray import fix, `vitest.config.ts` (SP-258), `src/domain/matching/embedding-provider.ts` (SP-259/260), `README.md` (SP-262), `package.json` version field |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run lint && npm run typecheck` |
| fileScopeMustChange | `.eslintrc.cjs` |
| fileScopeMustNotChange | `README.md`, `package.json`, `src/domain/matching/embedding-provider.ts` |
| completionCriteria | Lint fails on deep extension→src import; Closes #149; CI path covered |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-256 left zero deep imports
- [ ] Read `.eslintrc.cjs` override patterns for `.pi/extensions`

### Step 1: Restricted imports guard

- [ ] Add restricted-imports (or equivalent) for extension deep `src/` paths
- [ ] Prove failure with a temporary deep import then remove it

### Step 2: Testing & Verification

- [ ] Contract `testCommand` green on clean tree
- [ ] Confirm CI lint job covers the guard

## Completion Criteria

- [ ] Guard landed; Closes #149

## Do NOT

- Migrate to ESLint 9 flat config (#157)
- Change coverage include (SP-258)
- Edit README theme docs (SP-262)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `chore(SP-257): guard extension deep imports (#149)`

## Amendments

- None
