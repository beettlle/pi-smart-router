# Task: SP-048 — ESLint and CI Gate

**Created:** 2026-07-04
**Size:** M

## Review Level: 1

**Assessment:** Fix 19 ESLint errors and add GitHub Actions CI workflow.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#17
- Bucket: bug

## Mission

Brutal audit verification found `npm run lint` fails with 19 ESLint errors while typecheck and tests pass. No CI workflow exists. Fix all lint errors and add a GitHub Actions gate.

Tasks:
- Fix all 19 ESLint errors (`npm run lint` clean)
  - Unused vars: `router-pipeline.ts` (`_request`), `sqlite-store.ts` (`firstError` in corrupt-DB recovery — preserve error context)
  - `no-regex-spaces` in `triage-engine.ts`
  - Unused imports in test files
- Add `.github/workflows/ci.yml` running on push/PR: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`
- Optionally update spine `buildGate` in `.spine/spine-config.json` to include lint

## Dependencies

- SP-046

## Context to Read First

- `package.json` — lint script
- `eslint.config.js` or equivalent
- `src/domain/pipeline/router-pipeline.ts`
- `src/domain/triage/triage-engine.ts`
- `src/infrastructure/store/sqlite-store.ts`
- `.spine/spine-config.json` — buildGate config

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/triage/triage-engine.ts`, `src/infrastructure/store/sqlite-store.ts`, `.github/workflows/ci.yml` |
| May change | `tests/**`, `.spine/spine-config.json`, `package.json` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm run lint && npm test` |
| fileScopeMustChange | `.github/workflows/ci.yml` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | `npm run lint` exits 0; CI runs typecheck, lint, and test on push/PR to main. |

## Steps

### Step 1: Fix production ESLint errors

- [ ] Fix unused `_request` in `router-pipeline.ts` (use or remove with intent)
- [ ] Fix `no-regex-spaces` in `triage-engine.ts`
- [ ] Fix `firstError` unused var in `sqlite-store.ts` — preserve error context in corrupt-DB recovery

### Step 2: Fix test lint errors

- [ ] Remove unused imports in failing test files
- [ ] Confirm `npm run lint` exits 0

### Step 3: Add CI workflow

- [ ] Create `.github/workflows/ci.yml` with `npm ci`, typecheck, lint, test on push/PR
- [ ] Optionally add lint to spine buildGate in `.spine/spine-config.json`

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm run lint && npm test`
- [ ] Run `npm run coverage:check` if application code changed

## Completion Criteria

- [ ] All steps complete
- [ ] `npm run lint` clean locally
- [ ] CI workflow present and valid

## Git Commit Convention

- `fix(SP-048): description`

## Do NOT

- Change routing behavior in `router-pipeline.ts` beyond lint fixes
- Modify extension wiring (SP-049)

---

## Amendments (Added During Execution)
