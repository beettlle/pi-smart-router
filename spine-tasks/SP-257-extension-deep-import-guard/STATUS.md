# SP-257 — ESLint/CI guard blocking extension deep imports — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-09-05
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Confirm zero deep imports — 0 deep `../../../src/<subpath>` imports; 31 facade `../../../src/index.js` refs (intended pattern per SP-256 STATUS)
- [x] Read .eslintrc.cjs — legacy config, ESLint 8.57.1, existing override for `.pi/extensions/**/*.ts`; `npm run lint` runs `eslint . --ext .ts` (extension files included, not ignored); CI runs `npm run lint`

## Step 1: Restricted imports guard

**Status:** Complete

- [x] Add rule — `no-restricted-imports` (error) on `.pi/extensions/**/*.ts` banning `../../../src/*/**` and `../../../src/!(index).js` (facade `../../../src/index.js` still allowed; covers `import` and `export ... from`)
- [x] Prove fail-closed then clean — temp probe file with deep `import` + `export ... from` → 2 errors, exit 1; facade-only probe → exit 0; probe removed

## Step 2: Testing & Verification

**Status:** Complete

- [x] lint + typecheck green — `npm run lint` exit 0, `npm run typecheck` exit 0; `npm test` 121 files / 2164 tests passed
- [x] CI covers guard — `.github/workflows/ci.yml` Lint job runs `npm run lint`; extension tree now re-included via negated ignorePatterns so the rule fires in CI

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-05 | 1 | plan | SKIPPED (engine-owned per SP-195; `spine_review_step` returned skipped) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-05 | **Critical:** `.pi/**` was never linted — ESLint 8 ignores dot-directories by default, so `eslint . --ext .ts` silently skipped `.pi/extensions/**` (existing `no-explicit-any` override for extensions also never fired) | Added negated ignorePatterns (`!.pi/`, re-ignore `.pi/loops/`, `.pi/tasks/`) so the guard actually runs in lint/CI |
| 2026-09-05 | First real lint of extension surfaced pre-existing `no-constant-condition` error on idiomatic `while (true)` failover loop (route-and-delegate.ts:472) | Set `checkLoops: false` in extension override (config-only; extension runtime logic is must-not-change) |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-05 | Step 0 complete | SP-256 clean: 0 deep subpath imports, 31 facade refs; read `.eslintrc.cjs`, ci.yml, package.json lint script |
| 2026-09-05 | Step 1 complete | Guard added; fail-closed proven with temp probe (2 errors, exit 1); facade probe exit 0; probe removed |
| 2026-09-05 | Step 2 complete | lint + typecheck exit 0; npm test 121 files / 2164 tests green; CI Lint job covers guard |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

